/* ══════════════════════════════════════
   CORE — Token system, game picker, balance
══════════════════════════════════════ */

/* ── SFX toggle (header button) ── */
function toggleSfx() {
  const muted = SFX.toggleMute();
  _syncSfxBtn(muted);
}
function _syncSfxBtn(muted) {
  const btn = document.getElementById('sfxToggleBtn');
  if (btn) { btn.textContent = muted ? '🔇' : '🔊'; btn.classList.toggle('muted', muted); }
}
_syncSfxBtn(SFX.isMuted());
document.addEventListener('sfxMuteChange', e => _syncSfxBtn(e.detail.muted));


const statusText = document.getElementById('statusText');
const statusDot  = document.getElementById('statusDot');

/* ── State ── */
let currentFile  = null;
let currentToken = null;
let _gameActive  = false;

/* HARUS SAMA dengan MAX_ABS_CHANGE di netlify/functions/gacha-update.js
   -> kalau diubah di server, ubah juga di sini biar validasinya nyambung. */
const MAX_ABS_CHANGE = 1000000000000000;

/* Max bet per main: normal 50jt bet, premium 100jt bet */
const MAX_BET_NORMAL  = 50000;
const MAX_BET_PREMIUM = 100000;
/* Config dari admin (/api/config): game on/off, unggulan, min/max bet, premium-only */
let SITE_CFG = null;
async function loadSiteConfig() {
  try {
    const r = await fetch('/api/config?_=' + Date.now());
    if (r.ok) SITE_CFG = await r.json();
  } catch (e) {}
  return SITE_CFG;
}
function gcfg(game) { return SITE_CFG?.games?.[game] || null; }
function isGameEnabled(game) { const g = gcfg(game); return g ? g.enabled : true; }
function isPremiumOnly(game) { const g = gcfg(game); return g ? g.premiumOnly : PREMIUM_ONLY_GAMES.has(game); }
function getMinBet(game) { return gcfg(game || _selectedGame)?.minBet || 1; }
function getMaxBet(game) {
  const g = gcfg(game || _selectedGame);
  if (g && g.maxBet > 0) return g.maxBet;
  return currentToken?.isPremium ? MAX_BET_PREMIUM : MAX_BET_NORMAL;
}

/* Popup token di-ban */
function showBanPopup(reason) {
  const old = document.getElementById('banPopup'); if (old) old.remove();
  const m = document.createElement('div');
  m.id = 'banPopup';
  m.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;padding:20px;';
  m.innerHTML = `<div style="background:#16161d;border:1px solid #cf5c5c;border-radius:18px;padding:26px 22px;max-width:340px;text-align:center;color:#f0ede8;font-family:Syne,sans-serif;">
    <div style="font-size:42px;margin-bottom:8px;">🚫</div>
    <div style="font-weight:800;font-size:16px;color:#cf5c5c;margin-bottom:8px;">Token di-ban oleh Owner</div>
    <div style="font-size:12.5px;color:#9b988f;line-height:1.5;margin-bottom:16px;">${reason ? 'Alasan: ' + String(reason).replace(/</g,'&lt;') + '<br>' : ''}Hubungi Owner jika merasa ini kesalahan.</div>
    <button onclick="document.getElementById('banPopup').remove()" style="padding:10px 22px;border-radius:10px;border:1px solid #cf5c5c;background:transparent;color:#cf5c5c;font-weight:700;cursor:pointer;">Tutup</button></div>`;
  document.body.appendChild(m);
}

/* Multiplier TERBESAR yang mungkin kejadian per game (worst case buat
   server / best case buat user), dipakai buat cegah bet yang potensi
   kemenangannya bisa lebih besar dari MAX_ABS_CHANGE.
   - reelsgird : mode 6x3, 6 sama = 5.5x (multiplier tertinggi di multTable
                 semua mode — lihat games/reelsgird.js)
   - coinflip/horserace/blackjack/roulette: tetap 2x
   - airplane  : crash maksimum 22.22x, kena pajak 5% -> ~21.109x
   - plinko    : slot tertinggi di tabel MULTS = 8x
   - mines     : MULT_CAP = 15x */
const MAX_GAME_MULTIPLIER = {
  reelsgird: 5.5,
  roulette:  2.5,   /* hijau = 2.5x */
  coinflip:  2,
  horserace: 2,
  blackjack: 2,
  airplane:  22.22 * 0.95,
  plinko:    8,
  mines:     15,
  wheel:     7,
  hilo:      10,
};

function maxPossibleChange(game, bet) {
  const mult = MAX_GAME_MULTIPLIER[game] || 2;
  return Math.ceil(bet * (mult - 1));
}

/* ── Multiplier per game ── */
const GAME_MULTIPLIER = {
  reelsgird:   2,
  roulette:  2,     /* roulette hitung prize di dalam roulette.js sendiri */
  coinflip:  2,
  horserace: 2,
  airplane:  null,  /* Multiplier, kena pajak 5% */
  blackjack: 2,
  plinko:    null,  /* Multiplier bervariasi 0.3x-10x, dihitung di plinko.js */
  mines:     null,  /* Multiplier bervariasi (cashout kapan saja), dihitung di mines.js */
  wheel:     null,  /* Multiplier bervariasi sesuai segment, dihitung di wheel.js */
  hilo:      null,  /* Multiplier bervariasi (cashout kapan saja), dihitung di hilo.js */
};

const GAME_LABELS = {
  reelsgird:   '🎰 Reels Gird',
  roulette:  '🎡 Roulette',
  coinflip:  '🪙 Coin Flip',
  horserace: '🏇 Horse Race',
  plinko:    '🟣 Plinko',
  wheel:     '🎯 Wheel of Fortune',
  blackjack: '🃏 Blackjack',
  hilo:      '🔮 Hi-Lo',
  airplane:  '✈️ AirPlane',
  mines:     '💣 Mines',
  deposit:   '💰 Deposit',
  admin_add: '🛠 Tambah Saldo (Admin)',
  admin_sub: '🛠 Kurangi Saldo (Admin)',
  bonus:     '🎁 Bonus',
  withdraw:  '💸 Withdraw',
};

