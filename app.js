/* ══════════════════════════════════════
   CORE — Token system, game picker, balance
══════════════════════════════════════ */

/* ── DOM refs ── */
const statusText = document.getElementById('statusText');
const statusDot  = document.getElementById('statusDot');

/* ── State ── */
let currentFile  = null;
let currentToken = null;
let _gameActive  = false;

/* HARUS SAMA dengan MAX_ABS_CHANGE di netlify/functions/gacha-update.js
   -> kalau diubah di server, ubah juga di sini biar validasinya nyambung. */
const MAX_ABS_CHANGE = 1000000000000000;

/* Multiplier TERBESAR yang mungkin kejadian per game (worst case buat
   server / best case buat user), dipakai buat cegah bet yang potensi
   kemenangannya bisa lebih besar dari MAX_ABS_CHANGE.
   - reelsgird : mode 6x3, 6 sama = 5.5x (multiplier tertinggi di multTable
                 semua mode — lihat games/reelsgird.js)
   - coinflip/horserace/blackjack/roulette: tetap 2x
   - airplane  : crash maksimum ~8.5x, kena pajak 5% -> ~8.075x
   - plinko    : slot tertinggi di tabel MULTS = 8x
   - mines     : MULT_CAP = 15x */
const MAX_GAME_MULTIPLIER = {
  reelsgird: 5.5,
  roulette:  2,
  coinflip:  2,
  horserace: 2,
  blackjack: 2,
  airplane:  8.5 * 0.95,
  plinko:    8,
  mines:     15,
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
};

