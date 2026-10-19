import { randomBytes } from "crypto";
import {
  getClient, authOk, patternOk, DB_NAME, COLLECTION, DOC_ID, CONFIG_COL, LOG_COL,
  GAME_KEYS, getConfig, normalizeConfig, clearConfigCache,
} from "./_shared.js";

const NON_GAME = new Set(["deposit", "withdraw", "admin_add", "admin_sub", "bonus"]);
const MAX_AMOUNT = 1000000000;
const mask = s => (s && s.length > 6 ? s.slice(0, 4) + "••••" + s.slice(-2) : s);

function summarize(t, withHistory = false) {
  const per = {};
  let plays = 0, wagered = 0, net = 0, wins = 0, losses = 0, biggestBet = 0, biggestWin = 0, biggestLoss = 0;
  let deposit = 0, withdraw = 0, adminAdd = 0, adminSub = 0, bonus = 0, lastAt = 0, firstAt = 0;
  for (const h of t.history || []) {
    if (!h) continue;
    if (h.game === "deposit") { deposit += h.change || 0; continue; }
    if (h.game === "withdraw") { withdraw += -(h.change || 0); continue; }
    if (h.game === "admin_add") { adminAdd += h.change || 0; continue; }
    if (h.game === "admin_sub") { adminSub += -(h.change || 0); continue; }
    if (h.game === "bonus") { bonus += h.change || 0; continue; }
    plays++; wagered += h.bet || 0; net += h.change || 0;
    if (h.change > 0) wins++; else if (h.change < 0) losses++;
    biggestBet = Math.max(biggestBet, h.bet || 0);
    biggestWin = Math.max(biggestWin, h.change || 0);
    biggestLoss = Math.min(biggestLoss, h.change || 0);
    if (h.at > lastAt) lastAt = h.at;
    if (!firstAt || h.at < firstAt) firstAt = h.at;
    const g = per[h.game] || (per[h.game] = { plays: 0, wagered: 0, net: 0, wins: 0, losses: 0, biggestBet: 0 });
    g.plays++; g.wagered += h.bet || 0; g.net += h.change || 0;
    if (h.change > 0) g.wins++; else if (h.change < 0) g.losses++;
    g.biggestBet = Math.max(g.biggestBet, h.bet || 0);
  }
  const out = {
    token: t.token, owner: t.owner || "", balance: t.balance || 0,
    isPremium: !!t.isPremium, banned: !!t.banned, banReason: t.banReason || "",
    note: t.note || "", createdAt: t.createdAt || null,
    plays, wagered, net, wins, losses,
    winRate: plays ? Math.round((wins / plays) * 1000) / 10 : null,
    avgBet: plays ? Math.round(wagered / plays) : 0,
    rtp: wagered ? Math.round(((wagered + net) / wagered) * 1000) / 10 : null,
    biggestBet, biggestWin, biggestLoss, deposit, withdraw, adminAdd, adminSub, bonus,
    firstAt, lastAt, perGame: per,
  };
  if (withHistory) out.history = (t.history || []).slice(-100).reverse();
  return out;
}

