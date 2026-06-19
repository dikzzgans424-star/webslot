/* ══════════════════════════════════════
   GAME: REELS GRID
   Expose: ReelsGrid.init(gacha, onResult)

   MODE:
     3×3 — payline baris tengah, minimal 3 sama berurutan dari 3
     4×4 — payline baris ke-2,   minimal 3 sama berurutan dari 4
     5×5 — payline baris ke-3,   minimal 3 sama berurutan dari 5
     6×3 — payline baris ke-2,   minimal 3 sama berurutan dari 6

   WIN: minimal 3 simbol berurutan dari kiri di payline sama
   Makin panjang streak = makin besar multiplier payout
══════════════════════════════════════ */
const ReelsGrid = (() => {

  const EMOJIS = ['🍇','🍉','🍋','🍌','🍎','🍑','🍒','🫐','🥥','🥑'];

  /* ── Mode definitions ── */
  const MODES = {
    '3x3': {
      key: '3x3', label: '3 × 3', cols: 3, rows: 3,
      paylineRow: 1,   // baris tengah (0-indexed)
      minMatch: 3,
      desc: 'Baris tengah — 3 simbol sama',
      multTable: { 3: 2.5 },
    },
    '4x4': {
      key: '4x4', label: '4 × 4', cols: 4, rows: 4,
      paylineRow: 1,
      minMatch: 3,
      desc: 'Baris ke-2 — minimal 3 sama berurutan',
      multTable: { 3: 2.0, 4: 6.0 },
    },
    '5x5': {
      key: '5x5', label: '5 × 5', cols: 5, rows: 5,
      paylineRow: 2,
      minMatch: 3,
      desc: 'Baris tengah — minimal 3 sama berurutan',
      multTable: { 3: 1.8, 4: 4.5, 5: 12.0 },
    },
    '6x3': {
      key: '6x3', label: '6 × 3', cols: 6, rows: 3,
      paylineRow: 1,
      minMatch: 3,
      desc: 'Baris tengah — minimal 3 sama berurutan dari 6',
      multTable: { 3: 1.5, 4: 3.0, 5: 7.0, 6: 18.0 },
    },
  };

  const ITEM_H = 72;
  const PAD    = 24;

  let _gacha    = null;
  let _onResult = null;
  let _done     = false;
  let _mode     = null;

  function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  /* ── Cek berapa panjang streak dari kiri ── */
  function countStreak(symbols) {
    if (!symbols.length) return 0;
    let count = 1;
    for (let i = 1; i < symbols.length; i++) {
      if (symbols[i] === symbols[0]) count++;
      else break;
    }
    return count;
  }

  /* ── Build reel ── */
  function buildReel(reel, symbol) {
    const items = [];
    for (let i = 0; i < PAD; i++) items.push(rand(EMOJIS));
    items.push(symbol);
    items.push(rand(EMOJIS));
    reel.innerHTML = items.map(e => `<div>${e}</div>`).join('');
    reel.style.transition = 'none';
    reel.style.transform  = 'translateY(0px)';
  }

  function getSymbol(reel) {
    const style      = window.getComputedStyle(reel);
    const matrix     = new DOMMatrix(style.transform);
    const scrolled   = Math.abs(matrix.m42);
    const idx        = Math.round(scrolled / ITEM_H);
    return reel.querySelectorAll('div')[idx]?.textContent?.trim() ?? '?';
  }

  function animateReel(reel, symbol, duration, delay) {
    return new Promise(resolve => {
      buildReel(reel, symbol);
      const targetY = -(PAD * ITEM_H);
      setTimeout(() => {
        reel.style.transition = `transform ${duration}ms cubic-bezier(0.08, 0.82, 0.17, 1)`;
        reel.style.transform  = `translateY(${targetY}px)`;
        setTimeout(resolve, duration);
      }, delay);
    });
  }

  /* ── Render mode select ── */
  function _renderModeSelect() {
    const area = document.createElement('div');
    area.id        = 'gameArea';
    area.className = 'game-area slide-in';
    area.innerHTML = `
      <div class="slot-multi-card">
        <div class="slot-section-label">🎰 Reels Grid — Pilih Mode</div>
        <div class="slot-mode-grid">
          ${Object.values(MODES).map(m => `
            <button class="slot-mode-btn" onclick="ReelsGrid.chooseMode('${m.key}')">
              <div class="slot-mode-label">${m.label}</div>
              <div class="slot-mode-desc">${m.desc}</div>
              <div class="slot-mode-mult">
                ${Object.entries(m.multTable).map(([k,v]) => `<span>${k} sama → ${v}x</span>`).join('')}
              </div>
            </button>
          `).join('')}
        </div>
      </div>
    `;
    _mount(area);
  }

  /* ── Render board ── */
  function _renderBoard() {
    const m = _mode;
    const total = m.cols * m.rows;
    let cells = '';
    for (let i = 0; i < total; i++) {
      const row = Math.floor(i / m.cols);
      const isPayline = row === m.paylineRow;
      cells += `<div class="slot-window${isPayline ? ' payline-row' : ''}" id="sw${i+1}">
                  <div class="slot-reel" id="reel${i+1}"></div>
                </div>`;
    }

    const multRows = Object.entries(m.multTable)
      .map(([k,v]) => `<span class="mult-chip">${k} sama <strong>${v}x</strong></span>`)
      .join('');

    const area = document.createElement('div');
    area.id        = 'gameArea';
    area.className = 'game-area slide-in';
    area.innerHTML = `
      <div class="slot-multi-card">
        <div class="slot-section-label">🎰 Reels Grid ${m.label}</div>

        <div class="slot-multi-hud" id="slotHud">Pilih baris tengah — SPIN!</div>

        <div class="slot-multi-grid" id="slotGrid"
             style="grid-template-columns: repeat(${m.cols}, 1fr); grid-template-rows: repeat(${m.rows}, ${ITEM_H}px);">
          ${cells}
        </div>

        <div class="slot-payline-label">⬅ PAYLINE</div>

        <div class="slot-mult-info">${multRows}</div>

        <button class="spin-game-btn" id="spinGameBtn" onclick="ReelsGrid.spin()">
          🎰 &nbsp;SPIN
        </button>
      </div>
    `;
    _mount(area);

    // Init reel idle state
    for (let i = 1; i <= total; i++) {
      buildReel(document.getElementById('reel' + i), rand(EMOJIS));
    }
  }

  function _mount(area) {
    const infoCard  = document.getElementById('gachaInfoCard');
    const existGame = document.getElementById('gameArea');
    if (infoCard)       infoCard.replaceWith(area);
    else if (existGame) existGame.replaceWith(area);
    else document.querySelector('.glass-card').insertAdjacentElement('afterend', area);
  }

  /* ── Init ── */
  function init(gacha, onResult) {
    _gacha    = gacha;
    _onResult = onResult;
    _done     = false;
    _mode     = null;
    _renderModeSelect();
  }

  function chooseMode(key) {
    if (_mode) return;
    _mode = MODES[key];
    if (!_mode) return;
    _renderBoard();
  }

  /* ── Spin ── */
  async function spin() {
    if (_done || !_mode) return;
    const btn = document.getElementById('spinGameBtn');
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    window.setTokenSlotMode('hidden');
    window.setStatus('🎰 Spinning...', true);

    const m      = _mode;
    const isWin  = _gacha.result === 'win';
    const total  = m.cols * m.rows;
    const syms   = Array.from({length: total}, () => rand(EMOJIS));

    /* Payline = kolom di baris paylineRow */
    const payStart = m.paylineRow * m.cols;

    if (isWin) {
      /* Paksa minimal 3 streak dari kiri di payline */
      const winSym   = rand(EMOJIS);
      const maxMatch = m.cols; // bisa full
      // Tentukan panjang streak: pilih acak dari yang tersedia di multTable
      const matchOptions = Object.keys(m.multTable).map(Number);
      const streakLen = matchOptions[Math.floor(Math.random() * matchOptions.length)];
      for (let c = 0; c < m.cols; c++) {
        syms[payStart + c] = c < streakLen ? winSym : rand(EMOJIS);
      }
      // Pastikan simbol setelah streak TIDAK sama dengan winSym
      if (streakLen < m.cols) {
        let breaker = rand(EMOJIS);
        while (breaker === winSym) breaker = rand(EMOJIS);
        syms[payStart + streakLen] = breaker;
      }
    } else {
      /* Lose: pastikan tidak ada 3 streak dari kiri */
      let attempts = 0;
      do {
        for (let c = 0; c < m.cols; c++) syms[payStart + c] = rand(EMOJIS);
        attempts++;
      } while (countStreak(syms.slice(payStart, payStart + m.cols)) >= m.minMatch && attempts < 20);
    }

    /* Animasi — makin ke kanan makin lama */
    const base = 700;
    const promises = syms.map((sym, i) => {
      const col      = i % m.cols;
      const duration = base + col * 300 + Math.floor(Math.random() * 200);
      const delay    = col * 80;
      return animateReel(document.getElementById('reel' + (i+1)), sym, duration, delay);
    });
    await Promise.all(promises);
    if (_done) return;

    /* Read-back payline dari DOM */
    const paylineSyms = [];
    for (let c = 0; c < m.cols; c++) {
      const reel = document.getElementById('reel' + (payStart + c + 1));
      paylineSyms.push(getSymbol(reel));
    }
    console.log('PAYLINE:', paylineSyms);

    const streak    = countStreak(paylineSyms);
    const actualWin = streak >= m.minMatch;
    const mult      = actualWin ? (m.multTable[streak] ?? m.multTable[m.minMatch]) : 0;

    /* Highlight payline */
    for (let c = 0; c < m.cols; c++) {
      const swEl = document.getElementById('sw' + (payStart + c + 1));
      if (streak >= m.minMatch && c < streak) {
        swEl?.classList.add('win-glow');
      }
    }

    const hud = document.getElementById('slotHud');
    if (actualWin) {
      if (hud) hud.textContent = `🏆 ${streak} sama! ${mult}x MENANG!`;
      window.setStatus(`🏆 ${streak} SAMA! ${mult}x`, true);
    } else {
      if (hud) hud.textContent = '💀 Belum beruntung...';
      window.setStatus('💀 Belum beruntung...', false);
    }

    await new Promise(r => setTimeout(r, actualWin ? 1400 : 800));
    if (_done) return;
    _done = true;

    const winRp = actualWin ? Math.floor(_gacha.betAmount * mult) * 1000 : 0;
    _onResult(actualWin, actualWin ? winRp : _gacha.money);
  }

  return { init, chooseMode, spin };
})();