/* Hanya game yang bisa dipilih user — deposit/withdraw tidak masuk tombol */
const GAME_BUTTONS = {
  reelsgird:   '🎰 Reels Gird',
  roulette:  '🎡 Roulette',
  coinflip:  '🪙 Coin Flip',
  horserace: '🏇 Horse Race',
  blackjack: '🃏 Blackjack',
  hilo:      '🔮 Hi-Lo',
  plinko:    '🟣 Plinko',
  wheel:     '🎯 Wheel of Fortune',
  airplane:  '✈️ AirPlane',
  mines:     '💣 Mines',
};

/* Game yang cuma bisa dimainkan token premium */
const PREMIUM_ONLY_GAMES = new Set(['airplane', 'mines']);

const GAMES = {
  reelsgird:   () => ReelsGrid,
  roulette:  () => Roulette,
  coinflip:  () => CoinFlip,
  airplane:  () => Airplane,
  horserace: () => HorseRace,
  blackjack: () => Blackjack,
  plinko:    () => Plinko,
  mines:     () => Mines,
  wheel:     () => Wheel,
  hilo:      () => HiLo,
};

/* ────────────────────────────────────────
   HELPERS
──────────────────────────────────────── */
function setStatus(msg, active = false) {
  statusText.textContent = msg;
  statusDot.classList.toggle('active', active);
}

/* ── Toggle antara: card input token  <->  tombol Back to Dashboard ──
   mode 'input'  : tampilkan card input token (state awal, sebelum punya token)
   mode 'back'   : tampilkan tombol back (lagi di game, tapi game belum mulai animasi)
   mode 'hidden' : sembunyikan keduanya (game sedang berjalan/animasi) */
function setTokenSlotMode(mode) {
  const card = document.getElementById('tokenInputCard');
  const btn  = document.getElementById('backToDashboardBtn');
  if (!card || !btn) return;

  card.style.display = (mode === 'input') ? '' : 'none';
  btn.style.display  = (mode === 'back')  ? '' : 'none';
}

function backToDashboard() {
  _gameActive = false; // Reset state agar bisa kembali dari lobby game
  hideGame();
  showTokenDashboard();
}

/* Update elemen saldo di dashboard yang sudah ada di DOM
   tanpa perlu rebuild seluruh dashboard — dipanggil setelah game selesai. */
function _updateDashboardBalance(newBalance) {
  const balEl = document.getElementById('tokenBalanceDisplay');
  if (balEl) {
    balEl.innerHTML = `${newBalance} <span class="token-balance-unit">bet</span>`;
    /* Animasi singkat highlight supaya user tau saldo berubah */
    balEl.style.transition = 'color 0.2s';
    balEl.style.color = '#4caf82';
    setTimeout(() => { balEl.style.color = ''; }, 1200);
  }
  const rpEl = balEl?.parentElement?.querySelector('.token-balance-rp');
  if (rpEl) rpEl.textContent = formatRp(betToRp(newBalance));
}

function shakeInput() {
  const inp = document.getElementById('gachaId');
  inp.style.animation = 'none';
  inp.getBoundingClientRect();
  inp.style.animation = 'shake 0.4s ease';
}

function formatRp(amount) {
  return 'Rp ' + Number(amount).toLocaleString('id-ID');
}

function betToRp(bet) { return bet * 1000; }

/* ────────────────────────────────────────
   API — GitHub via Netlify Functions
──────────────────────────────────────── */
async function getTokenData(token) {
  /* FIX: kirim token sebagai query param supaya server hanya return
     data milik token itu saja — bukan expose semua token ke semua user. */
  const res = await fetch('/api/gacha?token=' + encodeURIComponent(token) + '&_=' + Date.now());
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const e = new Error(err.error || 'Gagal mengambil data dari server');
    if (res.status === 401 || err.needLogin) e.needLogin = true;
    if (err.banned) { e.banned = true; e.reason = err.reason || ''; }
    throw e;
  }
  const json = await res.json();
  if (!json.content) throw new Error(json.message || 'Content tidak ditemukan');
  return {
    sha:  json.sha,
    data: JSON.parse(atob(json.content.replace(/\n/g, '')))
  };
}

/* FIX poin 1 & 2: kirim DELTA saldo + history entry aja, bukan kirim ulang
   seluruh array tokens. Server (gacha-update.js) yang akan apply $inc
   secara atomik dan validasi saldo nggak boleh minus. Ini menghilangkan
   race condition read-modify-write dan memindahkan validasi ke server. */
async function applyGameResult(token, change, historyEntry, rollId) {
  /* FIX: sertakan rollId agar server bisa verifikasi hasil cocok dengan
     roll yang sudah dikeluarkan sebelumnya. */
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);   /* jangan menggantung selamanya */
  try {
    const res = await fetch('/api/gacha-update', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ token, change, historyEntry, rollId }),
      signal:  ctrl.signal
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const e   = new Error(err.error || 'Gagal menyimpan data');
      e.status  = res.status;
      throw e;
    }
  } finally {
    clearTimeout(timer);
  }
}

/* ────────────────────────────────────────
   FALLBACK SIMPAN — maksimal 3x percobaan
   - Retry hanya untuk error sementara (jaringan putus, timeout, 5xx, 408, 429)
   - Penolakan pasti dari server (400/401/409 di percobaan pertama) TIDAK di-retry
   - rollId cuma bisa dipakai sekali: kalau percobaan sebelumnya sebenarnya
     sudah masuk tapi responsnya hilang, retry akan ditolak 409. Karena itu
     sebelum menyerah, cek dulu ke server apakah hasil ini sudah tersimpan.
──────────────────────────────────────── */
const SAVE_MAX_TRIES = 3;
const _sleep = ms => new Promise(r => setTimeout(r, ms));

