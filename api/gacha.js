import { MongoClient } from "mongodb";

const uri          = process.env.MONGODB_URI;
const INTERNAL_KEY  = process.env.INTERNAL_API_KEY; // secret key khusus bot WA
const DB_NAME       = "miwa";
const COLLECTION    = "gachadata";
const DOC_ID        = "main";

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

export default async function handler(req, res) {
  try {
    if (!uri) {
      return res.status(500).json({ error: "MONGODB_URI tidak ditemukan" });
    }

    const tokenParam = String(req.query.token || "").trim().toUpperCase();
    const ownerParam = String(req.query.owner || "").trim();

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
        return res.status(404).json({ error: "Token tidak ditemukan" });
      }

      const tokenData = doc.tokens[0];
      const content   = Buffer.from(
        JSON.stringify({ tokens: [tokenData] }, null, 2)
      ).toString("base64");

      return res.status(200).json({ content, sha: "0" });
    }

    /* ── MODE B: lookup by OWNER (dipakai bot WA internal) ──────────
       Wajib sertakan header X-Internal-Key yang cocok dengan env var
       INTERNAL_API_KEY. Tanpa itu, request ditolak 401.
       Ini mencegah user biasa lookup data orang lain via owner ID. */
    if (ownerParam) {
      const incomingKey = String(req.headers["x-internal-key"] || "").trim();

      if (!INTERNAL_KEY) {
        /* Kalau env var tidak di-set, blokir semua akses by owner
           daripada expose data secara tidak sengaja */
        return res.status(503).json({ error: "Lookup by owner tidak dikonfigurasi" });
      }
      if (!incomingKey || incomingKey !== INTERNAL_KEY) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const client = await getClient();
      const col    = client.db(DB_NAME).collection(COLLECTION);

      const doc = await col.findOne(
        { _id: DOC_ID, "tokens.owner": ownerParam },
        { projection: { "tokens.$": 1 } }
      );

      if (!doc || !doc.tokens?.[0]) {
        return res.status(404).json({ error: "Token tidak ditemukan" });
      }

      const tokenData = doc.tokens[0];
      const content   = Buffer.from(
        JSON.stringify({ tokens: [tokenData] }, null, 2)
      ).toString("base64");

      return res.status(200).json({ content, sha: "0" });
    }

    /* Tidak ada token maupun owner → tolak */
    return res.status(400).json({ error: "Parameter token atau owner diperlukan" });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
