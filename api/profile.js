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

export default async function handler(req, res) {
  try {
    if (!uri) {
      return res.status(500).json({ error: "MONGODB_URI tidak ditemukan" });
    }

    const tokenParam = String(req.query.token || "").trim().toUpperCase();

    if (!tokenParam) {
      return res.status(400).json({ error: "Parameter token diperlukan" });
    }

    const client = await getClient();
    const col = client.db(DB_NAME).collection(COLLECTION);

    const doc = await col.findOne(
      { _id: DOC_ID, "tokens.token": tokenParam },
      { projection: { "tokens.$": 1 } }
    );

    if (!doc || !doc.tokens?.[0]) {
      return res.status(404).json({ error: "Token tidak ditemukan" });
    }

    const tokenData = doc.tokens[0];

    return res.status(200).json({
      token: tokenData.token,
      balance: tokenData.balance,
      isPremium: tokenData.isPremium || false,
      history: tokenData.history || []
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
