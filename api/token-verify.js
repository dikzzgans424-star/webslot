import { randomBytes, createHash, timingSafeEqual } from "crypto";
import { getClient, DB_NAME, COLLECTION, DOC_ID, createSession, destroySession, clearSessionCookie, revokeSessions } from "./_shared.js";

/* Verifikasi lewat grup WA untuk lihat token di web (tanpa kirim DM).
   start   (publik)   : web kirim nomor → dapat kode + sid
   confirm (bot, key) : bot kirim { code, owner, number } setelah user ketik `.casino verify KODE` di grup
   poll    (publik)   : web kirim sid → kalau sudah verified, token dikirim SEKALI lalu dihapus */

const COL = "tokenVerify";
const TTL_MS = 5 * 60 * 1000;
const INTERNAL_KEY = process.env.INTERNAL_API_KEY;

const sha = s => createHash("sha256").update(String(s)).digest("hex");
const digits = s => String(s || "").replace(/\D/g, "");
function normPhone(s) {
  let d = digits(s);
  if (d.startsWith("0")) d = "62" + d.slice(1);
  return d;
}
function internalOk(req) {
  const given = Buffer.from(String(req.headers["x-internal-key"] || "").trim());
  const want = Buffer.from(String(INTERNAL_KEY || ""));
  return want.length > 0 && given.length === want.length && timingSafeEqual(given, want);
}
const newCode = () => {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // tanpa karakter mirip
  const b = randomBytes(6);
  return Array.from(b, x => A[x % A.length]).join("");
};

let idxDone = false;
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    if (!process.env.MONGODB_URI) return res.status(500).json({ error: "Server belum dikonfigurasi" });
    const client = await getClient();
    const vcol = client.db(DB_NAME).collection(COL);
    if (!idxDone) { await vcol.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }); idxDone = true; }

    const { action } = req.body || {};

    /* ── START ── */
    if (action === "start") {
      const phone = normPhone(req.body.phone);
      if (phone.length < 8 || phone.length > 15) return res.status(400).json({ error: "Nomor tidak valid" });
      const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "?";
      const since = new Date(Date.now() - 10 * 60 * 1000);
      const [byIp, byPhone] = await Promise.all([
        vcol.countDocuments({ ip, createdAt: { $gt: since } }),
        vcol.countDocuments({ phone, createdAt: { $gt: since } }),
      ]);
      if (byIp >= 5 || byPhone >= 3) return res.status(429).json({ error: "Terlalu banyak percobaan, coba lagi nanti" });

      const code = newCode();
      const sid = randomBytes(24).toString("hex");
      await vcol.insertOne({
        _id: code, sidHash: sha(sid), phone, ip, status: "pending",
        createdAt: new Date(), expiresAt: new Date(Date.now() + TTL_MS),
      });
      return res.status(200).json({ code, sid, expiresIn: TTL_MS / 1000 });
    }

    /* ── CONFIRM (bot) ── */
    if (action === "confirm") {
      if (!internalOk(req)) return res.status(401).json({ error: "Unauthorized" });
      const code = String(req.body.code || "").toUpperCase().trim();
      const owner = String(req.body.owner || "");
      const number = normPhone(req.body.number);
      if (!code || !owner || !number) return res.status(400).json({ error: "Data tidak lengkap" });

      const vdoc = await vcol.findOne({ _id: code, status: "pending" });
      if (!vdoc || vdoc.expiresAt < new Date()) return res.status(404).json({ error: "Kode tidak ditemukan / kedaluwarsa" });
      if (vdoc.phone !== number) return res.status(403).json({ error: "Nomor pengirim tidak cocok dengan nomor di web" });

      const doc = await client.db(DB_NAME).collection(COLLECTION).findOne(
        { _id: DOC_ID, "tokens.owner": owner }, { projection: { "tokens.$": 1 } });
      const t = doc?.tokens?.[0];
      if (!t) return res.status(404).json({ error: "Kamu belum punya token kasino" });
      if (t.banned) return res.status(403).json({ error: "Token di-ban" });

      const r = await vcol.updateOne({ _id: code, status: "pending" }, { $set: { status: "verified", owner } });
      return res.status(200).json({ ok: r.modifiedCount === 1 });
    }

    /* ── POLL (web) ── */
    if (action === "poll") {
      const sid = String(req.body.sid || "");
      if (sid.length < 32) return res.status(400).json({ error: "sid tidak valid" });
      const vdoc = await vcol.findOne({ sidHash: sha(sid) });
      if (!vdoc || vdoc.expiresAt < new Date()) return res.status(200).json({ status: "expired" });
      if (vdoc.status !== "verified") return res.status(200).json({ status: "pending" });

      // sekali pakai: hapus dulu, baru kirim token
      const del = await vcol.findOneAndDelete({ _id: vdoc._id, status: "verified" });
      if (!del) return res.status(200).json({ status: "expired" });
      const doc = await client.db(DB_NAME).collection(COLLECTION).findOne(
        { _id: DOC_ID, "tokens.owner": del.owner }, { projection: { "tokens.$": 1 } });
      if (!doc?.tokens?.[0]) return res.status(404).json({ error: "Akun tidak ditemukan" });
      await createSession(res, del.owner);          // cookie httpOnly; token TIDAK dikirim ke browser
      return res.status(200).json({ status: "verified" });
    }

    /* ── LOGOUT (web) ── */
    if (action === "logout") {
      await destroySession(req);
      clearSessionCookie(res);
      return res.status(200).json({ ok: true });
    }

    /* ── REVOKE semua sesi web milik owner (bot: .csn logout) ── */
    if (action === "revoke") {
      if (!internalOk(req)) return res.status(401).json({ error: "Unauthorized" });
      const owner = String(req.body.owner || "");
      if (!owner) return res.status(400).json({ error: "owner diperlukan" });
      const r = await revokeSessions(owner);
      return res.status(200).json({ ok: true, removed: r.deletedCount });
    }

    return res.status(400).json({ error: "action tidak valid" });
  } catch (err) {
    console.error("[token-verify]", err);
    return res.status(500).json({ error: "Terjadi kesalahan server" });
  }
}
