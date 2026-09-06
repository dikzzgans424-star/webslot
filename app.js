/* ══════════════════════════════════════
   CORE — Token system, game picker, balance
══════════════════════════════════════ */

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

let currentFile  = null;
let currentToken = null;
let _gameActive  = false;

const MAX_ABS_CHANGE = 1000000000000000;
const MAX_BET_NORMAL  = 50000;
const MAX_BET_PREMIUM = 100000;
function getMaxBet() {
  return currentToken?.isPremium ? MAX_BET_PREMIUM : MAX_BET_NORMAL;
}

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

function maxPossibleChange(game, bet) {
  const mult = MAX_GAME_MULTIPLIER[game] || 2;
  return Math.ceil(bet * (mult - 1));
}

const GAME_MULTIPLIER = {
  reelsgird:   2,
  roulette:  2,
  coinflip:  2,
  horserace: 2,
  airplane:  null,
  blackjack: 2,
  plinko:    null,
  mines:     null,
  wheel:     null,
  hilo:      null,
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
  withdraw:  '💸 Withdraw',
};

const GAME_BUTTONS = {
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
};

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

function setStatus(msg, active = false) {
  statusText.textContent = msg;
  statusDot.classList.toggle('active', active);
}

function setTokenSlotMode(mode) {
  const card = document.getElementById('tokenInputCard');
  const btn  = document.getElementById('backToDashboardBtn');
  if (!card || !btn) return;

  card.style.display = (mode === 'input') ? '' : 'none';
  btn.style.display  = (mode === 'back')  ? '' : 'none';
}

function backToDashboard() {
  _gameActive = false;
  hideGame();
  showTokenDashboard();
}

function _updateDashboardBalance(newBalance) {
  const balEl = document.getElementById('tokenBalanceDisplay');
  if (balEl) {
    balEl.innerHTML = `${newBalance} <span class="token-balance-unit">bet</span>`;
    balEl.style.transition = 'color 0.2s';
    balEl.style.color = '#4caf82';
    setTimeout(() => { balEl.style.color = ''; }, 1200);
  }
  const rpEl = balEl?.parentElement?.querySelector('.token-balance-rp');
  if (rpEl) rpEl.textContent = formatRp(betToRp(newBalance));
}

function shakeInput() {
  const inp = document.getElementById('gachaId');
  if(!inp) return;
  inp.style.animation = 'none';
  inp.getBoundingClientRect();
  inp.style.animation = 'shake 0.4s ease';
}

function formatRp(amount) {
  return 'Rp ' + Number(amount).toLocaleString('id-ID');
}

function betToRp(bet) { return bet * 1000; }

/* ── API via Serverless Functions ── */
async function getTokenData(token) {
  const res = await fetch('/api/profile?token=' + encodeURIComponent(token) + '&_=' + Date.now());
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Gagal mengambil data dari server');
  }
  const json = await res.json();
  if (json.balance !== undefined) {
    return { data: { tokens: [json] } };
  }
  return {
    sha: json.sha,
    data: JSON.parse(atob(json.content.replace(/\n/g, '')))
  };
}