const GAME_LABELS = {
  reelsgird:   '🎰 Reels Gird',
  roulette:  '🎡 Roulette',
  coinflip:  '🪙 Coin Flip',
  horserace: '🏇 Horse Race',
  airplane:  '✈️ AirPlane',
  blackjack: '🃏 Blackjack',
  plinko:    '🟣 Plinko',
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
    throw new Error(err.error || 'Gagal mengambil data dari server');
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
  const res = await fetch('/api/gacha-update', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ token, change, historyEntry, rollId })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Gagal menyimpan data');
  }
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

  const token = document.getElementById('gachaId').value.trim().toUpperCase();
  if (!token) { setStatus('⚠ Masukkan token terlebih dahulu.'); shakeInput(); return; }

  const btn = document.getElementById('spinBtn');
  btn.disabled = true;
  setStatus('Mengecek token...', true);

  try {
    /* FIX: kirim token ke server, server hanya return data token itu saja */
    currentFile  = await getTokenData(token);
    currentToken = (currentFile.data.tokens || [])[0];
    /* Validasi ulang: pastikan token yang dikembalikan cocok */
    if (currentToken && currentToken.token.toUpperCase() !== token) {
      currentToken = null;
    }

    if (!currentToken) { setStatus('❌ Token tidak ditemukan'); btn.disabled = false; return; }
    if (currentToken.balance <= 0) { setStatus('❌ Saldo token habis'); btn.disabled = false; return; }

    /* ── Anti-refresh: simpan token ke localStorage ── */
    localStorage.setItem('miwa_token', currentToken.token);

    setStatus('✅ Token valid — pilih game!');
    showTokenDashboard();
    btn.disabled = false;

  } catch (err) {
    console.error(err);
    setStatus('❌ ERROR: ' + err.message);
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
      <div class="token-game-grid">
        ${Object.entries(GAME_LABELS).map(([key, label]) => {
          const locked = PREMIUM_ONLY_GAMES.has(key) && !currentToken.isPremium;
          return `
          <button class="token-game-btn ${locked ? 'locked' : ''}" id="gameBtn_${key}"
                  onclick="selectGame('${key}')" ${locked ? 'title="Khusus token Premium"' : ''}>
            ${label} ${locked ? '🔒' : ''}
            <span class="token-game-multi">${locked ? 'Premium only' : gameMultiLabel(key)}</span>
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
  if (PREMIUM_ONLY_GAMES.has(game) && !currentToken?.isPremium) {
    setStatus('🔒 Game ini khusus token Premium.');
    return;
  }
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

      <div class="bet-modal-label">Jumlah Bet</div>
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
  inp.value = Math.min(Math.max(1, Math.floor(amount)), currentToken.balance);
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
  const overLimit = val >= 1 && maxPossibleChange(_selectedGame, val) > MAX_ABS_CHANGE;

  const valid = val >= 1 && val <= currentToken.balance && !overLimit;
  if (startBtn) startBtn.disabled = !valid;

  if (!preview) return;

  if (!val || val <= 0) {
    preview.textContent = ''; preview.className = 'bet-modal-preview'; return;
  }
  if (val > currentToken.balance) {
    preview.textContent = '⚠ Melebihi saldo token'; preview.className = 'bet-modal-preview warn'; return;
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

function submitBetModal() {
  const inp = document.getElementById('betModalInput');
  const val = parseInt(inp?.value) || 0;
  if (val < 1 || val > currentToken.balance) return;
 
  closeBetModal();
  _currentBet = val;
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
  if (PREMIUM_ONLY_GAMES.has(_selectedGame) && !currentToken.isPremium) {
    setStatus('🔒 Game ini khusus token Premium.');
    return;
  }
  if (_currentBet < 1 || _currentBet > currentToken.balance) {
    setStatus('⚠ Jumlah bet tidak valid.');
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
  const prizeRp = (_selectedGame === 'airplane' || _selectedGame === 'plinko' || _selectedGame === 'mines')
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
      throw new Error(e.error || 'Gagal memulai game');
    }
    _rollResult = await rollRes.json();
  } catch (err) {
    _gameActive = false;
    setTokenSlotMode('hidden');
    _removeWaitingPlaceholder();
    setStatus('❌ ' + err.message);
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
  if (_selectedGame === 'plinko') {
    /* Plinko selalu punya payout (0.3x-10x), walau "rugi" itu cuma
       rugi SEBAGIAN bet, bukan kehilangan semuanya */
    const wonBet  = Math.floor(moneyWon / 1000);
    balanceChange = wonBet - _currentBet;
  } else if (isWin) {
    if (_selectedGame === 'airplane' || _selectedGame === 'mines') {
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
    /* FIX poin 1 & 2: server yang validasi & apply secara atomik.
       Kalau ditolak (409 = saldo nggak cukup/race condition), JANGAN
       update currentToken.balance secara lokal — biar nggak nunjukin
       saldo palsu ke user. Suruh dia logout/login ulang buat sync. */
    await applyGameResult(currentToken.token, balanceChange, histEntry, _currentRollId);
    currentToken.balance = newBalance;
    if (!currentToken.history) currentToken.history = [];
    currentToken.history.push(histEntry);
    saveOk = true;
  } catch (err) {
    console.error('Save error:', err);
  }

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

  const panelClass = isWin ? 'win-panel'  : 'lose-panel';
  const emoji      = isWin ? '🎉'         : '💀';
  const title      = isWin ? 'Menang!'    : 'Belum Beruntung';
  const changeSign = balanceChange >= 0 ? '+' : '−';
  const changeAbs  = Math.abs(balanceChange);

  const saveNote = saveOk
    ? `<div class="result-save-ok">✓ Hasil tersimpan</div>`
    : `<div class="result-save-err">⚠ Gagal menyimpan (saldo tidak sinkron) — coba logout &amp; login ulang token untuk cek saldo terbaru. Hubungi admin kalau masih bermasalah (${currentToken?.token})</div>`;

  area.innerHTML = `
    <div class="result-panel ${panelClass}">
      <span class="result-emoji">${emoji}</span>
      <div class="result-badge ${isWin ? 'win' : 'lose'}">${isWin ? '● WIN' : '● LOSE'}</div>
      <div class="result-title">${title}</div>

      <div class="result-balance-change ${isWin ? 'win' : 'lose'}">
        ${changeSign} ${changeAbs} bet
        <span class="result-balance-change-rp">(${formatRp(betToRp(changeAbs))})</span>
      </div>

      <div class="result-balance-new">
        Saldo token sekarang:
        <strong>${newBalance} bet</strong>
        <span>(${formatRp(betToRp(newBalance))})</span>
      </div>

      <div class="result-desc">
        ${isWin ? 'Saldo token bertambah!' : 'Lebih beruntung di ronde berikutnya.'}
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
  const savedToken = localStorage.getItem('miwa_token');
  if (savedToken) {
    const inp = document.getElementById('gachaId');
    if (inp) {
      inp.value = savedToken;
      startSpin(); // Langsung otomatis login
    }
  }
});

// 3. Fungsi Keluar / Ganti Token
function logoutToken() {
  if (_gameActive) {
    setStatus('⛔ Selesaikan game dulu sebelum ganti token!');
    shakeInput();
    return;
  }
  localStorage.removeItem('miwa_token');
  location.reload();
}