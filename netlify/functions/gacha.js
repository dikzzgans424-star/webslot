import { MongoClient } from "mongodb";

const uri            = process.env.MONGODB_URI;
const INTERNAL_KEY   = process.env.INTERNAL_API_KEY; // secret key khusus bot WA
const DB_NAME        = "miwa";
const COLLECTION     = "gachadata";
const DOC_ID         = "main";

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

export async function handler(event) {
  try {
    if (!uri) {
      return { statusCode: 500, body: JSON.stringify({ error: "MONGODB_URI tidak ditemukan" }) };
    }

    const params     = new URLSearchParams(event.queryStringParameters || {});
    const tokenParam = (params.get("token") || "").trim().toUpperCase();
    const ownerParam = (params.get("owner") || "").trim();

    /* ── MODE A: lookup by TOKEN (dipakai web app) ──────────────────
       Tidak perlu auth — token adalah secret milik user itu sendiri. */
    if (tokenParam) {
      const client = await getClient();
      const col    = client.db(DB_NAME).collection(COLLECTION);

      const doc = await col.findOne(
        { _id: DOC_ID, "tokens.token": tokenParam },
        { projection: { "tokens.$": 1 } }
      );

      if (!doc || !doc.tokens?.[0]) {
        return { statusCode: 404, body: JSON.stringify({ error: "Token tidak ditemukan" }) };
      }

      const tokenData = doc.tokens[0];
      const content   = Buffer.from(
        JSON.stringify({ tokens: [tokenData] }, null, 2)
      ).toString("base64");

      return { statusCode: 200, body: JSON.stringify({ content, sha: "0" }) };
    }

    /* ── MODE B: lookup by OWNER (dipakai bot WA internal) ──────────
       Wajib sertakan header X-Internal-Key yang cocok dengan env var
       INTERNAL_API_KEY. Tanpa itu, request ditolak 401.
       Ini mencegah user biasa lookup data orang lain via owner ID. */
    if (ownerParam) {
      const incomingKey = (event.headers?.["x-internal-key"] || "").trim();

      if (!INTERNAL_KEY) {
        /* Kalau env var tidak di-set, blokir semua akses by owner
           daripada expose data secara tidak sengaja */
        return { statusCode: 503, body: JSON.stringify({ error: "Lookup by owner tidak dikonfigurasi" }) };
      }
      if (!incomingKey || incomingKey !== INTERNAL_KEY) {
        return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
      }

      const client = await getClient();
      const col    = client.db(DB_NAME).collection(COLLECTION);

      const doc = await col.findOne(
        { _id: DOC_ID, "tokens.owner": ownerParam },
        { projection: { "tokens.$": 1 } }
      );

      if (!doc || !doc.tokens?.[0]) {
        return { statusCode: 404, body: JSON.stringify({ error: "Token tidak ditemukan" }) };
      }

      const tokenData = doc.tokens[0];
      const content   = Buffer.from(
        JSON.stringify({ tokens: [tokenData] }, null, 2)
      ).toString("base64");

      return { statusCode: 200, body: JSON.stringify({ content, sha: "0" }) };
    }

    /* Tidak ada token maupun owner → tolak */
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Parameter token atau owner diperlukan" })
    };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