async function applyGameResult(token, change, historyEntry, rollId) {
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

async function startSpin() {
  if (_gameActive) {
    setStatus('⛔ Selesaikan game yang sedang berjalan dulu.');
    shakeInput();
    return;
  }

  const tokenInputEl = document.getElementById('gachaId');
  const token = tokenInputEl ? tokenInputEl.value.trim().toUpperCase() : '';
  if (!token) { setStatus('⚠ Masukkan token terlebih dahulu.'); shakeInput(); return; }

  const btn = document.getElementById('spinBtn');
  if(btn) btn.disabled = true;
  setStatus('Mengecek token...', true);

  try {
    currentFile  = await getTokenData(token);
    currentToken = (currentFile.data.tokens || [])[0];
    if (currentToken && currentToken.token.toUpperCase() !== token) {
      currentToken = null;
    }

    if (!currentToken) { setStatus('❌ Token tidak ditemukan'); if(btn) btn.disabled = false; return; }
    if (currentToken.balance <= 0) { setStatus('❌ Saldo token habis'); if(btn) btn.disabled = false; return; }

    localStorage.setItem('miwa_token', currentToken.token);

    setStatus('✅ Token valid — pilih game!');
    showTokenDashboard();
    if(btn) btn.disabled = false;

  } catch (err) {
    console.error(err);
    setStatus('❌ ERROR: ' + err.message);
    if(btn) btn.disabled = false;
  }
}

function showTokenDashboard() {
  const old = document.getElementById('tokenDashboard');
  if (old) old.remove();
  hideGame();
  
  setTokenSlotMode('hidden');

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

  function gameMultiLabel(key) {
    if (key === 'airplane')  return 'Multiplier';
    if (key === 'plinko')    return '0.5× – 8×';
    if (key === 'mines')     return 'Cashout × (s/d)';
    if (key === 'roulette')  return '2× / green 2.5×';
    if (key === 'wheel')     return '0.5× – 5×';
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
      <div class="token-game-grid">
        ${Object.entries(GAME_BUTTONS).map(([key, label]) => {
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
    SFX.generic.error();
    setStatus('🔒 Game ini khusus token Premium.');
    return;
  }
  SFX.generic.click();
  _selectedGame = game;
  openBetModal(game);
}

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
}

function closeBetModal(restoreDashboard = false) {
  const modal = document.getElementById('betModal');
  if (!modal) return;
  modal.classList.remove('show');
  setTimeout(() => modal.remove(), 250);

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

  const overLimit  = val >= 1 && maxPossibleChange(_selectedGame, val) > MAX_ABS_CHANGE;
  const overMaxBet = val >= 1 && val > getMaxBet();

  const valid = val >= 1 && val <= currentToken.balance && !overLimit && !overMaxBet;
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
    preview.textContent = `⚠ Max bet ${currentToken.isPremium ? 'Premium' : 'Normal'}: ${maxBet.toLocaleString()} bet`;
    preview.className = 'bet-modal-preview warn';
    return;
  }
  if (overLimit) {
    preview.textContent = '⚠ Bet terlalu besar — potensi kemenangan melebihi limit sistem';
    preview.className = 'bet-modal-preview warn';
    return;
  }

  if (_selectedGame === 'airplane') {
    preview.innerHTML = `Taruhan <strong>${val} bet</strong> (${formatRp(betToRp(val))})<br>Menang: <em>tergantung multiplier</em>`;
  } else if (_selectedGame === 'roulette') {
    const prize = val * 2;
    preview.innerHTML = `Taruhan <strong>${val} bet</strong> (${formatRp(betToRp(val))}) &nbsp;→&nbsp; Menang <strong class="gold">${prize} bet</strong>`;
  } else {
    const prize = val * (GAME_MULTIPLIER[_selectedGame] || 2);
    preview.innerHTML = `Taruhan <strong>${val} bet</strong> &nbsp;→&nbsp; Menang <strong class="gold">${prize} bet</strong>`;
  }
  preview.className = 'bet-modal-preview active';
}

function submitBetModal() {
  const inp = document.getElementById('betModalInput');
  const val = parseInt(inp?.value) || 0;
  if (val < 1 || val > currentToken.balance) return;

  SFX.generic.click();
  closeBetModal();
  _currentBet = val;
  _launchGame();
}

let _currentBet    = 0;
let _currentRollId = null;

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
  if (_currentBet > getMaxBet()) {
    setStatus(`⚠ Max bet ${currentToken.isPremium ? 'Premium' : 'Normal'}: ${getMaxBet().toLocaleString()} bet`);
    return;
  }

  _gameActive = true;
  setTokenSlotMode('back');

  const dashboard = document.getElementById('tokenDashboard');
  if (dashboard) dashboard.style.display = 'none';

  _showWaitingPlaceholder();

  const betRp   = betToRp(_currentBet);
  const prizeRp = (_selectedGame === 'airplane' || _selectedGame === 'plinko' || _selectedGame === 'mines' || _selectedGame === 'wheel' || _selectedGame === 'hilo')
    ? betRp
    : betToRp(_currentBet * GAME_MULTIPLIER[_selectedGame]);

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
    SFX.generic.error();
    setStatus('❌ ' + err.message);
    if (dashboard) dashboard.style.display = '';
    return;
  }

  _currentRollId = _rollResult.rollId;
  const gameObj = {
    token:     currentToken.token,
    type:      _selectedGame,
    money:     prizeRp,
    betAmount: _currentBet,
    isPremium: currentToken.isPremium || false,
    result:    _rollResult.result,
    rollId:    _rollResult.rollId,
  };

  try {
    SFX.warmup();
    const gameModule = (GAMES[_selectedGame] ?? GAMES['reelsgird'])();
    gameModule.init(gameObj, onGameResult);
  } catch (err) {
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

async function onGameResult(isWin, moneyWon) {
  _gameActive = false;
  setTokenSlotMode('hidden');

  let balanceChange = 0;
  if (_selectedGame === 'plinko') {
    const wonBet  = Math.floor(moneyWon / 1000);
    balanceChange = wonBet - _currentBet;
  } else if (isWin) {
    if (_selectedGame === 'airplane' || _selectedGame === 'mines' || _selectedGame === 'wheel') {
      const wonBet = Math.floor(moneyWon / 1000);
      balanceChange = wonBet - _currentBet;
    } else {
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
      saveOk = true;
    } else {
      await applyGameResult(currentToken.token, balanceChange, histEntry, _currentRollId);
      currentToken.balance = newBalance;
      if (!currentToken.history) currentToken.history = [];
      currentToken.history.push(histEntry);
      _updateDashboardBalance(newBalance);
      saveOk = true;
    }
  } catch (err) {
    console.error('Save error:', err);
  }

  hideGame();
  showResultInline(isWin, moneyWon, balanceChange, saveOk ? newBalance : currentToken.balance, saveOk);
}

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
    : `<div class="result-save-err">⚠ Gagal menyimpan</div>`;

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

function playAgainSameGame() {
  hideGame();
  if (!_selectedGame || !currentToken || currentToken.balance < 1) {
    backToDashboard();
    return;
  }
  selectGame(_selectedGame);
}

const tokenFormEl = document.getElementById('tokenForm');
if (tokenFormEl) {
  tokenFormEl.addEventListener('submit', e => {
    e.preventDefault();
    startSpin();
  });
}

window.addEventListener('beforeunload', (e) => {
  if (_gameActive) {
    e.preventDefault();
    e.returnValue = 'Game sedang berjalan!';
  }
});

/* Routing Berdasarkan Query Parameter URL (?profile= / ?token=) */
window.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const tokenParam = urlParams.get('token');
  const profileParam = urlParams.get('profile');

  if (profileParam) {
    const inputSlot = document.getElementById('tokenInputSlot');
    if (inputSlot) inputSlot.style.display = 'none';
    
    const profileView = document.getElementById('profileView');
    if (profileView) profileView.style.display = 'block';

    try {
      const file = await getTokenData(profileParam);
      const userData = file.data.tokens[0];

      if (userData && userData.token.toUpperCase() === profileParam.toUpperCase()) {
        document.getElementById('profId').innerText = userData.token;
        
        const badge = userData.isPremium ? '<span class="badge-premium">★ Premium</span>' : '<span class="badge-regular">Regular</span>';
        document.getElementById('profStatus').innerHTML = badge;
        
        document.getElementById('profBalance').innerText = userData.balance.toLocaleString() + ' bet';
        
        const history = userData.history || [];
        const totalGames = history.length;
        const totalWins = history.filter(h => h.result === 'win').length;
        const winRate = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0;

        document.getElementById('profGames').innerText = totalGames + 'x Play';
        document.getElementById('profWr').innerText = winRate + '% Win Rate';

        document.getElementById('btnMasukGame').onclick = () => {
          window.location.href = '?token=' + userData.token;
        };

      } else {
        document.getElementById('profId').innerText = 'TIDAK DITEMUKAN';
        document.getElementById('profBalance').innerText = '0 bet';
      }
    } catch (err) {
      document.getElementById('profId').innerText = 'GAGAL MEMUAT';
    }

  } else if (tokenParam || localStorage.getItem('miwa_token')) {
    const savedToken = tokenParam || localStorage.getItem('miwa_token');
    const inp = document.getElementById('gachaId');
    if (inp) {
      inp.value = savedToken;
      startSpin();
    }
    if (tokenParam) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }
});

function logoutToken() {
  if (_gameActive) {
    setStatus('⛔ Selesaikan game dulu!');
    shakeInput();
    return;
  }
  localStorage.removeItem('miwa_token');
  location.reload();
}
