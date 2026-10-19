import { MongoClient } from "mongodb";
import { timingSafeEqual } from "crypto";

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