function newTokenString() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const b = randomBytes(12);
  let s = "TKN";
  for (let i = 0; i < 12; i++) s += chars[b[i] % chars.length];
  return s;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if ((req.body || {}).action === "checkPattern") {
    if (patternOk(req)) return res.status(200).json({ ok: true });
    await new Promise(r => setTimeout(r, 600));
    return res.status(401).json({ error: "Pola salah" });
  }
  if (!authOk(req)) {
    await new Promise(r => setTimeout(r, 600));
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!process.env.MONGODB_URI) return res.status(500).json({ error: "MONGODB_URI tidak ditemukan" });

  try {
    const body = req.body || {};
    const action = String(body.action || "");
    const token = String(body.token || "").trim().toUpperCase();
    const client = await getClient();
    const db = client.db(DB_NAME);
    const col = db.collection(COLLECTION);
    const log = (extra) => db.collection(LOG_COL).insertOne({ at: Date.now(), action, token: token ? mask(token) : "", ...extra }).catch(() => {});
    const bad = (m, c = 400) => res.status(c).json({ error: m });

    /* ── Konfigurasi game ── */
    if (action === "getConfig") return res.status(200).json(await getConfig(true));
    if (action === "setConfig") {
      const cfg = normalizeConfig(body.config);
      for (const k of GAME_KEYS) {
        const g = cfg.games[k];
        g.enabled = !!g.enabled; g.featured = !!g.featured; g.premiumOnly = !!g.premiumOnly;
        g.minBet = Math.max(1, parseInt(g.minBet) || 1);
        g.maxBet = Math.max(0, parseInt(g.maxBet) || 0);
        g.dailyLimit = Math.max(0, parseInt(g.dailyLimit) || 0);
        if (g.maxBet && g.maxBet < g.minBet) return bad(`${k}: max bet tidak boleh lebih kecil dari min bet`);
      }
      cfg.maintenance = { on: !!cfg.maintenance.on, msg: String(cfg.maintenance.msg || "").slice(0, 200) };
      await db.collection(CONFIG_COL).updateOne({ _id: "main" }, { $set: { games: cfg.games, maintenance: cfg.maintenance } }, { upsert: true });
      clearConfigCache();
      await log({ detail: "update config" });
      return res.status(200).json({ success: true, config: cfg });
    }

    /* ── Daftar token ── */
    if (action === "list") {
      const doc = await col.findOne({ _id: DOC_ID });
      return res.status(200).json({ tokens: (doc?.tokens || []).map(t => summarize(t)) });
    }
    if (action === "logs") {
      const rows = await db.collection(LOG_COL).find({}).sort({ at: -1 }).limit(100).toArray();
      return res.status(200).json({ logs: rows.map(({ _id, ...r }) => r) });
    }
    if (action === "createToken") {
      const amt = Math.floor(Number(body.balance) || 0);
      if (amt < 0 || amt > MAX_AMOUNT) return bad("Saldo awal tidak valid");
      const t = { token: newTokenString(), owner: String(body.owner || "admin-" + Date.now()), balance: amt, isPremium: !!body.isPremium, history: [], createdAt: Date.now() };
      await col.updateOne({ _id: DOC_ID }, { $push: { tokens: t } }, { upsert: true });
      await log({ detail: `buat token (saldo ${amt})` });
      return res.status(200).json({ success: true, token: t.token });
    }

    if (!token) return bad("token wajib diisi");
    const filter = { _id: DOC_ID, "tokens.token": token };
    const af = { arrayFilters: [{ "elem.token": token }], returnDocument: "after" };
    const pick = d => (d?.tokens || []).find(t => t.token === token);

    if (action === "detail") {
      const doc = await col.findOne(filter, { projection: { "tokens.$": 1 } });
      if (!doc?.tokens?.[0]) return bad("Token tidak ditemukan", 404);
      return res.status(200).json(summarize(doc.tokens[0], true));
    }

    /* ── Saldo: tambah / kurangi / bonus ── */
    if (action === "add" || action === "sub" || action === "bonus") {
      const amt = Math.floor(Number(body.amount));
      if (!Number.isFinite(amt) || amt < 1 || amt > MAX_AMOUNT) return bad("Jumlah tidak valid (1 – 1.000.000.000 bet)");
      const change = action === "sub" ? -amt : amt;
      const game = action === "add" ? "admin_add" : action === "sub" ? "admin_sub" : "bonus";
      const entry = { game, bet: amt, result: change > 0 ? "win" : "lose", change, at: Date.now() };
      const match = action === "sub" ? { token, balance: { $gte: amt } } : { token };
      const d = await col.findOneAndUpdate(
        { _id: DOC_ID, tokens: { $elemMatch: match } },
        { $inc: { "tokens.$[elem].balance": change }, $push: { "tokens.$[elem].history": entry } }, af);
      if (!d) return bad(action === "sub" ? "Token tidak ditemukan / saldo tidak cukup" : "Token tidak ditemukan", 409);
      await log({ detail: `${action} ${amt} bet`, note: String(body.note || "").slice(0, 100) });
      return res.status(200).json({ success: true, balance: pick(d)?.balance });
    }
    if (action === "setBalance") {
      const v = Math.floor(Number(body.amount));
      if (!Number.isFinite(v) || v < 0 || v > MAX_AMOUNT) return bad("Saldo tidak valid");
      const d = await col.findOneAndUpdate(filter, { $set: { "tokens.$[elem].balance": v } }, af);
      if (!d) return bad("Token tidak ditemukan", 404);
      await log({ detail: `set saldo ${v}` });
      return res.status(200).json({ success: true, balance: v });
    }

    /* ── Ban / unban ── */
    if (action === "ban" || action === "unban") {
      const set = action === "ban"
        ? { "tokens.$[elem].banned": true, "tokens.$[elem].banReason": String(body.reason || "").slice(0, 200), "tokens.$[elem].bannedAt": Date.now() }
        : { "tokens.$[elem].banned": false, "tokens.$[elem].banReason": "" };
      const d = await col.findOneAndUpdate(filter, { $set: set }, af);
      if (!d) return bad("Token tidak ditemukan", 404);
      await log({ detail: action === "ban" ? `ban: ${body.reason || "-"}` : "unban" });
      return res.status(200).json({ success: true, banned: action === "ban" });
    }

    /* ── Premium / catatan / ganti token / reset riwayat ── */
    if (action === "setPremium") {
      const d = await col.findOneAndUpdate(filter, { $set: { "tokens.$[elem].isPremium": !!body.value } }, af);
      if (!d) return bad("Token tidak ditemukan", 404);
      await log({ detail: `premium=${!!body.value}` });
      return res.status(200).json({ success: true });
    }
    if (action === "setNote") {
      const d = await col.findOneAndUpdate(filter, { $set: { "tokens.$[elem].note": String(body.note || "").slice(0, 300) } }, af);
      if (!d) return bad("Token tidak ditemukan", 404);
      return res.status(200).json({ success: true });
    }
    if (action === "regenToken") {
      const nt = newTokenString();
      const d = await col.findOneAndUpdate(filter, { $set: { "tokens.$[elem].token": nt } }, af);
      if (!d) return bad("Token tidak ditemukan", 404);
      await log({ detail: "ganti token → " + mask(nt) });
      return res.status(200).json({ success: true, token: nt });
    }
    if (action === "resetHistory") {
      if (String(body.confirm || "").trim().toUpperCase() !== token) return bad("Konfirmasi token tidak cocok");
      const d = await col.findOneAndUpdate(filter, { $set: { "tokens.$[elem].history": [] } }, af);
      if (!d) return bad("Token tidak ditemukan", 404);
      await log({ detail: "reset riwayat" });
      return res.status(200).json({ success: true });
    }

    /* ── Hapus akun: verifikasi 2 lapis (server cek ulang token yang diketik) ── */
    if (action === "delete") {
      if (body.confirm1 !== true) return bad("Konfirmasi tahap 1 belum dicentang");
      if (String(body.confirm2 || "").trim().toUpperCase() !== token) return bad("Token yang diketik tidak cocok");
      const r = await col.updateOne({ _id: DOC_ID }, { $pull: { tokens: { token } } });
      if (!r.modifiedCount) return bad("Token tidak ditemukan", 404);
      await log({ detail: "HAPUS akun" });
      return res.status(200).json({ success: true });
    }

    return bad("Action tidak dikenal");
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
