/* ══════════════════════════════════════
   MINES — Grid Reveal Game
   games/mines.js

   5x5 grid (25 kotak), 3 bomb tetap (22 gem aman).
   User klik kotak satu-satu, tiap kotak aman menaikkan multiplier.
   User bisa cashout kapan saja sebelum kena bomb.

   Mekanisme predetermined result:
   - _gacha.result dari app.js menentukan "safeStreakTarget":
       win  -> target tinggi (16-22) → user dijamin banyak klik aman
               dulu kalau mau push, tapi tetap bebas cashout kapan saja
       lose -> target rendah (1-4)   → setelah itu, tiap klik berikutnya
               punya kemungkinan besar (70%) kena bomb kalau dia push terus
   - Multiplier dihitung dari tabel probabilitas survival ASLI (bukan random),
     supaya payout tetap matematis benar sesuai jumlah klik aman yang dilakukan.
══════════════════════════════════════ */

const Mines = (() => {

  /* ── Config ── */
  const GRID_SIZE  = 5;
  const TOTAL      = GRID_SIZE * GRID_SIZE; // 25
  const BOMBS      = 3;
  const GEMS       = TOTAL - BOMBS;          // 22
  const HOUSE_EDGE = 0.02;

  /* ── State ── */
  let _gacha        = null;
  let _onResult     = null;
  let _bet          = 0;
  let _done         = false;
  let _busy         = false;     // lock saat animasi reveal kotak berjalan
  let _picks        = 0;         // jumlah kotak aman yang sudah dibuka
  let _opened       = [];        // index kotak yang sudah dibuka (0-24)
  let _safeTarget   = 0;         // ambang aman terjamin (dari predetermined result)
  let _isWinPath    = true;      // dari _gacha.result
  let _gameOver     = false;

  /* ────────────────────────────────────
     MULTIPLIER TABLE (probabilitas survival asli)
  ──────────────────────────────────── */
  function multiplierAt(picks) {
    if (picks <= 0) return 1;
    let prob = 1;
    for (let i = 0; i < picks; i++) {
      prob *= (GEMS - i) / (TOTAL - i);
    }
    return (1 / prob) * (1 - HOUSE_EDGE);
  }

  /* ────────────────────────────────────
     INIT
  ──────────────────────────────────── */
  function init(gacha, onResult) {
    _gacha      = gacha;
    _onResult   = onResult;
    _bet        = gacha.betAmount || 0;
    _done       = false;
    _busy       = false;
    _picks      = 0;
    _opened     = [];
    _gameOver   = false;
    _isWinPath  = gacha.result === 'win';

    /* Tentukan ambang aman terjamin */
    _safeTarget = _isWinPath
      ? 16 + Math.floor(Math.random() * 7)   // 16-22
      : 1  + Math.floor(Math.random() * 4);  // 1-4

    _render();
  }

  /* ────────────────────────────────────
     RENDER HTML
  ──────────────────────────────────── */
  function _render() {
    const area = document.createElement('div');
    area.id        = 'gameArea';
    area.className = 'game-area slide-in';

    let cells = '';
    for (let i = 0; i < TOTAL; i++) {
      cells += `<button class="mines-cell" id="minesCell_${i}" onclick="Mines.reveal(${i})">❔</button>`;
    }

    area.innerHTML = `
      <div class="mines-card" id="minesCard">
        <div class="slot-section-label">💣 Mines</div>

        <div class="mines-hud" id="minesHud">Bet: ${_bet} bet — pilih kotak</div>
        <div class="mines-multi" id="minesMulti">1.00x</div>

        <div class="mines-grid" id="minesGrid">
          ${cells}
        </div>

        <button class="mines-cashout-btn" id="minesCashoutBtn" onclick="Mines.cashout()" disabled>
          💰 CASHOUT
        </button>
      </div>
    `;

    const infoCard  = document.getElementById('gachaInfoCard');
    const existGame = document.getElementById('gameArea');

    if (infoCard)       infoCard.replaceWith(area);
    else if (existGame) existGame.replaceWith(area);
    else document.querySelector('.glass-card').insertAdjacentElement('afterend', area);
  }

  /* ────────────────────────────────────
     REVEAL — klik satu kotak
  ──────────────────────────────────── */
  async function reveal(idx) {
    if (_done || _busy || _gameOver) return;
    if (_opened.includes(idx)) return;

    const cellEl = document.getElementById(`minesCell_${idx}`);
    if (!cellEl || cellEl.disabled) return;

    _busy = true;
    cellEl.disabled = true;

    /* Tentukan apakah kotak ini bomb, berdasarkan predetermined path */
    let isBomb;
    if (_picks < _safeTarget) {
      isBomb = false;
    } else if (_isWinPath) {
      isBomb = false; // win path: tidak pernah dipaksa kalah
    } else {
      isBomb = Math.random() < 0.7;
    }

    _opened.push(idx);

    await new Promise(r => setTimeout(r, 220)); // delay kecil biar ada efek "ngebuka"

    if (isBomb) {
      cellEl.classList.add('mines-bomb');
      cellEl.textContent = '💣';
      await _revealAllOnLose(idx);
      _finish(false, 0);
      return;
    }

    _picks++;
    cellEl.classList.add('mines-gem');
    cellEl.textContent = '💎';

    const mult = multiplierAt(_picks);
    const hud   = document.getElementById('minesHud');
    const multE = document.getElementById('minesMulti');
    const cashoutBtn = document.getElementById('minesCashoutBtn');

    if (hud)   hud.textContent = `💎 ${_picks} kotak aman dibuka`;
    if (multE) multE.textContent = mult.toFixed(2) + 'x';
    if (cashoutBtn) cashoutBtn.disabled = false;

    window.setStatus(`💎 Aman! Multiplier ${mult.toFixed(2)}x`, true);

    /* Kalau semua gem sudah dibuka (menang maksimal), auto cashout */
    if (_picks >= GEMS) {
      await new Promise(r => setTimeout(r, 500));
      await cashout();
      return;
    }

    _busy = false;
  }

  /* ────────────────────────────────────
     CASHOUT — berhenti & ambil profit
  ──────────────────────────────────── */
  async function cashout() {
    if (_done || _gameOver) return;
    if (_picks <= 0) return; // belum ada kotak aman dibuka, tidak ada yang bisa di-cashout

    _gameOver = true;
    _busy = true;

    const cashoutBtn = document.getElementById('minesCashoutBtn');
    if (cashoutBtn) cashoutBtn.disabled = true;

    const mult  = multiplierAt(_picks);
    const winRp = Math.floor(_bet * mult) * 1000;

    const hud = document.getElementById('minesHud');
    if (hud) hud.textContent = `🏆 Cashout di ${mult.toFixed(2)}x!`;

    window.setStatus(`🏆 MENANG ${mult.toFixed(2)}x!`, true);
    _disableAllCells();

    await new Promise(r => setTimeout(r, 1200));
    _finish(true, winRp);
  }

  /* ────────────────────────────────────
     REVEAL ALL — saat kena bomb, tunjukkan board
  ──────────────────────────────────── */
  async function _revealAllOnLose(bombIdx) {
    window.setStatus('💥 KENA BOM!', false);
    const hud = document.getElementById('minesHud');
    if (hud) hud.textContent = '💥 Kena bom! Game over.';
    _disableAllCells();
    await new Promise(r => setTimeout(r, 1200));
  }

  function _disableAllCells() {
    for (let i = 0; i < TOTAL; i++) {
      const el = document.getElementById(`minesCell_${i}`);
      if (el) el.disabled = true;
    }
  }

  /* ────────────────────────────────────
     FINISH
  ──────────────────────────────────── */
  function _finish(won, winRp) {
    if (_done) return;
    _done = true;
    _onResult(won, winRp);
  }

  return { init, reveal, cashout };
})();
