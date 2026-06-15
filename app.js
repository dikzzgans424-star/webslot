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

/* ── Multiplier per game ── */
const GAME_MULTIPLIER = {
  slot3x3:   2,
  roulette:  2,     /* roulette hitung prize di dalam roulette.js sendiri */
  coinflip:  2,
  horserace: 2,
  airplane:  null,  /* dynamic, kena pajak 5% */
  blackjack: 2,
};

const GAME_LABELS = {
  slot3x3:   '🎰 Slot 3×3',
  roulette:  '🎡 Roulette',
  coinflip:  '🪙 Coin Flip',
  horserace: '🏇 Horse Race',
  airplane:  '✈️ AirPlane',
  blackjack: '🃏 Blackjack',
};

const GAMES = {
  slot3x3:   () => Slot3x3,
  roulette:  () => Roulette,
  coinflip:  () => CoinFlip,
  airplane:  () => Airplane,
  horserace: () => HorseRace,
  blackjack: () => Blackjack,
};

/* ────────────────────────────────────────
   HELPERS
──────────────────────────────────────── */
function setStatus(msg, active = false) {
  statusText.textContent = msg;
  statusDot.classList.toggle('active', active);
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
async function getTokenData() {
  const res = await fetch('/.netlify/functions/gacha?_=' + Date.now());
  if (!res.ok) throw new Error('Gagal mengambil data dari server');
  const json = await res.json();
  if (!json.content) throw new Error(json.message || 'Content tidak ditemukan');
  return {
    sha:  json.sha,
    data: JSON.parse(atob(json.content.replace(/\n/g, '')))
  };
}

async function saveTokenData(data, sha) {
  const res = await fetch('/.netlify/functions/gacha-update', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ data, sha })
  });
  if (!res.ok) throw new Error('Gagal menyimpan data');
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
    currentFile  = await getTokenData();
    currentToken = (currentFile.data.tokens || []).find(
      t => t.token.toUpperCase() === token
    );

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
    if (key === 'airplane')  return 'dynamic';
    if (key === 'roulette')  return '2× / hijau 2.5×';
    return GAME_MULTIPLIER[key] + '×';
  }

  dashboard.innerHTML = `
<div class="info-card-header">
      <span class="info-card-title">💳 Token Aktif</span>
      <div style="display: flex; gap: 8px; align-items: center;">
        <span class="info-card-id">${currentToken.token}</span>
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
        ${Object.entries(GAME_LABELS).map(([key, label]) => `
          <button class="token-game-btn" id="gameBtn_${key}"
                  onclick="selectGame('${key}')">
            ${label}
            <span class="token-game-multi">${gameMultiLabel(key)}</span>
          </button>
        `).join('')}
      </div>
    </div>

    <div class="token-history-section">
      <div class="token-section-label">RIWAYAT TERAKHIR</div>
      ${historyHTML}
    </div>

  `;

  document.querySelector('.glass-card').insertAdjacentElement('afterend', dashboard);
  requestAnimationFrame(() => dashboard.classList.add('show'));
}

let _selectedGame = null;

function selectGame(game) {
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
  if (isAirplane)       multiText = 'Dynamic';
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
        <button class="bet-modal-close" onclick="closeBetModal()">✕</button>
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
  setTimeout(() => { const inp = document.getElementById('betModalInput'); if (inp) inp.focus(); }, 150);
}

function closeBetModal() {
  const modal = document.getElementById('betModal');
  if (!modal) return;
  modal.classList.remove('show');
  setTimeout(() => modal.remove(), 250);
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

  const valid = val >= 1 && val <= currentToken.balance;
  if (startBtn) startBtn.disabled = !valid;

  if (!preview) return;

  if (!val || val <= 0) {
    preview.textContent = ''; preview.className = 'bet-modal-preview'; return;
  }
  if (val > currentToken.balance) {
    preview.textContent = '⚠ Melebihi saldo token'; preview.className = 'bet-modal-preview warn'; return;
  }

  if (_selectedGame === 'airplane') {
    preview.innerHTML = `
      Taruhan <strong>${val} bet</strong> (${formatRp(betToRp(val))})
      <br>Menang: <em>tergantung multiplier − 5% pajak</em>
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
let _currentBet = 0;

function _launchGame() {
  if (_gameActive || !_selectedGame || !currentToken) return;
  if (_currentBet < 1 || _currentBet > currentToken.balance) {
    setStatus('⚠ Jumlah bet tidak valid.');
    return;
  }

  _gameActive = true;

  const dashboard = document.getElementById('tokenDashboard');
  if (dashboard) dashboard.style.display = 'none';

  const betRp   = betToRp(_currentBet);
  const prizeRp = _selectedGame === 'airplane'
    ? betRp
    : betToRp(_currentBet * GAME_MULTIPLIER[_selectedGame]);

  /* Tentukan hasil win/lose di sini (satu sumber kebenaran),
     lalu kirim ke game module via gameObj.result */
  const _winChance = (currentToken.isPremium ? 0.45 : 0.35);
  const _isWin     = Math.random() < _winChance;

  const gameObj = {
    token:     currentToken.token,
    type:      _selectedGame,
    money:     prizeRp,
    betAmount: _currentBet,
    isPremium: currentToken.isPremium || false,
    result:    _isWin ? 'win' : 'lose',   /* ← FIX Bug #2 & #4 */
  };

  try {
    const gameModule = (GAMES[_selectedGame] ?? GAMES['slot3x3'])();
    gameModule.init(gameObj, onGameResult);
  } catch (err) {
    /* FIX Bug #7: jangan biarkan _gameActive stuck true jika init() error */
    _gameActive = false;
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

  let balanceChange = 0;
  if (isWin) {
    if (_selectedGame === 'airplane') {
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

  currentToken.balance = newBalance;
  if (!currentToken.history) currentToken.history = [];
  currentToken.history.push(histEntry);

  setStatus('💾 Menyimpan hasil...', true);
  let saveOk = false;
  try {
    const freshFile = await getTokenData();
    const tokens    = freshFile.data.tokens || [];
    const idx       = tokens.findIndex(t => t.token === currentToken.token);
    if (idx !== -1) {
      tokens[idx].balance = newBalance;
      if (!tokens[idx].history) tokens[idx].history = [];
      tokens[idx].history.push(histEntry);
    }
    await saveTokenData(freshFile.data, freshFile.sha);
    saveOk = true;
  } catch (err) {
    console.error('Save error:', err);
  }

  hideGame();
  showResultInline(isWin, moneyWon, balanceChange, newBalance, saveOk);
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
    : `<div class="result-save-err">⚠ Gagal menyimpan — screenshot ini & hubungi admin (${currentToken?.token})</div>`;

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
          ? `<button class="start-game-btn" onclick="continuePlaying()">🎮 &nbsp;Main Lagi</button>`
          : `<div class="token-empty-msg">Saldo token habis!</div>`
        }
      </div>
    </div>
  `;

  document.querySelector('.glass-card').insertAdjacentElement('afterend', area);
}

function continuePlaying() {
  hideGame();
  showTokenDashboard();
}


/* ────────────────────────────────────────
   EVENTS
──────────────────────────────────────── */
document.getElementById('gachaId').addEventListener('keydown', e => {
  if (e.key === 'Enter') startSpin();
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