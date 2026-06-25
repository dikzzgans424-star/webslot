import { MongoClient } from "mongodb";
import { randomUUID, randomBytes } from "crypto";

const uri = process.env.MONGODB_URI;
const DB_NAME = "miwa";
const COLLECTION = "gachadata";
const DOC_ID = "main";

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

const ALLOWED_GAMES = new Set([
  "reelsgird","roulette","coinflip","horserace",
  "airplane","blackjack","plinko","mines","wheel","hilo"
]);
const PREMIUM_ONLY  = new Set(["airplane","mines"]);

/* Roll TTL — client harus pakai dalam 5 menit atau expired */
const ROLL_TTL_MS = 5 * 60 * 1000;

/* In-memory pending rolls: rollId → { result, token, game, bet, expiresAt }
   PERINGATAN UNTUK VERCEL: serverless function di Vercel TIDAK menjamin
   instance yang sama dipakai antar-request (bisa cold start baru kapan saja,
   beda region/concurrency = beda memory). Jadi _pendingRolls di memory ini
   TIDAK reliable untuk verifikasi cross-request di /api/gacha-update.
   Untuk production yang benar, simpan pending roll di koleksi MongoDB
   terpisah (misal "pendingRolls") dengan TTL index, bukan di memory.
   Saat ini gacha-update.js juga belum benar-benar query _pendingRolls ini
   (lihat catatan di file itu) — jadi value ini sebatas referensi rollId
   yang dikembalikan ke client, validasi penuh masih perlu ditambahkan. */
const _pendingRolls = new Map();

function cleanExpiredRolls() {
  const now = Date.now();
  for (const [id, roll] of _pendingRolls) {
    if (roll.expiresAt < now) _pendingRolls.delete(id);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    if (!uri) {
      return res.status(500).json({ error: "MONGODB_URI tidak ditemukan" });
    }

    const { token, game, bet } = req.body || {};

    /* Validasi input dasar */
    if (!token || typeof token !== "string") {
      return res.status(400).json({ error: "token tidak valid" });
    }
    if (!ALLOWED_GAMES.has(game)) {
      return res.status(400).json({ error: "game tidak valid" });
    }
    if (typeof bet !== "number" || !Number.isInteger(bet) || bet < 1) {
      return res.status(400).json({ error: "bet tidak valid" });
    }

    /* Cek token di DB dan ambil isPremium + balance */
    const client = await getClient();
    const col    = client.db(DB_NAME).collection(COLLECTION);

    const doc = await col.findOne(
      { _id: DOC_ID, "tokens.token": token.toUpperCase() },
      { projection: { "tokens.$": 1 } }
    );

    if (!doc || !doc.tokens || !doc.tokens[0]) {
      return res.status(404).json({ error: "Token tidak ditemukan" });
    }

    const tokenData = doc.tokens[0];

    /* Cek saldo cukup */
    if (tokenData.balance < bet) {
      return res.status(400).json({ error: "Saldo tidak cukup" });
    }

    /* Cek akses premium */
    if (PREMIUM_ONLY.has(game) && !tokenData.isPremium) {
      return res.status(403).json({ error: "Game ini khusus token Premium" });
    }

    /* Roll hasil — dilakukan di server menggunakan crypto.randomBytes
       untuk memastikan RNG tidak bisa dimanipulasi client */
    const winChance = tokenData.isPremium ? 0.45 : 0.35;
    const rand      = randomBytes(4).readUInt32BE(0) / 0xFFFFFFFF; // [0, 1)
    const result    = rand < winChance ? "win" : "lose";

    /* Buat rollId unik dan simpan pending roll */
    const rollId = randomUUID();
    cleanExpiredRolls();
    _pendingRolls.set(rollId, {
      result,
      token:     token.toUpperCase(),
      game,
      bet,
      expiresAt: Date.now() + ROLL_TTL_MS,
    });

    return res.status(200).json({ result, rollId });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/* Export untuk dipakai gacha-update.js saat verifikasi rollId. */
export { _pendingRolls };
