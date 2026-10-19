import { MongoClient } from "mongodb";
import { computeStats } from "./_adminStats.js";

const uri = process.env.MONGODB_URI;
const DB_NAME = "miwa";
const COLLECTION = "gachadata";
const DOC_ID = "main";

/* Password admin: set env ADMIN_PASS di Vercel (disarankan). Fallback di bawah
   hanya supaya langsung jalan — SEGERA pindahkan ke env var lalu hapus fallback. */
import { authOk } from "./_shared.js";

let cachedClient = null;
async function getClient() {
  if (cachedClient) {
    try { await cachedClient.db("admin").command({ ping: 1 }); return cachedClient; }
    catch (e) { try { await cachedClient.close(); } catch (_) {} cachedClient = null; }
  }
  cachedClient = new MongoClient(uri);
  await cachedClient.connect();
  return cachedClient;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!authOk(req)) {
    await new Promise(r => setTimeout(r, 400)); // perlambat tebak-tebakan
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    if (!uri) return res.status(500).json({ error: "MONGODB_URI tidak ditemukan" });
    const client = await getClient();
    const doc = await client.db(DB_NAME).collection(COLLECTION).findOne(
      { _id: DOC_ID },
      { projection: { "tokens.token": 1, "tokens.balance": 1, "tokens.isPremium": 1, "tokens.history": 1 } }
    );
    return res.status(200).json(computeStats(doc?.tokens || []));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
