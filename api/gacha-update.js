import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const INTERNAL_KEY = process.env.INTERNAL_API_KEY; // secret key khusus bot WA
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

/* FIX: fungsi ini dipanggil di beberapa tempat (mode buat token baru &
   sync isPremium) tapi sebelumnya tidak pernah didefinisikan, jadi akan
   throw ReferenceError tiap kali mode itu dipanggil. */
function isInternalRequest(req) {
  if (!INTERNAL_KEY) return false;
  const incomingKey = String(req.headers["x-internal-key"] || "").trim();
  return !!incomingKey && incomingKey === INTERNAL_KEY;
}

const MAX_ABS_CHANGE = 1000000000000000;

/* Daftar field yang diizinkan ada di historyEntry — tolak field asing */
const ALLOWED_HISTORY_FIELDS = new Set(["game", "bet", "result", "change", "at"]);
const ALLOWED_GAMES      = new Set(["reelsgird","roulette","coinflip","horserace","airplane","blackjack","plinko","mines"]);
const ALLOWED_BOT_GAMES  = new Set(["deposit","withdraw"]); // transaksi bot, bukan game web
const ALLOWED_RESULTS = new Set(["win", "lose"]);

/* MAX multiplier per game — dipakai server untuk validasi change positif.
   Harus sinkron dengan MAX_GAME_MULTIPLIER di app.js. */
const MAX_GAME_MULTIPLIER = {
  reelsgird: 2,
  roulette:  2,
  coinflip:  2,
  horserace: 2,
  blackjack: 2,
  airplane:  8.5 * 0.95,
  plinko:    8,
  mines:     15,
};

