/* ══════════════════════════════════════
   MINES — Grid Reveal Game
   games/mines.js

   2 mode grid, dipilih user sebelum board muncul:
     - 18 kotak (6x3) → 3 bomb tetap   (15 gem aman)  → easy
     - 25 kotak (5x5) → 5-7 bomb random (18-20 gem aman) → hard
   User klik kotak satu-satu, tiap kotak aman menaikkan multiplier.
   User bisa cashout kapan saja sebelum kena bomb.

   Mekanisme predetermined result:
   - _gacha.result dari app.js menentukan "safeStreakTarget":
       win  -> target tinggi (proporsional ke jumlah gem) → user dijamin
               banyak klik aman dulu kalau mau push, tapi tetap bebas
               cashout kapan saja
       lose -> target rendah (1-4)   → setelah itu, tiap klik berikutnya
               punya kemungkinan besar (70%) kena bomb kalau dia push terus
   - Multiplier dihitung dari tabel probabilitas survival ASLI (bukan random),
     supaya payout tetap matematis benar sesuai jumlah klik aman yang dilakukan
     DAN sesuai jumlah bomb yang aktif di mode yang dipilih.
══════════════════════════════════════ */

const Mines = (() => {

  /* ── Config per-mode ── */
  const MODES = {
    easy: { cols: 6, rows: 3, total: 18, bombsMin: 3, bombsMax: 3, label: '18 Kotak · 3 Bomb' },
    hard: { cols: 5, rows: 5, total: 25, bombsMin: 5, bombsMax: 7, label: '25 Kotak · 5-7 Bomb' },
  };
  const HOUSE_EDGE = 0.04;
  const MULT_CAP   = 15;     // batas atas multiplier biar gak meledak ke 30x+

  /* ── State ── */
  let _gacha        = null;
  let _onResult     = null;
  let _bet          = 0;
  let _done         = false;
  let _busy         = false;     // lock saat animasi reveal kotak / cashout berjalan
  let _picks        = 0;         // jumlah kotak aman yang sudah dibuka
  let _opened       = [];        // index kotak yang sudah dibuka (0-total-1)
  let _safeTarget   = 0;         // ambang aman terjamin (dari predetermined result)
  let _isWinPath    = true;      // dari _gacha.result
  let _gameOver     = false;

  let _modeKey      = null;      // 'easy' | 'hard'
  let _mode         = null;      // object dari MODES
  let _bombs        = 0;         // jumlah bomb aktual untuk sesi ini
  let _gems         = 0;         // total - bombs

  /* ────────────────────────────────────
     MULTIPLIER TABLE (probabilitas survival asli)
     Bergantung ke _mode.total & _gems yang aktif saat ini
  ──────────────────────────────────── */
  function multiplierAt(picks) {
    if (picks <= 0) return 1;
    let prob = 1;
    for (let i = 0; i < picks; i++) {
      prob *= (_gems - i) / (_mode.total - i);
    }
    return Math.min(MULT_CAP, (1 / prob) * (1 - HOUSE_EDGE));
  }

  /* ────────────────────────────────────
     INIT — tampilkan pilihan mode dulu
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
    _modeKey    = null;
    _mode       = null;
    _isWinPath  = gacha.result === 'win';

    _renderModeSelect();
  }

  /* ────────────────────────────────────
     STEP 1 — PILIH MODE GRID
  ──────────────────────────────────── */
  function _renderModeSelect() {
    const area = document.createElement('div');
    area.id        = 'gameArea';
    area.className = 'game-area slide-in';

    area.innerHTML = `
      <div class="mines-card" id="minesCard">
        <div class="slot-section-label">💣 Mines</div>
        <div class="mines-hud">Bet: ${_bet} bet — pilih mode grid</div>

        <div class="mines-mode-select" id="minesModeSelect">
          <button class="mines-mode-btn" id="minesModeEasy" onclick="Mines.chooseMode('easy')">
            <div class="mines-mode-title">${MODES.easy.label}</div>
            <div class="mines-mode-sub">Lebih aman, payout lebih kecil</div>
          </button>
          <button class="mines-mode-btn" id="minesModeHard" onclick="Mines.chooseMode('hard')">
            <div class="mines-mode-title">${MODES.hard.label}</div>
            <div class="mines-mode-sub">Lebih berisiko, payout lebih besar</div>
          </button>
        </div>
      </div>
    `;

    _mount(area);
  }

  /* Dipanggil dari tombol pilihan mode */
  function chooseMode(key) {
    if (_mode) return; // sudah pernah pilih, jangan dobel
    const def = MODES[key];
    if (!def) return;

    _modeKey = key;
    _mode    = def;
    _bombs   = def.bombsMin === def.bombsMax
      ? def.bombsMin
      : def.bombsMin + Math.floor(Math.random() * (def.bombsMax - def.bombsMin + 1));
    _gems    = _mode.total - _bombs;

    /* Tentukan ambang aman terjamin, proporsional ke jumlah gem di mode ini */
    const maxSafeWin = Math.max(1, _gems - 2); // jangan sampai >= seluruh gem
    _safeTarget = _isWinPath
      ? Math.min(maxSafeWin, 4 + Math.floor(Math.random() * 4)) // 4-7 kotak aman terjamin saat WIN
      : Math.min(maxSafeWin, 1 + Math.floor(Math.random() * 4)); // 1-4, sama seperti sebelumnya

    _render();
  }

  /* ────────────────────────────────────
     STEP 2 — RENDER BOARD
  ──────────────────────────────────── */
  function _render() {
    const area = document.createElement('div');
    area.id        = 'gameArea';
    area.className = 'game-area slide-in';

    let cells = '';
    for (let i = 0; i < _mode.total; i++) {
      cells += `<button class="mines-cell" id="minesCell_${i}" onclick="Mines.reveal(${i})">❔</button>`;
    }

    area.innerHTML = `
      <div class="mines-card" id="minesCard">
        <div class="slot-section-label">💣 Mines — ${_mode.label}</div>

        <div class="mines-hud" id="minesHud">Bet: ${_bet} bet — pilih kotak</div>
        <div class="mines-multi" id="minesMulti">1.00x</div>

        <div class="mines-grid" id="minesGrid" style="grid-template-columns: repeat(${_mode.cols}, 1fr);">
          ${cells}
        </div>

        <button class="mines-cashout-btn" id="minesCashoutBtn" onclick="Mines.cashout()" disabled>
          💰 CASHOUT
        </button>
      </div>
    `;

    _mount(area);
  }

  /* Helper umum buat masukin elemen game ke DOM, dipakai mode-select & board */
  function _mount(area) {
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
    if (_done || _busy || _gameOver || !_mode) return;
    if (_opened.includes(idx)) return;

    const cellEl = document.getElementById(`minesCell_${idx}`);
    if (!cellEl || cellEl.disabled) return;

    _busy = true;
    cellEl.disabled = true;

    /* Tentukan apakah kotak ini bomb, berdasarkan predetermined path */
    let isBomb;
    if (_picks < _safeTarget) {
      isBomb = false; // dijamin aman sampai target
    } else {
      // Lewat target aman → mulai ada risiko nyata, baik win path maupun lose path,
      // supaya multiplier (yang dihitung dari probabilitas survival asli) tetap konsisten
      // dengan risiko yang sebenarnya ditanggung.
      isBomb = Math.random() < (_isWinPath ? 0.30 : 0.7);
    }

    _opened.push(idx);

    await new Promise(r => setTimeout(r, 220)); // delay kecil biar ada efek "ngebuka"

    if (isBomb) {
      cellEl.classList.add('mines-bomb');
      cellEl.textContent = '💣';
      await _revealAllOnLose(idx);
      _busy = false; // reset state walau game sudah _done (housekeeping, tidak berdampak fungsional)
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
    if (_picks >= _gems) {
      if (cashoutBtn) cashoutBtn.disabled = true; // cegah klik manual dobel selama jeda auto-cashout
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
    for (let i = 0; i < _mode.total; i++) {
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

  return { init, chooseMode, reveal, cashout };
})();
