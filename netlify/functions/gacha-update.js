import { MongoClient } from "mongodb";

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

/* Batas wajar perubahan saldo dalam satu request — proteksi dasar
   kalau-kalau ada manipulasi client (DevTools/Postman dsb).
   Sesuaikan kalau memang ada bet/payout yang sah lebih besar dari ini. */
const MAX_ABS_CHANGE = 100000;

export async function handler(event) {
  try {
    if (!uri) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "MONGODB_URI tidak ditemukan" })
      };
    }

    const { token, owner, change, historyEntry, newToken, setIsPremium } = JSON.parse(event.body);

    const client = await getClient();
    const col = client.db(DB_NAME).collection(COLLECTION);

    /* ════════════════════════════════════════
       MODE A — BUAT TOKEN BARU (dipakai bot WA: .casino create)
       Atomic: hanya berhasil kalau owner ini BELUM punya token sama
       sekali di dalam array. Mencegah double-create kalau ada 2
       request create barengan dari device/chat berbeda.
    ════════════════════════════════════════ */
    if (newToken) {
      if (!owner || !newToken.token) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Data token baru tidak lengkap" })
        };
      }

      const result = await col.updateOne(
        { _id: DOC_ID, "tokens.owner": { $ne: owner } },
        { $push: { tokens: newToken } },
        { upsert: true }
      );

      if (result.modifiedCount === 0 && result.upsertedCount === 0) {
        return {
          statusCode: 409,
          body: JSON.stringify({ error: "Owner ini sudah punya token kasino" })
        };
      }

      return { statusCode: 200, body: JSON.stringify({ success: true, token: newToken }) };
    }

    /* ════════════════════════════════════════
       MODE C — SYNC STATUS PREMIUM
       Dipakai bot WA buat nyamain `isPremium` di token dengan status
       premium WA yang sebenarnya (karena isPremium di token cuma
       snapshot waktu create, BISA basi kalau user upgrade belakangan).
       Nggak nyentuh balance/history sama sekali, murni $set boolean.
    ════════════════════════════════════════ */
    if (typeof setIsPremium === "boolean") {
      if (!token && !owner) {
        return { statusCode: 400, body: JSON.stringify({ error: "Butuh token atau owner" }) };
      }
      const baseMatch   = token ? { token } : { owner };
      const arrayFilter = token ? { "elem.token": token } : { "elem.owner": owner };

      const updatedDoc = await col.findOneAndUpdate(
        { _id: DOC_ID, tokens: { $elemMatch: baseMatch } },
        { $set: { "tokens.$[elem].isPremium": setIsPremium } },
        { arrayFilters: [arrayFilter], returnDocument: "after" }
      );

      if (!updatedDoc) {
        return { statusCode: 409, body: JSON.stringify({ error: "Token/owner tidak ditemukan" }) };
      }

      return { statusCode: 200, body: JSON.stringify({ success: true, isPremium: setIsPremium }) };
    }

    /* ════════════════════════════════════════
       MODE B — APPLY DELTA SALDO
       Dipakai web app.js (identifikasi via `token`) maupun
       bot .casino depo/wth (identifikasi via `owner`).
    ════════════════════════════════════════ */
    if (!token && !owner) {
      return { statusCode: 400, body: JSON.stringify({ error: "Butuh token atau owner" }) };
    }
    if (typeof change !== "number" || !Number.isFinite(change)) {
      return { statusCode: 400, body: JSON.stringify({ error: "change tidak valid" }) };
    }
    if (Math.abs(change) > MAX_ABS_CHANGE) {
      return { statusCode: 400, body: JSON.stringify({ error: "Perubahan saldo di luar batas wajar" }) };
    }

    /* FIX poin 1 & 2:
       - $inc atomik di level DB -> nggak ada lagi read-modify-write
         seluruh dokumen, jadi aman dari race condition antar request.
       - Filter "balance >= -change" (kalau change negatif) dieksekusi
         SEBELUM update dilakukan -> server yang nentuin valid/tidaknya,
         bukan client. Saldo nggak akan pernah bisa jadi minus. */
    const baseMatch  = token ? { token } : { owner };
    const elemMatch  = change < 0 ? { ...baseMatch, balance: { $gte: -change } } : baseMatch;
    const arrayFilter = token ? { "elem.token": token } : { "elem.owner": owner };

    const update = { $inc: { "tokens.$[elem].balance": change } };
    if (historyEntry) {
      update.$push = { "tokens.$[elem].history": historyEntry };
    }

    /* findOneAndUpdate -> sekalian ambil balance terbaru biar bot/web
       bisa nampilin saldo akurat tanpa fetch ulang */
    const updatedDoc = await col.findOneAndUpdate(
      { _id: DOC_ID, tokens: { $elemMatch: elemMatch } },
      update,
      { arrayFilters: [arrayFilter], returnDocument: "after" }
    );

    if (!updatedDoc) {
      /* Token/owner tidak ada, ATAU saldo saat ini di server kurang
         dari |change| (mencegah saldo minus / hasil yang sudah usang) */
      return {
        statusCode: 409,
        body: JSON.stringify({ error: "Update ditolak: token/owner tidak ditemukan atau saldo tidak cukup" })
      };
    }

    const updatedToken = (updatedDoc.tokens || []).find(t =>
      token ? t.token === token : t.owner === owner
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, balance: updatedToken ? updatedToken.balance : null })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
}