async function _checkAlreadySaved(token, historyEntry, expectedBalance) {
  try {
    const f = await getTokenData(token);
    const t = (f.data.tokens || [])[0];
    if (!t) return { saved: false };
    const inHistory = (t.history || []).some(h => h && h.at === historyEntry.at && h.game === historyEntry.game);
    return { saved: inHistory || t.balance === expectedBalance, balance: t.balance };
  } catch (_) {
    return { saved: false };
  }
}

async function saveResultWithRetry(token, change, historyEntry, rollId, expectedBalance) {
  let lastErr = null, serverBalance = null;
  for (let i = 1; i <= SAVE_MAX_TRIES; i++) {
    if (i > 1) setStatus('💾 Menyimpan hasil... (percobaan ' + i + '/' + SAVE_MAX_TRIES + ')', true);
    try {
      await applyGameResult(token, change, historyEntry, rollId);
      return { ok: true, tries: i };
    } catch (err) {
      lastErr = err;
      console.error('Save error (percobaan ' + i + '/' + SAVE_MAX_TRIES + '):', err);
      const st        = err.status;
      const transient = !st || st >= 500 || st === 408 || st === 429;
      const maybeDup  = st === 409 && i > 1;       /* percobaan sebelumnya mungkin sudah masuk */

      if (!transient && !maybeDup) break;          /* ditolak server → jangan retry */

      const chk = await _checkAlreadySaved(token, historyEntry, expectedBalance);
      if (chk.balance != null) serverBalance = chk.balance;
      if (chk.saved) return { ok: true, tries: i, verified: true };
      if (maybeDup) break;

      if (i < SAVE_MAX_TRIES) await _sleep(700 * i);   /* 0.7s, 1.4s */
    }
  }
  return { ok: false, error: lastErr, balance: serverBalance };
}

/* ────────────────────────────────────────
   STEP 1 — CEK TOKEN
──────────────────────────────────────── */
async function startSpin() {
  if (_gameActive) {
    setStatus('⛔ Selesaikan game yang sedang berjalan dulu.');
    shakeInput();
    return;
  }

  /* Identitas dari cookie sesi (httpOnly); "SESSION" hanya penanda, bukan token asli */
  const token = 'SESSION';

  const btn = document.getElementById('spinBtn');
  btn.disabled = true;
  setStatus('Memeriksa sesi...', true);

  try {
    await loadSiteConfig();
    if (SITE_CFG?.maintenance?.on) {
      setStatus('🛠 ' + (SITE_CFG.maintenance.msg || 'Sedang maintenance, coba lagi nanti'));
      btn.disabled = false; return;
    }
    /* FIX: kirim token ke server, server hanya return data token itu saja */
    currentFile  = await getTokenData(token);
    currentToken = (currentFile.data.tokens || [])[0];
    /* Validasi ulang: pastikan token yang dikembalikan cocok */
    if (currentToken && currentToken.token.toUpperCase() !== token) {
      currentToken = null;
    }

    if (!currentToken) { setStatus('( ! ) Akun tidak ditemukan'); btn.disabled = false; return; }
    /* Saldo 0 tetap boleh masuk (lihat dashboard/riwayat); yang diblok cuma main game — lihat selectGame() */

    /* ── Anti-refresh: simpan token ke localStorage ── */
    try { localStorage.removeItem('miwa_token'); } catch (_) {}   /* sisa login lama */

    setStatus(currentToken.balance < 1 ? '✅ Berhasil masuk — saldo habis, isi saldo dulu untuk main.' : '✅ Berhasil masuk — pilih game!');
    showTokenDashboard();
    btn.disabled = false;

  } catch (err) {
    console.error(err);
    if (err.banned) {
      localStorage.removeItem('miwa_token');
      setStatus('🚫 Token di-ban oleh Owner');
      showBanPopup(err.reason);
    } else if (err.needLogin) {
      setStatus('🔐 Belum masuk — tekan "Masuk via WhatsApp".');
    } else {
      setStatus('❌ ERROR: ' + err.message);
    }
    btn.disabled = false;
  }
}

