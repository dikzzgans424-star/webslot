import { getClient, DB_NAME, COLLECTION, DOC_ID } from "./_shared.js";

/* GET /api/profile?token=XXXX
   Dipakai halaman /profile. Mengembalikan data publik milik token itu sendiri:
   { token, balance, isPremium, history[] } */
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (!process.env.MONGODB_URI) {
      return res.status(500).json({ error: "MONGODB_URI tidak ditemukan" });
    }

    const token = String(req.query.token || "").trim().toUpperCase();
    if (!token) return res.status(400).json({ error: "Token kosong" });
    const client = await getClient();
    const doc = await client.db(DB_NAME).collection(COLLECTION).findOne(
      { _id: DOC_ID, "tokens.token": token },
      { projection: { "tokens.$": 1 } }
    );
    const t = doc?.tokens?.[0];
    if (!t) return res.status(404).json({ error: "Token tidak ditemukan" });
    if (t.banned) {
      return res.status(403).json({ error: "Token di-ban oleh Owner", banned: true, reason: t.banReason || "" });
    }

    return res.status(200).json({
      token: t.token,
      balance: Number(t.balance) || 0,
      isPremium: !!t.isPremium,
      history: (Array.isArray(t.history) ? t.history : []).slice(-500).map(h => ({
        game: h.game, bet: h.bet, result: h.result, change: h.change, at: h.at,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
