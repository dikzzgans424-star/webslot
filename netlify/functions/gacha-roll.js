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
  "airplane","blackjack","plinko","mines"
]);
const PREMIUM_ONLY  = new Set(["airplane","mines"]);

/* Roll TTL — client harus pakai dalam 5 menit atau expired */
const ROLL_TTL_MS = 5 * 60 * 1000;

/* In-memory pending rolls: rollId → { result, token, game, bet, expiresAt }
   Netlify bisa punya banyak instance, jadi idealnya ini di Redis/MongoDB.
   Untuk simplicity, pakai memory + TTL cleanup. Risiko: kalau instance
   berbeda handle /gacha-roll vs /gacha-update, verifikasi gagal (404).
   Solusi lengkap: simpan pending roll di MongoDB dengan TTL index. */
const _pendingRolls = new Map();

function cleanExpiredRolls() {
  const now = Date.now();
  for (const [id, roll] of _pendingRolls) {
    if (roll.expiresAt < now) _pendingRolls.delete(id);
  }
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    if (!uri) {
      return { statusCode: 500, body: JSON.stringify({ error: "MONGODB_URI tidak ditemukan" }) };
    }

    const { token, game, bet } = JSON.parse(event.body || "{}");

    /* Validasi input dasar */
    if (!token || typeof token !== "string") {
      return { statusCode: 400, body: JSON.stringify({ error: "token tidak valid" }) };
    }
    if (!ALLOWED_GAMES.has(game)) {
      return { statusCode: 400, body: JSON.stringify({ error: "game tidak valid" }) };
    }
    if (typeof bet !== "number" || !Number.isInteger(bet) || bet < 1) {
      return { statusCode: 400, body: JSON.stringify({ error: "bet tidak valid" }) };
    }

    /* Cek token di DB dan ambil isPremium + balance */
    const client = await getClient();
    const col    = client.db(DB_NAME).collection(COLLECTION);

    const doc = await col.findOne(
      { _id: DOC_ID, "tokens.token": token.toUpperCase() },
      { projection: { "tokens.$": 1 } }
    );

    if (!doc || !doc.tokens || !doc.tokens[0]) {
      return { statusCode: 404, body: JSON.stringify({ error: "Token tidak ditemukan" }) };
    }

    const tokenData = doc.tokens[0];

    /* Cek saldo cukup */
    if (tokenData.balance < bet) {
      return { statusCode: 400, body: JSON.stringify({ error: "Saldo tidak cukup" }) };
    }

    /* Cek akses premium */
    if (PREMIUM_ONLY.has(game) && !tokenData.isPremium) {
      return { statusCode: 403, body: JSON.stringify({ error: "Game ini khusus token Premium" }) };
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

    return {
      statusCode: 200,
      body: JSON.stringify({ result, rollId })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
}

/* Export untuk dipakai gacha-update.js saat verifikasi rollId.
   Karena Netlify Functions adalah module terpisah, verifikasi rollId
   disimpan di MongoDB agar bisa cross-instance. Fungsi ini jadi
   referensi arsitektur — implementasi lengkap ada di comment gacha-update.js. */
export { _pendingRolls };