/* ────────────────────────────────────────
   STEP 2 — DASHBOARD TOKEN
──────────────────────────────────────── */
function showTokenDashboard() {
  const old = document.getElementById('tokenDashboard');
  if (old) old.remove();
  hideGame();
  
  setTokenSlotMode('hidden'); // Pastikan tombol back hilang di Dashboard

  const dashboard = document.createElement('div');
  dashboard.id        = 'tokenDashboard';
  dashboard.className = 'info-card';

  const history = (currentToken.history || []).slice(-5).reverse();
  const historyHTML = history.length ? history.map(h => `
    <div class="token-history-row ${h.result}">
      <span class="token-history-game">${GAME_LABELS[h.game] || h.game}</span>
      <span class="token-history-bet">${h.bet} bet</span>
      <span class="token-history-result">${h.result === 'win' ? '▲ +' + h.change : '▼ −' + Math.abs(h.change)} bet</span>
    </div>
  `).join('') : `<div class="token-history-empty">Belum ada riwayat</div>`;

  /* Label multiplier roulette tampilkan "2× / hijau 2.5×" */
  function gameMultiLabel(key) {
    if (key === 'airplane')  return 'Multiplier';
    if (key === 'plinko')    return '0.5× – 8×';
    if (key === 'mines')     return 'Cashout × (s/d)';
    if (key === 'roulette')  return '2× / green 2.5×';
    if (key === 'wheel')     return '0× – 7×';
    if (key === 'hilo')      return 'Streak × (s/d 10×)';
    return GAME_MULTIPLIER[key] + '×';
  }

  dashboard.innerHTML = `
<div class="info-card-header">
      <span class="info-card-title">💳 Token Aktif</span>
      <div style="display: flex; gap: 8px; align-items: center;">
        <span class="info-card-id"></span>
        <button onclick="logoutToken()" style="background: rgba(207,92,92,0.1); border: 1px solid var(--lose-red); color: var(--lose-red); padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 9px; font-weight: bold; letter-spacing: 1px;">✕ LogOut</button>
      </div>
    </div>

    <div class="token-balance-wrap">
      <div class="token-balance-label">SALDO TOKEN</div>
      <div class="token-balance-value" id="tokenBalanceDisplay">
        ${currentToken.balance} <span class="token-balance-unit">bet</span>
      </div>
      <div class="token-balance-rp">${formatRp(betToRp(currentToken.balance))}</div>
    </div>

    <div class="token-game-section">
      <div class="token-section-label">PILIH GAME</div>
      ${currentToken.balance < 1 ? '<div class="token-empty-msg" style="margin-bottom:12px">Saldo habis — isi saldo lewat bot (.casino depo) untuk bisa main.</div>' : ''}
      <div class="token-game-grid">
        ${Object.entries(GAME_BUTTONS)
          .filter(([key]) => isGameEnabled(key))
          .sort((a, b) => (gcfg(b[0])?.featured ? 1 : 0) - (gcfg(a[0])?.featured ? 1 : 0))
          .map(([key, label]) => {
          const noBal  = currentToken.balance < 1;
          const locked = (isPremiumOnly(key) && !currentToken.isPremium) || noBal;
          const star = gcfg(key)?.featured ? '⭐ ' : '';
          return `
          <button class="token-game-btn ${locked ? 'locked' : ''}" id="gameBtn_${key}"
                  onclick="selectGame('${key}')" ${locked ? `title="${noBal ? 'Saldo habis' : 'Khusus token Premium'}"` : ''}>
            ${star}${label} ${locked ? '🔒' : ''}
            <span class="token-game-multi">${noBal ? 'Saldo habis' : locked ? 'Premium only' : gameMultiLabel(key)}</span>
          </button>
        `;}).join('')}
      </div>
    </div>

    <div class="token-history-section">
      <div class="token-section-label">RIWAYAT TERAKHIR</div>
      ${historyHTML}
    </div>

  `;

  document.getElementById('tokenInputSlot').insertAdjacentElement('afterend', dashboard);
  requestAnimationFrame(() => dashboard.classList.add('show'));
}

let _selectedGame = null;

function selectGame(game) {
  if (!isGameEnabled(game)) {
    SFX.generic.error();
    setStatus('⛔ Game ini sedang dinonaktifkan.');
    return;
  }
  if (isPremiumOnly(game) && !currentToken?.isPremium) {
    SFX.generic.error();
    setStatus('🔒 Game ini khusus token Premium.');
    return;
  }
  if (!currentToken || currentToken.balance < 1) {
    SFX.generic.error();
    setStatus('💸 Saldo habis — isi saldo lewat bot (.casino depo) untuk main.');
    return;
  }
  SFX.generic.click();
  _selectedGame = game;
  openBetModal(game);
}

/* ────────────────────────────────────────
   BET MODAL
──────────────────────────────────────── */
function openBetModal(game) {
  const old = document.getElementById('betModal');
  if (old) old.remove();

  const label      = GAME_LABELS[game];
  const isAirplane = game === 'airplane';
  const isRoulette = game === 'roulette';
  let multiText;
  if (isAirplane)       multiText = 'Multiplier';
  else if (isRoulette)  multiText = '2× menang · hijau 2.5× (house)';
  else if (game === 'plinko' || game === 'mines' || game === 'wheel' || game === 'hilo')
                         multiText = 'Multiplier bervariasi';
  else                  multiText = `${GAME_MULTIPLIER[game]}× kemenangan`;

  const modal = document.createElement('div');
  modal.id        = 'betModal';
  modal.className = 'bet-modal-overlay';
  modal.innerHTML = `
    <div class="bet-modal-box">

      <div class="bet-modal-header">
        <div class="bet-modal-game">${label}</div>
        <div class="bet-modal-multi">${multiText}</div>
        <button class="bet-modal-close" onclick="closeBetModal(true)">✕</button>
      </div>

      <div class="bet-modal-balance">
        Saldo: <strong>${currentToken.balance} bet</strong>
        <span>(${formatRp(betToRp(currentToken.balance))})</span>
      </div>

      <div class="bet-modal-label">Jumlah Bet <span style="opacity:.6;font-weight:400">(min ${getMinBet(game)} · max ${getMaxBet(game).toLocaleString()})</span></div>
      <div class="bet-modal-input-row">
        <input id="betModalInput" type="number"
               min="1" max="${currentToken.balance}"
               placeholder="Masukkan jumlah bet..."
               oninput="onModalBetInput()"
               onkeydown="if(event.key==='Enter') submitBetModal()">
        <button class="bet-modal-max" onclick="setModalMaxBet()">MAX</button>
      </div>

      <div class="bet-modal-preview" id="betModalPreview"></div>

      <div class="bet-modal-quick-label">Pilih cepat</div>
      <div class="bet-modal-quick-row">
        ${[10, 25, 50, 100].filter(v => v <= currentToken.balance).map(v => `
          <button class="bet-modal-quick-btn" onclick="setModalBet(${v})">${v}</button>
        `).join('')}
        <button class="bet-modal-quick-btn" onclick="setModalBet(Math.floor(currentToken.balance/2))">½</button>
      </div>

      <button class="bet-modal-start" id="betModalStart"
              onclick="submitBetModal()" disabled>
        ▶ &nbsp;Mulai ${label}
      </button>

    </div>
  `;

  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('show'));

  /* Auto bet: isi otomatis dengan bet terakhir game ini (tetap bisa diganti,
     game TIDAK langsung jalan — pemain harus tekan Mulai). */
  const _last = _getLastBet(game);
  if (_last > 0) {
    const _inp = document.getElementById('betModalInput');
    if (_inp) {
      _inp.value = Math.max(1, Math.min(_last, currentToken.balance, getMaxBet()));
      onModalBetInput();
    }
  }
  /* FIX: jangan auto-focus input -> kalau di-focus, keyboard mobile
     langsung muncul dan nutupin tombol shortcut (10/25/50/100/½).
     User sekarang bisa pilih shortcut dulu, baru ketik manual kalau perlu. */
}

