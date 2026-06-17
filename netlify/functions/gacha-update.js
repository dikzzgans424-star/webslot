import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const DB_NAME = "miwa";
const COLLECTION = "gachadata";
const DOC_ID = "main";

let cachedClient = null;

async function getClient() {
  if (cachedClient) return cachedClient;
  cachedClient = new MongoClient(uri);
  await cachedClient.connect();
  return cachedClient;
}

export async function handler(event) {
  try {
    if (!uri) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "MONGODB_URI tidak ditemukan" })
      };
    }

    const { data } = JSON.parse(event.body);

    if (!data) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Data tidak lengkap" })
      };
    }

    const client = await getClient();
    const col = client.db(DB_NAME).collection(COLLECTION);

    await col.updateOne(
      { _id: DOC_ID },
      { $set: { tokens: data.tokens || [] } },
      { upsert: true }
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
}
