import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const INTERNAL_KEY = process.env.INTERNAL_API_KEY; // secret key khusus bot WA
const DB_NAME = "miwa";
const COLLECTION = "gachadata";
const DOC_ID = "main";
const PENDING_COLLECTION = "pendingRolls";

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

function isInternalRequest(req) {
  if (!INTERNAL_KEY) return false;
  const incomingKey = String(req.headers["x-internal-key"] || "").trim();
  return !!incomingKey && incomingKey === INTERNAL_KEY;
}

const MAX_ABS_CHANGE = 1000000000000000;

const ALLOWED_HISTORY_FIELDS = new Set(["game", "bet", "result", "change", "at"]);
const ALLOWED_GAMES     = new Set(["reelsgird","roulette","coinflip","horserace","airplane","blackjack","plinko","mines","wheel","hilo"]);
const ALLOWED_BOT_GAMES = new Set(["deposit","withdraw"]); // transaksi bot, bukan game web
const ALLOWED_RESULTS   = new Set(["win", "lose"]);

const MAX_GAME_MULTIPLIER = {
  reelsgird: 5.5,
  roulette:  2,
  coinflip:  2,
  horserace: 2,
  blackjack: 2,
  airplane:  22.22 * 0.95,
  plinko:    8,
  mines:     15,
  wheel:     5,
  hilo:      10,
};

function sanitizeHistoryEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;

  for (const key of Object.keys(entry)) {
    if (!ALLOWED_HISTORY_FIELDS.has(key)) return null;
  }

  const { game, bet, result, change, at } = entry;

  if (!ALLOWED_GAMES.has(game) && !ALLOWED_BOT_GAMES.has(game)) return null;
  if (!ALLOWED_RESULTS.has(result))       return null;
  if (typeof bet !== "number" || bet < 1 || !Number.isInteger(bet)) return null;
  if (typeof change !== "number" || !Number.isFinite(change))       return null;
  if (typeof at !== "number" || !Number.isFinite(at))               return null;

  if (ALLOWED_BOT_GAMES.has(game)) {
    if (game === "deposit"  && (result !== "win"  || change !== bet))   return null;
    if (game === "withdraw" && (result !== "lose" || change !== -bet))  return null;
  } else {
    if (result === "win" && change <= 0) return null;
    if (result === "win") {
      const maxChange = Math.ceil(bet * ((MAX_GAME_MULTIPLIER[game] ?? 2) - 1));
      if (change > maxChange) return null;
    }
    if (result === "lose") {
      if (game === "plinko") {
        if (change >= 0 || change < -bet) return null;
      } else {
        if (change !== -bet) return null;
      }
    }
  }

  if (at > Date.now() + 60_000) return null;

  return { game, bet, result, change, at };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }
    if (!uri) {
      return res.status(500).json({ error: "MONGODB_URI tidak ditemukan" });
    }

    const body = req.body || {};
    const { token, owner, change, historyEntry, newToken, setIsPremium, reToken, rollId } = body;

    const client = await getClient();
    const col        = client.db(DB_NAME).collection(COLLECTION);
    const pendingCol = client.db(DB_NAME).collection(PENDING_COLLECTION);

    /* ════════════════════════════════════════
       MODE A — BUAT TOKEN BARU (bot WA)
    ════════════════════════════════════════ */
    if (newToken) {
      if (!isInternalRequest(req)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      if (!owner || !newToken.token) {
        return res.status(400).json({ error: "Data token baru tidak lengkap" });
      }

      const result = await col.updateOne(
        { _id: DOC_ID, "tokens.owner": { $ne: owner } },
        { $push: { tokens: newToken } },
        { upsert: true }
      );

      if (result.modifiedCount === 0 && result.upsertedCount === 0) {
        return res.status(409).json({ error: "Owner ini sudah punya token kasino" });
      }

      return res.status(200).json({ success: true, token: newToken });
    }

    /* ════════════════════════════════════════
       MODE C — SYNC STATUS PREMIUM (bot WA)
    ════════════════════════════════════════ */
    if (typeof setIsPremium === "boolean") {
      if (!isInternalRequest(req)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      if (!token && !owner) {
        return res.status(400).json({ error: "Butuh token atau owner" });
      }
      const baseMatch   = token ? { token } : { owner };
      const arrayFilter = token ? { "elem.token": token } : { "elem.owner": owner };

      const updatedDoc = await col.findOneAndUpdate(
        { _id: DOC_ID, tokens: { $elemMatch: baseMatch } },
        { $set: { "tokens.$[elem].isPremium": setIsPremium } },
        { arrayFilters: [arrayFilter], returnDocument: "after" }
      );

      if (!updatedDoc) {
        return res.status(409).json({ error: "Token/owner tidak ditemukan" });
      }

      return res.status(200).json({ success: true, isPremium: setIsPremium });
    }

    /* ════════════════════════════════════════
       MODE D — RE-TOKEN (bot WA)
    ════════════════════════════════════════ */
    if (reToken === true) {
      if (!isInternalRequest(req)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      if (!owner) {
        return res.status(400).json({ error: "Butuh owner untuk re-token" });
      }

      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      let newTkn  = "TKN";
      for (let i = 0; i < 12; i++) {
        newTkn += chars.charAt(Math.floor(Math.random() * chars.length));
      }

      const updatedDoc = await col.findOneAndUpdate(
        { _id: DOC_ID, "tokens.owner": owner },
        { $set: { "tokens.$.token": newTkn } },
        { returnDocument: "after" }
      );

      if (!updatedDoc) {
        return res.status(404).json({ error: "Token tidak ditemukan untuk owner ini" });
      }

      const updatedToken = (updatedDoc.tokens || []).find(t => t.owner === owner);

      return res.status(200).json({ success: true, token: updatedToken?.token ?? newTkn });
    }

    /* ════════════════════════════════════════
       MODE B — APPLY DELTA SALDO
    ════════════════════════════════════════ */
    if (!token && !owner) {
      return res.status(400).json({ error: "Butuh token atau owner" });
    }

    if (typeof change !== "number" || !Number.isFinite(change) || change === 0) {
      return res.status(400).json({ error: "change tidak valid" });
    }
    if (Math.abs(change) > MAX_ABS_CHANGE) {
      return res.status(400).json({ error: "Perubahan saldo di luar batas wajar" });
    }

    let safeHistoryEntry = null;
    if (historyEntry) {
      safeHistoryEntry = sanitizeHistoryEntry(historyEntry);
      if (!safeHistoryEntry) {
        return res.status(400).json({ error: "historyEntry tidak valid" });
      }
      if (safeHistoryEntry.change !== change) {
        return res.status(400).json({ error: "Inkonsistensi: change tidak cocok dengan historyEntry" });
      }
    }

    /* ══════════════════════════════════════════════════════════
       FIX KRITIS #1 — transaksi bot (deposit/withdraw) WAJIB
       datang dari bot internal. Sebelumnya jalur ini SAMA SEKALI
       tidak dicek X-Internal-Key, jadi siapapun yang punya token
       kasino sendiri bisa langsung POST historyEntry {game:"deposit",
       result:"win", change:+berapa aja} dan saldo nambah instan
       tanpa lewat bot ataupun admin sama sekali. Ini kemungkinan
       besar akar bug "saldo gacor" yang dilaporkan.
    ══════════════════════════════════════════════════════════ */
    if (safeHistoryEntry && ALLOWED_BOT_GAMES.has(safeHistoryEntry.game)) {
      if (!isInternalRequest(req)) {
        return res.status(401).json({ error: "Unauthorized: transaksi deposit/withdraw hanya boleh dari bot" });
      }
    }

    /* ══════════════════════════════════════════════════════════
       FIX KRITIS #2 — untuk hasil game asli (bukan deposit/withdraw),
       rollId WAJIB cocok dengan roll yang benar-benar diterbitkan
       server di /api/gacha-roll (token+game+bet cocok), dan HANYA
       BOLEH DIPAKAI SEKALI. findOneAndUpdate di bawah ini atomic:
       kalau rollId tidak ada, sudah dipakai (used:true), sudah
       expired (Mongo TTL sudah hapus), atau token/game/bet tidak
       cocok dengan historyEntry yang dikirim — request DITOLAK.
       Ini menutup dua celah:
       (a) klaim hasil game tanpa pernah benar-benar main / roll,
       (b) replay: kirim ulang request sukses yang sama berkali-kali.

       CATATAN: field `result` SENGAJA TIDAK ikut di-match di sini.
       Beberapa game (mines: ada risiko nyata setelah target aman,
       plinko: winChance dihitung ulang di client by design, roulette:
       slot hijau bisa menang walau kategori awalnya "lose", blackjack:
       hasil murni dari kartu asli, belum pernah dikaitkan ke
       gacha.result sama sekali) bisa menghasilkan win/lose akhir yang
       beda dari kategori awal server — itu bukan kecurangan, itu
       desain masing-masing game. Kalau field result ikut di-match,
       skenario itu malah ditolak (ini yang kejadian & dilaporkan
       sebagai "menang error"). Perlindungan terhadap manipulasi
       tetap ada lewat MAX_GAME_MULTIPLIER cap (sanitizeHistoryEntry)
       + rollId sekali-pakai di atas — client tetap wajib actually
       roll dulu per game+bet, dan nggak bisa replay roll yang sama.
    ══════════════════════════════════════════════════════════ */
    if (safeHistoryEntry && ALLOWED_GAMES.has(safeHistoryEntry.game)) {
      if (!token || typeof token !== "string") {
        return res.status(400).json({ error: "token diperlukan untuk hasil game" });
      }
      if (!rollId || typeof rollId !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(rollId)) {
        return res.status(400).json({ error: "rollId tidak valid" });
      }

      const consumedRoll = await pendingCol.findOneAndUpdate(
        {
          _id:   rollId,
          token: token.toUpperCase(),
          game:  safeHistoryEntry.game,
          bet:   safeHistoryEntry.bet,
          used:  false,
        },
        { $set: { used: true, usedAt: new Date(), reportedResult: safeHistoryEntry.result } },
        { returnDocument: "after" }
      );

      if (!consumedRoll) {
        return res.status(409).json({ error: "Roll tidak ditemukan, sudah dipakai, kedaluwarsa, atau tidak cocok dengan token/game/bet" });
      }
    }

    const baseMatch   = token ? { token } : { owner };
    const elemMatch   = change < 0 ? { ...baseMatch, balance: { $gte: -change } } : baseMatch;
    const arrayFilter = token ? { "elem.token": token } : { "elem.owner": owner };

    const update = { $inc: { "tokens.$[elem].balance": change } };
    if (safeHistoryEntry) {
      update.$push = { "tokens.$[elem].history": safeHistoryEntry };
    }

    const updatedDoc = await col.findOneAndUpdate(
      { _id: DOC_ID, tokens: { $elemMatch: elemMatch } },
      update,
      { arrayFilters: [arrayFilter], returnDocument: "after" }
    );

    if (!updatedDoc) {
      /* NOTE: kalau update saldo gagal di titik ini padahal roll sudah
         ke-consume di atas, roll itu "hangus" (nggak bisa dipakai lagi)
         tapi saldo juga nggak berubah — aman, cuma bikin player harus
         main ulang. Ini trade-off yang jauh lebih aman daripada rollback
         manual yang malah bisa dieksploitasi race condition-nya. */
      return res.status(409).json({ error: "Update ditolak: token/owner tidak ditemukan atau saldo tidak cukup" });
    }

    const updatedToken = (updatedDoc.tokens || []).find(t =>
      token ? t.token === token : t.owner === owner
    );

    return res.status(200).json({ success: true, balance: updatedToken ? updatedToken.balance : null });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