function closeBetModal(restoreDashboard = false) {
  const modal = document.getElementById('betModal');
  if (!modal) return;
  modal.classList.remove('show');
  setTimeout(() => modal.remove(), 250);

  /* FIX: kalau modal ditutup pakai tombol ✕ (batal, bukan lanjut main),
     dashboard yang sempat disembunyikan saat "Main Lagi" harus
     dimunculkan lagi. Tanpa ini, UI jadi blank karena dashboard
     ke-stuck display:none dan gak ada game/result panel pengganti. */
  if (restoreDashboard) {
    const dashboard = document.getElementById('tokenDashboard');
    if (dashboard) dashboard.style.display = '';
  }
}

function setModalBet(amount) {
  const inp = document.getElementById('betModalInput');
  if (!inp) return;
  SFX.generic.select();
  inp.value = Math.min(Math.max(1, Math.floor(amount)), currentToken.balance, getMaxBet());
  onModalBetInput();
}

function setModalMaxBet() { setModalBet(currentToken.balance); }

function onModalBetInput() {
  const inp      = document.getElementById('betModalInput');
  const val      = parseInt(inp?.value) || 0;
  const preview  = document.getElementById('betModalPreview');
  const startBtn = document.getElementById('betModalStart');

  /* FIX: cegah bet yang potensi kemenangan maksimalnya bisa lebih besar
     dari MAX_ABS_CHANGE -> kalau dibiarkan, nanti game-nya kelar tapi
     hasil GAGAL disimpan ke server (server nolak, balik 400). Mending
     dicegah dari awal di bet modal-nya. */
  const overLimit  = val >= 1 && maxPossibleChange(_selectedGame, val) > MAX_ABS_CHANGE;
  const overMaxBet = val >= 1 && val > getMaxBet();

  const valid = val >= getMinBet() && val <= currentToken.balance && !overLimit && !overMaxBet;
  if (startBtn) startBtn.disabled = !valid;

  if (!preview) return;

  if (!val || val <= 0) {
    preview.textContent = ''; preview.className = 'bet-modal-preview'; return;
  }
  if (val > currentToken.balance) {
    preview.textContent = '⚠ Melebihi saldo token'; preview.className = 'bet-modal-preview warn'; return;
  }
  if (overMaxBet) {
    const maxBet = getMaxBet();
    preview.textContent = `⚠ Max bet: ${maxBet.toLocaleString()} bet`;
    preview.className = 'bet-modal-preview warn';
    return;
  }
  if (overLimit) {
    preview.textContent = '⚠ Bet terlalu besar — potensi kemenangan melebihi limit sistem';
    preview.className = 'bet-modal-preview warn';
    return;
  }

  if (_selectedGame === 'airplane') {
    preview.innerHTML = `
      Taruhan <strong>${val} bet</strong> (${formatRp(betToRp(val))})
      <br>Menang: <em>tergantung multiplier</em>
    `;
  } else if (_selectedGame === 'roulette') {
    const prize = val * 2;
    preview.innerHTML = `
      Taruhan <strong>${val} bet</strong> (${formatRp(betToRp(val))})
      &nbsp;→&nbsp;
      Menang <strong class="gold">${prize} bet</strong> (${formatRp(betToRp(prize))})
      <br><small style="color:var(--text-muted)">Hijau = house wins (2.5× tidak bisa dibet)</small>
    `;
  } else if (_selectedGame === 'plinko') {
    preview.innerHTML = `
      Taruhan <strong>${val} bet</strong> (${formatRp(betToRp(val))})
      <br>Menang: <em>tergantung slot (0.5× – 8×)</em>
    `;
  } else if (_selectedGame === 'mines') {
    preview.innerHTML = `
      Taruhan <strong>${val} bet</strong> (${formatRp(betToRp(val))})
      <br>Menang: <em>tergantung cashout (s/d 15×)</em>
    `;
  } else if (_selectedGame === 'wheel') {
    preview.innerHTML = `
      Taruhan <strong>${val} bet</strong> (${formatRp(betToRp(val))})
      <br>Menang: <em>tergantung segment (0× – 7×)</em>
    `;
  } else if (_selectedGame === 'hilo') {
    preview.innerHTML = `
      Taruhan <strong>${val} bet</strong> (${formatRp(betToRp(val))})
      <br>Menang: <em>tergantung streak tebakan (s/d 10×)</em>
    `;
  } else {
    const prize = val * GAME_MULTIPLIER[_selectedGame];
    preview.innerHTML = `
      Taruhan <strong>${val} bet</strong> (${formatRp(betToRp(val))})
      &nbsp;→&nbsp;
      Menang <strong class="gold">${prize} bet</strong> (${formatRp(betToRp(prize))})
    `;
  }
  preview.className = 'bet-modal-preview active';
}

/* ── Auto bet: simpan bet terakhir per game (fallback: bet terakhir game apa pun) ── */
function _getLastBet(game) {
  try {
    const d = JSON.parse(localStorage.getItem('miwa_last_bet') || '{}');
    return parseInt(d[game] || d._any) || 0;
  } catch (e) { return 0; }
}
function _saveLastBet(game, val) {
  try {
    const d = JSON.parse(localStorage.getItem('miwa_last_bet') || '{}');
    d[game] = val; d._any = val;
    localStorage.setItem('miwa_last_bet', JSON.stringify(d));
  } catch (e) {}
}

function submitBetModal() {
  const inp = document.getElementById('betModalInput');
  const val = parseInt(inp?.value) || 0;
  if (val < getMinBet() || val > currentToken.balance || val > getMaxBet()) return;

  SFX.generic.click();
  closeBetModal();
  _currentBet = val;
  _saveLastBet(_selectedGame, val);
  _launchGame();
}

/* ────────────────────────────────────────
   STEP 3 — LAUNCH GAME
──────────────────────────────────────── */
let _currentBet    = 0;
let _currentRollId = null;  /* FIX: rollId dari server, untuk verifikasi saat simpan */

