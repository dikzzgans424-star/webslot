import { getConfig } from "./_shared.js";

/* Publik: dipakai halaman utama untuk tahu game mana yang aktif/unggulan + batas bet. */
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (!process.env.MONGODB_URI) return res.status(500).json({ error: "MONGODB_URI tidak ditemukan" });
    return res.status(200).json(await getConfig());
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
