import { MongoClient } from "mongodb";
import { timingSafeEqual, randomBytes, createHash } from "crypto";

export const DB_NAME = "miwa";
export const COLLECTION = "gachadata";
export const DOC_ID = "main";
export const CONFIG_COL = "gachaconfig";
export const LOG_COL = "adminLogs";

export const GAME_KEYS = ["reelsgird","roulette","coinflip","horserace","blackjack","hilo","plinko","wheel","airplane","mines"];
export const DEFAULT_MAX_NORMAL = 50000;
export const DEFAULT_MAX_PREMIUM = 100000;

const DEFAULT_PREMIUM_ONLY = new Set(["airplane", "mines"]);
const DEFAULT_DAILY = { airplane: 10, hilo: 10, mines: 10, plinko: 10 };

let cachedClient = null;
export async function getClient() {
  if (cachedClient) {
    try { await cachedClient.db("admin").command({ ping: 1 }); return cachedClient; }
    catch (e) { try { await cachedClient.close(); } catch (_) {} cachedClient = null; }
  }
  cachedClient = new MongoClient(process.env.MONGODB_URI);
  await cachedClient.connect();
  return cachedClient;
}

/* Password admin: set env ADMIN_PASS di Vercel (WAJIB diganti, fallback hanya agar jalan). */
const ADMIN_PASS = process.env.ADMIN_PASS || "dhikzxcloud240209";
export function passOk(given) {
  const a = Buffer.from(String(given || ""));
  const b = Buffer.from(ADMIN_PASS);
  return a.length === b.length && timingSafeEqual(a, b);
}

/* Pola kunci (urutan titik 1-9). Set env ADMIN_PATTERN untuk mengganti. */
const ADMIN_PATTERN = process.env.ADMIN_PATTERN || "538167294";
function safeEq(x, y) {
  const a = Buffer.from(String(x || "")), b = Buffer.from(String(y));
  return a.length === b.length && timingSafeEqual(a, b);
}
export const patternOk = req => safeEq(req.headers["x-admin-pattern"], ADMIN_PATTERN);
/* Auth penuh: pola DAN password, dicek di server pada setiap request */
export const authOk = req => patternOk(req) & passOk(req.headers["x-admin-pass"]) ? true : false;

export function defaultGame(key) {
  return {
    enabled: true, featured: false, minBet: 1, maxBet: 0,
    premiumOnly: DEFAULT_PREMIUM_ONLY.has(key),
    dailyLimit: DEFAULT_DAILY[key] || 0,
  };
}

/* Gabungkan config tersimpan dengan default → selalu lengkap */
export function normalizeConfig(raw) {
  const games = {};
  for (const k of GAME_KEYS) games[k] = { ...defaultGame(k), ...(raw?.games?.[k] || {}) };
  return { games, maintenance: { on: false, msg: "", ...(raw?.maintenance || {}) } };
}

let cfgCache = { at: 0, v: null };
export async function getConfig(force = false) {
  if (!force && cfgCache.v && Date.now() - cfgCache.at < 5000) return cfgCache.v;
  const client = await getClient();
  const raw = await client.db(DB_NAME).collection(CONFIG_COL).findOne({ _id: "main" });
  cfgCache = { at: Date.now(), v: normalizeConfig(raw) };
  return cfgCache.v;
}
export function clearConfigCache() { cfgCache = { at: 0, v: null }; }

export function effectiveMax(g, isPremium) {
  return g.maxBet > 0 ? g.maxBet : (isPremium ? DEFAULT_MAX_PREMIUM : DEFAULT_MAX_NORMAL);
}

/* ═══════════ SESI LOGIN WEB (cookie httpOnly) ═══════════
   Login: nomor WA + verifikasi di bot (lihat token-verify.js). Token game
   tidak pernah dikirim ke browser; browser hanya memegang cookie sesi. */
export const SESS_COL = "sessions";
export const SESS_COOKIE = "csn_sid";
export const SESS_TTL_MS = 30 * 24 * 3600 * 1000;
export const sha256 = s => createHash("sha256").update(String(s)).digest("hex");
/* ALLOW_TOKEN_LOGIN=0 di Vercel → login lama via string token dimatikan total */
export const allowTokenLogin = () => process.env.ALLOW_TOKEN_LOGIN !== "0";

let sessIdx = false;
async function sessCol() {
  const col = (await getClient()).db(DB_NAME).collection(SESS_COL);
  if (!sessIdx) { await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }); sessIdx = true; }
  return col;
}
function readCookie(req, name) {
  const raw = String(req.headers?.cookie || "");
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return "";
}
export async function createSession(res, owner) {
  const sid = randomBytes(32).toString("hex");
  const col = await sessCol();
  await col.insertOne({ _id: sha256(sid), owner, createdAt: new Date(), expiresAt: new Date(Date.now() + SESS_TTL_MS) });
  res.setHeader("Set-Cookie", `${SESS_COOKIE}=${sid}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESS_TTL_MS / 1000}`);
}
export function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${SESS_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
}
export async function destroySession(req) {
  const sid = readCookie(req, SESS_COOKIE);
  if (sid) await (await sessCol()).deleteOne({ _id: sha256(sid) });
}
export async function revokeSessions(owner) {
  return (await sessCol()).deleteMany({ owner });
}
/* → owner (string) atau null */
export async function sessionOwner(req) {
  const sid = readCookie(req, SESS_COOKIE);
  if (!/^[0-9a-f]{64}$/.test(sid)) return null;
  const s = await (await sessCol()).findOne({ _id: sha256(sid), expiresAt: { $gt: new Date() } });
  return s?.owner || null;
}
/* → data token lengkap milik sesi, atau null */
export async function sessionToken(req) {
  const owner = await sessionOwner(req);
  if (!owner) return null;
  const doc = await (await getClient()).db(DB_NAME).collection(COLLECTION)
    .findOne({ _id: DOC_ID, "tokens.owner": owner }, { projection: { "tokens.$": 1 } });
  return doc?.tokens?.[0] || null;
}
export function maskOwner(owner) {
  const d = String(owner || "").split("@")[0].replace(/\D/g, "");
  return d.length > 6 ? d.slice(0, 4) + "••••" + d.slice(-2) : "••••";
}