/* Placeholder "waiting" yang tampil di posisi slot/gameArea selagi
   nunggu server roll. Pakai id 'gameArea' sama seperti game module,
   jadi otomatis ke-replace begitu game asli mount. */
function _showWaitingPlaceholder() {
  const old = document.getElementById('gameArea');
  if (old) old.remove();

  const area = document.createElement('div');
  area.id        = 'gameArea';
  area.className = 'game-area slide-in';
  area.innerHTML = `
    <div class="slot-multi-card" style="display:flex; flex-direction:column; align-items:center; gap:14px; padding:40px 20px;">
      <div class="waiting-spinner" style="width:42px; height:42px; border:4px solid rgba(255,255,255,0.15); border-top-color:#fff; border-radius:50%; animation:waitingSpin 0.8s linear infinite;"></div>
      <div class="slot-section-label" style="margin:0;">🎲 Menyiapkan game...</div>
    </div>
    <style>
      @keyframes waitingSpin { to { transform: rotate(360deg); } }
    </style>
  `;

  const infoCard = document.getElementById('gachaInfoCard');
  if (infoCard) infoCard.replaceWith(area);
  else document.querySelector('.glass-card').insertAdjacentElement('afterend', area);
}

function _removeWaitingPlaceholder() {
  const el = document.getElementById('gameArea');
  if (el) el.remove();
}

async function _launchGame() {
  if (_gameActive || !_selectedGame || !currentToken) return;
  if (isPremiumOnly(_selectedGame) && !currentToken.isPremium) {
    setStatus('🔒 Game ini khusus token Premium.');
    return;
  }
  if (_currentBet < getMinBet() || _currentBet > currentToken.balance) {
    setStatus('⚠ Jumlah bet tidak valid.');
    return;
  }
  if (_currentBet > getMaxBet()) {
    setStatus(`⚠ Max bet: ${getMaxBet().toLocaleString()} bet`);
    return;
  }
  if (maxPossibleChange(_selectedGame, _currentBet) > MAX_ABS_CHANGE) {
    setStatus('⚠ Bet terlalu besar, potensi kemenangan melebihi limit sistem.');
    return;
  }

  _gameActive = true;
  setTokenSlotMode('back'); // Tampilkan tombol back selama di lobby/waiting start

  const dashboard = document.getElementById('tokenDashboard');
  if (dashboard) dashboard.style.display = 'none';

  /* FIX: tampilkan placeholder "waiting" persis di posisi slot/game-area
     (bukan cuma teks status) selagi nunggu server roll. Pakai id
     'gameArea' yang sama dipakai semua game module — begitu
     gameModule.init() mount game asli, placeholder ini otomatis
     ke-replace (lihat fungsi _mount di tiap games/*.js). */
  _showWaitingPlaceholder();

  const betRp   = betToRp(_currentBet);
  const prizeRp = (_selectedGame === 'airplane' || _selectedGame === 'plinko' || _selectedGame === 'mines' || _selectedGame === 'wheel' || _selectedGame === 'hilo')
    ? betRp
    : betToRp(_currentBet * GAME_MULTIPLIER[_selectedGame]);

  /* FIX: hasil win/lose sekarang ditentukan server via endpoint baru.
     Client request dulu ke /gacha-roll, server yang roll RNG dan return
     hasilnya. Ini mencegah manipulasi result lewat DevTools. */
  let _rollResult;
  try {
    const rollRes = await fetch('/api/gacha-roll', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        token:   currentToken.token,
        game:    _selectedGame,
        bet:     _currentBet,
      })
    });
    if (!rollRes.ok) {
      const e = await rollRes.json().catch(() => ({}));
      const er = new Error(e.error || 'Gagal memulai game');
      if (e.banned) er.banned = true;
      throw er;
    }
    _rollResult = await rollRes.json();
  } catch (err) {
    _gameActive = false;
    setTokenSlotMode('hidden');
    _removeWaitingPlaceholder();
    SFX.generic.error();
    setStatus('❌ ' + err.message);
    if (err.banned) { localStorage.removeItem('miwa_token'); showBanPopup(); }
    if (dashboard) dashboard.style.display = '';
    return;
  }

  _currentRollId = _rollResult.rollId;  /* simpan di luar gameObj juga */
  const gameObj = {
    token:     currentToken.token,
    type:      _selectedGame,
    money:     prizeRp,
    betAmount: _currentBet,
    isPremium: currentToken.isPremium || false,
    result:    _rollResult.result,   /* 'win' | 'lose' — dari server */
    rollId:    _rollResult.rollId,   /* ID unik untuk verifikasi saat simpan hasil */
  };

  try {
    SFX.warmup(); /* Force-resume AudioContext sebelum game animasi mulai */
    const gameModule = (GAMES[_selectedGame] ?? GAMES['reelsgird'])();
    gameModule.init(gameObj, onGameResult);
  } catch (err) {
    /* Jangan biarkan _gameActive stuck true jika init() error */
    _gameActive = false;
    setTokenSlotMode('hidden');
    _removeWaitingPlaceholder();
    console.error('Game init error:', err);
    setStatus('❌ Gagal memuat game: ' + err.message);
    if (dashboard) dashboard.style.display = '';
    return;
  }

  setStatus(`🎮 ${GAME_LABELS[_selectedGame]} — bet ${_currentBet} bet`, true);
}

function hideGame() {
  const existing = document.getElementById('gameArea');
  if (existing) existing.remove();
}