function sanitizeHistoryEntry(entry, token) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;

  /* Tolak field yang tidak dikenal */
  for (const key of Object.keys(entry)) {
    if (!ALLOWED_HISTORY_FIELDS.has(key)) return null;
  }

  const { game, bet, result, change, at } = entry;

  if (!ALLOWED_GAMES.has(game) && !ALLOWED_BOT_GAMES.has(game)) return null;
  if (!ALLOWED_RESULTS.has(result))       return null;
  if (typeof bet !== "number" || bet < 1 || !Number.isInteger(bet)) return null;
  if (typeof change !== "number" || !Number.isFinite(change))       return null;
  if (typeof at !== "number" || !Number.isFinite(at))               return null;

  /* Validasi konsistensi change vs result.
     Transaksi bot (deposit/withdraw) punya aturan sendiri:
     - deposit  → result 'win',  change == +bet (tambah penuh)
     - withdraw → result 'lose', change == -bet (kurang penuh)
     Game web validasi seperti sebelumnya. */
  if (ALLOWED_BOT_GAMES.has(game)) {
    if (game === "deposit"  && (result !== "win"  || change !== bet))   return null;
    if (game === "withdraw" && (result !== "lose" || change !== -bet))  return null;
  } else {
    if (result === "win" && change <= 0) return null;
    if (result === "win") {
      const maxChange = Math.ceil(bet * ((MAX_GAME_MULTIPLIER[game] ?? 2) - 1));
      if (change > maxChange) return null;
    }
    if (result === "lose") {
      if (game === "plinko") {
        /* FIX: Plinko beda dari game lain — slot "kalah" selalu mendarat
           di 0.5x (lihat games/plinko.js, _pickTargetSlot lose-branch +
           MULTS[8] = 0.5), bukan 0x. Jadi rugi cuma SEBAGIAN bet, bukan
           penuh. change valid di rentang (-bet, 0), bukan harus persis -bet. */
        if (change >= 0 || change < -bet) return null;
      } else {
        if (change !== -bet) return null;
      }
    }
  }

  /* Timestamp tidak boleh jauh di masa depan (toleransi 60 detik) */
  if (at > Date.now() + 60_000) return null;

  return { game, bet, result, change, at };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }
    if (!uri) {
      return res.status(500).json({ error: "MONGODB_URI tidak ditemukan" });
    }

    const body = req.body || {};
    const { token, owner, change, historyEntry, newToken, setIsPremium, rollId } = body;

    const client = await getClient();
    const col = client.db(DB_NAME).collection(COLLECTION);

    /* ════════════════════════════════════════
       MODE A — BUAT TOKEN BARU (bot WA)
    ════════════════════════════════════════ */
    if (newToken) {
      /* Hanya bot internal yang boleh buat token baru */
      if (!isInternalRequest(req)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      if (!owner || !newToken.token) {
        return res.status(400).json({ error: "Data token baru tidak lengkap" });
      }

      const result = await col.updateOne(
        { _id: DOC_ID, "tokens.owner": { $ne: owner } },
        { $push: { tokens: newToken } },
        { upsert: true }
      );

      if (result.modifiedCount === 0 && result.upsertedCount === 0) {
        return res.status(409).json({ error: "Owner ini sudah punya token kasino" });
      }

      return res.status(200).json({ success: true, token: newToken });
    }

    /* ════════════════════════════════════════
       MODE C — SYNC STATUS PREMIUM (bot WA)
    ════════════════════════════════════════ */
    if (typeof setIsPremium === "boolean") {
      /* Hanya bot internal yang boleh update isPremium */
      if (!isInternalRequest(req)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      if (!token && !owner) {
        return res.status(400).json({ error: "Butuh token atau owner" });
      }
      const baseMatch   = token ? { token } : { owner };
      const arrayFilter = token ? { "elem.token": token } : { "elem.owner": owner };

      const updatedDoc = await col.findOneAndUpdate(
        { _id: DOC_ID, tokens: { $elemMatch: baseMatch } },
        { $set: { "tokens.$[elem].isPremium": setIsPremium } },
        { arrayFilters: [arrayFilter], returnDocument: "after" }
      );

      if (!updatedDoc) {
        return res.status(409).json({ error: "Token/owner tidak ditemukan" });
      }

      return res.status(200).json({ success: true, isPremium: setIsPremium });
    }

    /* ════════════════════════════════════════
       MODE B — APPLY DELTA SALDO
    ════════════════════════════════════════ */
    if (!token && !owner) {
      return res.status(400).json({ error: "Butuh token atau owner" });
    }

    /* FIX: Tolak change = 0 (tidak ada yang berubah, tapi bisa dipakai
       untuk spam push history kosong ke DB) */
    if (typeof change !== "number" || !Number.isFinite(change) || change === 0) {
      return res.status(400).json({ error: "change tidak valid" });
    }
    if (Math.abs(change) > MAX_ABS_CHANGE) {
      return res.status(400).json({ error: "Perubahan saldo di luar batas wajar" });
    }

    /* FIX: Validasi rollId — pastikan hasil yang dikirim cocok dengan
       roll yang sudah dikeluarkan server. Ini mencegah client mengirim
       change positif palsu tanpa pernah menjalani game.
       Catatan: karena serverless functions bisa multi-instance, pending
       rolls idealnya disimpan di MongoDB dengan TTL index, bukan hanya
       di memory seperti di /api/gacha-roll.js saat ini. Validasi di
       bawah ini baru memastikan formatnya UUID valid — belum mencocokkan
       isi roll yang sebenarnya. Untuk production penuh, tambahkan koleksi
       MongoDB "pendingRolls" dan query rollId tersebut di sini. */
    if (token && historyEntry) {
      if (!rollId || typeof rollId !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(rollId)) {
        return res.status(400).json({ error: "rollId tidak valid" });
      }
    }

    /* FIX: Validasi dan sanitasi historyEntry sebelum disimpan */
    let safeHistoryEntry = null;
    if (historyEntry) {
      safeHistoryEntry = sanitizeHistoryEntry(historyEntry, token);
      if (!safeHistoryEntry) {
        return res.status(400).json({ error: "historyEntry tidak valid" });
      }

      /* FIX: Validasi silang change di body vs change di historyEntry */
      if (safeHistoryEntry.change !== change) {
        return res.status(400).json({ error: "Inkonsistensi: change tidak cocok dengan historyEntry" });
      }
    }

    const baseMatch   = token ? { token } : { owner };
    const elemMatch   = change < 0 ? { ...baseMatch, balance: { $gte: -change } } : baseMatch;
    const arrayFilter = token ? { "elem.token": token } : { "elem.owner": owner };

    const update = { $inc: { "tokens.$[elem].balance": change } };
    if (safeHistoryEntry) {
      update.$push = { "tokens.$[elem].history": safeHistoryEntry };
    }

    const updatedDoc = await col.findOneAndUpdate(
      { _id: DOC_ID, tokens: { $elemMatch: elemMatch } },
      update,
      { arrayFilters: [arrayFilter], returnDocument: "after" }
    );

    if (!updatedDoc) {
      return res.status(409).json({ error: "Update ditolak: token/owner tidak ditemukan atau saldo tidak cukup" });
    }

    const updatedToken = (updatedDoc.tokens || []).find(t =>
      token ? t.token === token : t.owner === owner
    );

    return res.status(200).json({ success: true, balance: updatedToken ? updatedToken.balance : null });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}