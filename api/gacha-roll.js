import { MongoClient } from "mongodb";
import { randomUUID, randomBytes } from "crypto";
import { getConfig, effectiveMax, sessionToken, allowTokenLogin } from "./_shared.js";

const uri = process.env.MONGODB_URI;
const DB_NAME = "miwa";
const COLLECTION = "gachadata";
const DOC_ID = "main";
const PENDING_COLLECTION = "pendingRolls";

let cachedClient = null;

async function getClient() {
  if (cachedClient) {
    try {
      await cachedClient.db("admin").command({ ping: 1 });
      return cachedClient;
    } catch (e) {
      try { await cachedClient.close(); } catch (_) {}
      cachedClient = null;
    }
  }
  cachedClient = new MongoClient(uri);
  await cachedClient.connect();
  return cachedClient;
}

/* FIX: index TTL di collection pendingRolls — Mongo otomatis hapus
   dokumen begitu expiresAt lewat, jadi nggak numpuk sampah selamanya.
   createIndex idempotent (aman dipanggil berkali-kali, nggak error kalau
   index dengan spec sama udah ada), tapi tetap kita cache biar nggak
   ngirim command index setiap request. */
let pendingIndexEnsured = false;
async function ensurePendingIndex(pendingCol) {
  if (pendingIndexEnsured) return;
  await pendingCol.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  pendingIndexEnsured = true;
}

const ALLOWED_GAMES = new Set([
  "reelsgird","roulette","coinflip","horserace",
  "airplane","blackjack","plinko","mines","wheel","hilo"
]);
const PREMIUM_ONLY = new Set(["airplane","mines"]);

/* Batas main per hari (per token, per game) untuk game yang hasil detailnya
   ditentukan di sisi klien (rawan exploit). Reset tiap 00:00 WIB. */
const DAILY_LIMIT = { airplane: 10, hilo: 10, mines: 10, plinko: 10 };
const DAILY_COLLECTION = "dailyRolls";
let dailyIndexEnsured = false;
async function ensureDailyIndex(col) {
  if (dailyIndexEnsured) return;
  await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  dailyIndexEnsured = true;
}
/* Tanggal WIB (UTC+7) format YYYY-MM-DD */
function wibDateKey(now = Date.now()) {
  return new Date(now + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

/* Roll TTL — client harus pakai dalam 5 menit atau expired */
const ROLL_TTL_MS = 5 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    if (!uri) {
      return res.status(500).json({ error: "MONGODB_URI tidak ditemukan" });
    }

    let { token, game, bet } = req.body || {};

    /* Identitas dari cookie sesi; token di body hanya dipakai bila login lama masih diizinkan */
    const sess = await sessionToken(req);
    if (sess) token = sess.token;
    else if (token === "SESSION" || !allowTokenLogin()) {
      return res.status(401).json({ error: "Belum masuk. Masuk lewat verifikasi WhatsApp.", needLogin: true });
    }

    if (!token || typeof token !== "string") {
      return res.status(400).json({ error: "token tidak valid" });
    }
    if (!ALLOWED_GAMES.has(game)) {
      return res.status(400).json({ error: "game tidak valid" });
    }
    if (typeof bet !== "number" || !Number.isInteger(bet) || bet < 1) {
      return res.status(400).json({ error: "bet tidak valid" });
    }

    const client = await getClient();
    const col        = client.db(DB_NAME).collection(COLLECTION);
    const pendingCol = client.db(DB_NAME).collection(PENDING_COLLECTION);
    await ensurePendingIndex(pendingCol);

    const tokenUpper = token.toUpperCase();

    const doc = await col.findOne(
      { _id: DOC_ID, "tokens.token": tokenUpper },
      { projection: { "tokens.$": 1 } }
    );

    if (!doc || !doc.tokens || !doc.tokens[0]) {
      return res.status(404).json({ error: "Token tidak ditemukan" });
    }

    const tokenData = doc.tokens[0];

    if (tokenData.banned) {
      return res.status(403).json({ error: "Token di-ban oleh Owner", banned: true });
    }

    const cfg = await getConfig();
    if (cfg.maintenance.on) {
      return res.status(503).json({ error: cfg.maintenance.msg || "Sedang maintenance, coba lagi nanti" });
    }
    const gcfg = cfg.games[game];
    if (!gcfg.enabled) {
      return res.status(403).json({ error: "Game ini sedang dinonaktifkan" });
    }
    if (bet < gcfg.minBet) {
      return res.status(400).json({ error: `Min bet game ini: ${gcfg.minBet} bet` });
    }
    const maxBetAllowed = effectiveMax(gcfg, tokenData.isPremium);
    if (bet > maxBetAllowed) {
      return res.status(400).json({ error: `Max bet game ini: ${maxBetAllowed} bet` });
    }

    if (tokenData.balance < bet) {
      return res.status(400).json({ error: "Saldo tidak cukup" });
    }

    if (gcfg.premiumOnly && !tokenData.isPremium) {
      return res.status(403).json({ error: "Game ini khusus token Premium" });
    }

    /* Batas harian: increment atomik. Kalau dokumen hari ini sudah mencapai
       limit, filter { count < limit } tidak cocok → upsert coba insert _id yang
       sama → E11000 duplicate key → artinya limit tercapai. */
    const dailyLimit = gcfg.dailyLimit;
    if (dailyLimit) {
      const dailyCol = client.db(DB_NAME).collection(DAILY_COLLECTION);
      await ensureDailyIndex(dailyCol);
      const dateKey = wibDateKey();
      const dailyId = `${tokenUpper}|${game}|${dateKey}`;
      try {
        await dailyCol.updateOne(
          { _id: dailyId, count: { $lt: dailyLimit } },
          {
            $inc: { count: 1 },
            $setOnInsert: { token: tokenUpper, game, date: dateKey, expiresAt: new Date(Date.now() + 48 * 3600 * 1000) },
          },
          { upsert: true }
        );
      } catch (e) {
        if (e && e.code === 11000) {
          return res.status(429).json({
            error: `Batas harian ${game} tercapai (${dailyLimit}×/hari). Reset 00:00 WIB.`,
          });
        }
        throw e;
      }
    }

    /* Roll hasil di server pakai crypto.randomBytes — client tidak bisa
       memanipulasi ini karena tidak pernah dikirim ke browser mentah-mentah. */
    const winChance = tokenData.isPremium ? 0.45 : 0.35;
    const rand      = randomBytes(4).readUInt32BE(0) / 0xFFFFFFFF; // [0, 1)
    const result    = rand < winChance ? "win" : "lose";

    const rollId = randomUUID();
    const now    = Date.now();

    /* FIX UTAMA: pending roll disimpan permanen di MongoDB (bukan Map
       in-memory yang hilang tiap cold start / beda instance Vercel).
       Pakai rollId sebagai _id — kalau somehow collision, insertOne akan
       throw duplicate key error dan otomatis gagal (sangat tidak mungkin
       terjadi karena randomUUID, tapi aman by design). */
    await pendingCol.insertOne({
      _id:        rollId,
      token:      tokenUpper,
      game,
      bet,
      result,
      used:       false,
      createdAt:  new Date(now),
      expiresAt:  new Date(now + ROLL_TTL_MS),
    });

    return res.status(200).json({ result, rollId });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
