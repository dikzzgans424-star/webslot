import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const DB_NAME = "miwa";
const COLLECTION = "gachadata";
const DOC_ID = "main";   // dokumen tunggal, id tetap "main"

let cachedClient = null;

async function getClient() {
  if (cachedClient) {
    try {
      /* Cek koneksi masih hidup. Kalau topology udah closed/invalid,
         ini akan throw dan kita bikin client baru di bawah. */
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

export async function handler() {
  try {
    if (!uri) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "MONGODB_URI tidak ditemukan" })
      };
    }

    const client = await getClient();
    const col = client.db(DB_NAME).collection(COLLECTION);

    let doc = await col.findOne({ _id: DOC_ID });

    /* Kalau belum ada dokumen sama sekali (pertama kali dipakai),
       buat dokumen kosong otomatis */
    if (!doc) {
      doc = { _id: DOC_ID, tokens: [] };
      await col.insertOne(doc);
    }

    /* Samakan bentuk respons dengan sistem lama (yang formatnya base64+sha)
       supaya app.js TIDAK perlu diubah sama sekali */
    const content = Buffer.from(
      JSON.stringify({ tokens: doc.tokens || [] }, null, 2)
    ).toString("base64");

    return {
      statusCode: 200,
      body: JSON.stringify({
        content,
        sha: doc._rev || "0"   // dipakai cuma sebagai placeholder, MongoDB tidak butuh SHA
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
}