/* ────────────────────────────────────────
   RESULT CALLBACK
   moneyWon : Rp yang didapat dari game module
              roulette : betAmount * 2 * 1000  (dari roulette.js)
              Airplane : bet * multiplier * 0.95 (dari airplane.js)
              lainnya  : betAmount * GAME_MULTIPLIER * 1000
──────────────────────────────────────── */
async function onGameResult(isWin, moneyWon) {
  _gameActive = false;
  setTokenSlotMode('hidden'); // Sembunyikan tombol saat result layar selesai muncul

  let balanceChange = 0;
  if (_selectedGame === 'plinko' || (_selectedGame === 'airplane' && !isWin)) {
    /* Plinko selalu punya payout (0.3x-10x), walau "rugi" itu cuma
       rugi SEBAGIAN bet, bukan kehilangan semuanya */
    const wonBet  = Math.floor(moneyWon / 1000);
    balanceChange = wonBet - _currentBet;
  } else if (isWin) {
    if (_selectedGame === 'airplane' || _selectedGame === 'mines' || _selectedGame === 'wheel') {
      /* Variable multiplier games: moneyWon = total prize Rp (termasuk bet kembali)
         balanceChange = net gain = (prize / 1000) - bet
         Kalau mult=1x: prize = bet * 1 * 1000, balanceChange = bet - bet = 0
         → ini valid (balik modal), tapi server tolak change=0.
         Treat mult=1 sebagai minimal +1 supaya bisa disimpan, atau
         anggap lose jika change=0 (user tidak untung tapi tidak rugi).
         Solusi: jika balanceChange=0, skip save (tidak ada yang berubah). */
      const wonBet = Math.floor(moneyWon / 1000);
      balanceChange = wonBet - _currentBet;
    } else {
      /* roulette & game lain — moneyWon = prize dalam Rp */
      const prizeBet = Math.floor(moneyWon / 1000);
      balanceChange  = prizeBet - _currentBet;
    }
  } else {
    balanceChange = -_currentBet;
  }

  const newBalance = currentToken.balance + balanceChange;

  const histEntry = {
    game:   _selectedGame,
    bet:    _currentBet,
    result: isWin ? 'win' : 'lose',
    change: balanceChange,
    at:     Date.now(),
  };

  setStatus('💾 Menyimpan hasil...', true);
  let saveOk = false;
  try {
    if (balanceChange === 0) {
      /* Balik modal (misal wheel 1×) — tidak ada perubahan saldo,
         tidak perlu kirim ke server (server tolak change=0 anyway).
         Anggap "save ok" tapi tidak ada yang ditulis. */
      saveOk = true;
    } else {
      const r = await saveResultWithRetry(currentToken.token, balanceChange, histEntry, _currentRollId, newBalance);
      if (!r.ok) {
        /* Tetap gagal setelah semua percobaan: pakai saldo asli dari server kalau berhasil dibaca */
        if (r.balance != null) {
          currentToken.balance = r.balance;
          _updateDashboardBalance(r.balance);
        }
        throw r.error || new Error('Gagal menyimpan');
      }
      currentToken.balance = newBalance;
      if (!currentToken.history) currentToken.history = [];
      currentToken.history.push(histEntry);
      _updateDashboardBalance(newBalance); /* Bug fix: refresh saldo di dashboard */
      saveOk = true;
    }
  } catch (err) {
    console.error('Save error:', err);
  }

  /* Simpan info untuk laporan kalau gagal — ID main ini yang dicek owner */
  window._lastFailedSave = saveOk ? null : {
    rollId: _currentRollId, token: currentToken?.token, game: _selectedGame,
    bet: _currentBet, result: isWin ? 'win' : 'lose', change: balanceChange, at: histEntry.at,
  };

  hideGame();
  showResultInline(isWin, moneyWon, balanceChange, saveOk ? newBalance : currentToken.balance, saveOk);
}

/* ────────────────────────────────────────
   RESULT PANEL
──────────────────────────────────────── */
function showResultInline(isWin, moneyWon, balanceChange, newBalance, saveOk) {
  const area      = document.createElement('div');
  area.id         = 'gameArea';
  area.className  = 'game-area';

  /* Perubahan saldo 0 (balik modal) bukan "Menang" -> tampil "No Profit" */
  const even       = balanceChange === 0;
  const panelClass = even ? 'even-panel' : (isWin ? 'win-panel' : 'lose-panel');
  const emoji      = even ? '🤝'          : (isWin ? '🎉' : '💀');
  const title      = even ? 'No Profit'   : (isWin ? 'Menang!' : 'Belum Beruntung');
  const changeSign = balanceChange >= 0 ? '+' : '−';
  const changeAbs  = Math.abs(balanceChange);

  const _f = window._lastFailedSave;
  const saveNote = saveOk
    ? `<div class="result-save-ok">✓ Hasil tersimpan</div>`
    : `<div class="result-save-err" id="saveNoteBox">
        ⚠ Gagal menyimpan setelah ${SAVE_MAX_TRIES}x percobaan. Saldo di bawah diambil dari server.<br>
        Kirim ID main ini ke admin untuk dicek (screenshot layar ini juga ya):
        <div class="fail-id" onclick="copyFailReport()" style="margin:8px 0 4px;padding:10px;border:1px dashed currentColor;border-radius:10px;font-family:monospace;font-size:12px;word-break:break-all;cursor:pointer;">
          ID Main: <strong>${_f?.rollId || 'tidak tersedia'}</strong><br>
          <span style="opacity:.75">Ketuk untuk salin laporan</span>
        </div>
        <button type="button" id="retrySaveBtn" onclick="retrySaveNow(this)" style="width:100%;margin-top:8px;padding:11px 14px;border:0;border-radius:12px;font-weight:800;cursor:pointer;color:#0c0c0e;background:linear-gradient(135deg,#f0d080,#d4af5a);">Simpan ulang</button>
        <div id="retryMsg" style="margin-top:6px;font-size:12px;opacity:.85"></div>
      </div>`;

  area.innerHTML = `
    <div class="result-panel ${panelClass}">
      <span class="result-emoji">${emoji}</span>
      <div class="result-badge ${even ? 'even' : (isWin ? 'win' : 'lose')}">${even ? '● EVEN' : (isWin ? '● WIN' : '● LOSE')}</div>
      <div class="result-title">${title}</div>

      <div class="result-balance-change ${even ? 'even' : (isWin ? 'win' : 'lose')}">
        ${even ? '' : changeSign + ' '}${changeAbs} bet
        <span class="result-balance-change-rp">(${formatRp(betToRp(changeAbs))})</span>
      </div>

      <div class="result-balance-new">
        Saldo token sekarang:
        <strong>${newBalance} bet</strong>
        <span>(${formatRp(betToRp(newBalance))})</span>
      </div>

      <div class="result-desc">
        ${even ? 'Modal kembali, saldo tidak berubah.' : (isWin ? 'Saldo token bertambah!' : 'Lebih beruntung di ronde berikutnya.')}
      </div>

      <div class="result-meta">${saveNote}</div>
      <div class="result-divider"></div>

      <div class="result-action-row">
        ${newBalance > 0
          ? `<button class="start-game-btn" onclick="playAgainSameGame()">🎮 &nbsp;Main Lagi</button>`
          : `<div class="token-empty-msg">Saldo token habis!</div>`
        }
        <button class="back-dashboard-btn" onclick="backToDashboard()">🏠 &nbsp;Back Dashboard</button>
      </div>
    </div>
  `;

  document.getElementById('tokenInputSlot').insertAdjacentElement('afterend', area);
}

/* "Main Lagi" -> langsung balik ke bet modal game yang sama
   (skip dashboard). "Back Dashboard" -> pakai backToDashboard() yang
   udah ada di atas. */
function playAgainSameGame() {
  hideGame(); // buang result panel
  if (!_selectedGame || !currentToken || currentToken.balance < 1) {
    backToDashboard();
    return;
  }
  selectGame(_selectedGame); // re-validasi premium/saldo, lalu buka bet modal
}


/* ────────────────────────────────────────
   EVENTS
──────────────────────────────────────── */
/* FIX: pakai event 'submit' dari <form>, bukan onclick/keydown manual.
   Ini PENTING biar browser nyimpen value yang pernah diketik ke
   autocomplete history (Chrome cuma nyimpen form-history pas ada
   event submit yang ke-trigger, walau di-preventDefault). Enter di
   input & klik tombol "Cek Token" otomatis sama-sama men-trigger ini. */
document.getElementById('tokenForm').addEventListener('submit', e => {
  e.preventDefault();
  startSpin();
});

/* ────────────────────────────────────────
   ANTI-REFRESH & AUTO-LOGIN
──────────────────────────────────────── */

// 1. Peringatan jika refresh/tutup tab saat game berjalan
window.addEventListener('beforeunload', (e) => {
  if (_gameActive) {
    e.preventDefault();
    e.returnValue = 'Game sedang berjalan! Jika Anda keluar, permainan akan terhenti.';
  }
});

// 2. Auto-login otomatis saat web dibuka
window.addEventListener('DOMContentLoaded', () => {
  startSpin(); // cek sesi cookie; kalau belum masuk, tampil tombol "Masuk via WhatsApp"
});

// 3. Fungsi Keluar / Ganti Token
async function logoutToken() {
  if (_gameActive) {
    setStatus('⛔ Selesaikan game dulu sebelum keluar!');
    shakeInput();
    return;
  }
  try { localStorage.removeItem('miwa_token'); } catch (_) {}
  try {
    await fetch('/api/token-verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) });
  } catch (_) {}
  location.reload();
}

/* Salin laporan gagal-simpan (ID main + detail) untuk dikirim ke admin */
function copyFailReport() {
  const f = window._lastFailedSave;
  if (!f) return;
  const sign = f.change >= 0 ? '+' : '-';
  const text = [
    'LAPORAN GAGAL SIMPAN',
    'ID Main: ' + f.rollId,
    'Game: ' + (GAME_LABELS[f.game] || f.game),
    'Bet: ' + f.bet + ' bet',
    'Hasil: ' + f.result + ' (' + sign + Math.abs(f.change) + ' bet)',
    'Waktu: ' + new Date(f.at).toLocaleString('id-ID'),
  ].join('\n');
  const done = () => setStatus('Laporan tersalin — kirim ke admin');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, () => prompt('Salin laporan ini:', text));
  } else {
    prompt('Salin laporan ini:', text);
  }
}


/* Tombol "Simpan ulang" di panel gagal-simpan (tiap tekan = sampai 3x percobaan) */
async function retrySaveNow(btn) {
  const f = window._lastFailedSave;
  if (!f || !currentToken) return;
  const msg = document.getElementById('retryMsg');
  btn.disabled = true;
  btn.textContent = 'Menyimpan...';
  if (msg) msg.textContent = '';

  const histEntry = { game: f.game, bet: f.bet, result: f.result, change: f.change, at: f.at };
  const expected  = currentToken.balance + f.change;
  const r = await saveResultWithRetry(f.token, f.change, histEntry, f.rollId, expected);

  if (r.ok) {
    currentToken.balance = expected;
    if (!currentToken.history) currentToken.history = [];
    currentToken.history.push(histEntry);
    _updateDashboardBalance(expected);

    const box = document.getElementById('saveNoteBox');
    if (box) { box.className = 'result-save-ok'; box.innerHTML = '✓ Hasil tersimpan'; }
    const nb = document.querySelector('.result-balance-new');
    if (nb) {
      const st = nb.querySelector('strong'); if (st) st.textContent = expected + ' bet';
      const sp = nb.querySelector('span');   if (sp) sp.textContent = '(' + formatRp(betToRp(expected)) + ')';
    }
    window._lastFailedSave = null;
    setStatus('✓ Hasil tersimpan');
    return;
  }

  if (r.balance != null) { currentToken.balance = r.balance; _updateDashboardBalance(r.balance); }
  const expired = r.error && r.error.status === 409;
  btn.textContent = 'Simpan ulang';
  btn.disabled = expired;     /* 409 = roll kedaluwarsa/sudah dipakai, retry tidak akan menolong */
  if (msg) msg.textContent = expired
    ? 'ID ini sudah kedaluwarsa atau terpakai. Kirim ID Main ke admin.'
    : 'Masih gagal. Cek koneksi lalu coba lagi, atau kirim ID Main ke admin.';
}
