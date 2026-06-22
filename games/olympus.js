/* ══════════════════════════════════════
   ZEUS FORTUNE — Cluster Pay Slot
   games/olympus.js

   Mekanik BARU (gaya Olympus / Reels Grid):
     - Grid 6 kolom × 5 baris (30 sel), animasi reel per kolom
     - Bet DIBAGI per spin: totalBet / BET_PER_SPIN kali putar
     - Minimal totalBet = 100 (BET_PER_SPIN = 10 per putaran)
     - Menang kalau ada KLASTER ≥ 8 simbol SAMA nyambung
     - Orb Petir Zeus muncul saat menang
     - Predetermined result dari server (_gacha.result)
══════════════════════════════════════ */
const Olympus = (() => {

  const COLS  = 6;
  const ROWS  = 5;
  const TOTAL = COLS * ROWS;
  const MIN_MATCH = 8;
  const ITEM_H    = 60;   // px per item di reel
  const PAD       = 20;   // item dummy sebelum item final
  const BET_PER_SPIN  = 10;   // bet per 1 spin (satuan token)
  const MIN_TOTAL_BET = 100;  // minimal total bet

  const SYMBOLS = ['🔷','🔶','🟣','🟢','👑','🦅','🍯','⚱️'];

  const TIERS = [
    { min: 8,  max: 9,  mult: 1.4 },
    { min: 10, max: 11, mult: 2.5 },
    { min: 12, max: 14, mult: 5   },
    { min: 15, max: 19, mult: 9   },
    { min: 20, max: 30, mult: 14  },
  ];

  const OLYMPUS_MULT_CAP = 20;
  const ORB_VALUES       = [2, 3, 5, 8, 10];
  const ORB_COUNT_WEIGHTS = [55, 32, 13];

  let _gacha      = null;
  let _onResult   = null;
  let _bet        = 0;      // total bet (token)
  let _betPerSpin = 0;      // = BET_PER_SPIN
  let _totalSpins = 0;      // = _bet / BET_PER_SPIN
  let _spinsDone  = 0;
  let _done       = false;
  let _spinning   = false;
  let _winGrid    = null;
  let _winCells   = [];

  function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function weightedPick(weights) {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
      if (r < weights[i]) return i;
      r -= weights[i];
    }
    return weights.length - 1;
  }

  function neighborsOf(idx) {
    const r = Math.floor(idx / COLS), c = idx % COLS;
    const out = [];
    if (r > 0)        out.push(idx - COLS);
    if (r < ROWS - 1) out.push(idx + COLS);
    if (c > 0)        out.push(idx - 1);
    if (c < COLS - 1) out.push(idx + 1);
    return out;
  }

  function findClusters(grid) {
    const seen = new Array(grid.length).fill(false);
    const clusters = [];
    for (let i = 0; i < grid.length; i++) {
      if (seen[i]) continue;
      const sym = grid[i];
      const stack = [i];
      const cells = [];
      seen[i] = true;
      while (stack.length) {
        const cur = stack.pop();
        cells.push(cur);
        for (const n of neighborsOf(cur)) {
          if (!seen[n] && grid[n] === sym) { seen[n] = true; stack.push(n); }
        }
      }
      clusters.push({ symbol: sym, cells });
    }
    return clusters;
  }

  function growCluster(seed, targetSize) {
    const visited = new Set([seed]);
    let frontier = [...neighborsOf(seed)];
    while (visited.size < targetSize && frontier.length) {
      const pickIdx = Math.floor(Math.random() * frontier.length);
      const cell = frontier.splice(pickIdx, 1)[0];
      if (visited.has(cell)) continue;
      visited.add(cell);
      for (const n of neighborsOf(cell)) {
        if (!visited.has(n) && !frontier.includes(n)) frontier.push(n);
      }
    }
    return [...visited];
  }

  function breakOverflowClusters(grid, maxAllowed, lockedSet, forbidSym) {
    for (let guard = 0; guard < 60; guard++) {
      const clusters = findClusters(grid);
      const offenders = clusters.filter(cl =>
        cl.cells.length >= maxAllowed && !cl.cells.some(c => lockedSet.has(c))
      );
      if (!offenders.length) break;
      for (const cl of offenders) {
        const targetCell = cl.cells[cl.cells.length - 1];
        const pool = SYMBOLS.filter(s => s !== cl.symbol && s !== forbidSym);
        grid[targetCell] = rand(pool.length ? pool : SYMBOLS);
      }
    }
    return grid;
  }

  function pickWinSize() {
    const tierIdx = weightedPick([50, 25, 14, 7, 4]);
    const tier = TIERS[tierIdx];
    return tier.min + Math.floor(Math.random() * (tier.max - tier.min + 1));
  }

  function multiplierForSize(size) {
    for (const t of TIERS) {
      if (size >= t.min && size <= t.max) return t.mult;
    }
    return TIERS[TIERS.length - 1].mult;
  }

  function buildWinGrid() {
    const targetSize  = pickWinSize();
    const winSymbol   = rand(SYMBOLS);
    const seed        = Math.floor(Math.random() * TOTAL);
    const clusterCells = growCluster(seed, Math.min(targetSize, TOTAL));
    const lockedSet   = new Set(clusterCells);
    const grid        = new Array(TOTAL);
    for (const c of clusterCells) grid[c] = winSymbol;
    const others = SYMBOLS.filter(s => s !== winSymbol);
    for (let i = 0; i < TOTAL; i++) {
      if (!lockedSet.has(i)) grid[i] = rand(others);
    }
    breakOverflowClusters(grid, MIN_MATCH, lockedSet, winSymbol);
    const clusters  = findClusters(grid);
    const winCluster = clusters.find(cl => cl.cells.some(c => lockedSet.has(c))) || { cells: clusterCells };
    return { grid, winCells: winCluster.cells, size: winCluster.cells.length };
  }

  function buildLoseGrid() {
    let grid, ok = false;
    for (let attempt = 0; attempt < 25 && !ok; attempt++) {
      grid = Array.from({ length: TOTAL }, () => rand(SYMBOLS));
      ok   = findClusters(grid).every(cl => cl.cells.length < MIN_MATCH);
    }
    if (!ok) breakOverflowClusters(grid, MIN_MATCH, new Set(), null);
    return grid;
  }

  function rollOrbs() {
    const count = weightedPick(ORB_COUNT_WEIGHTS);
    const orbs = [];
    for (let i = 0; i < count; i++) orbs.push(rand(ORB_VALUES));
    return orbs;
  }

  /* ── Build reel (column) content ── */
  function buildReelItems(finalSym) {
    const items = [];
    for (let i = 0; i < PAD; i++) items.push(rand(SYMBOLS));
    items.push(finalSym);
    return items;
  }

  /* ── Set reel DOM ke posisi awal (atas), no transition ── */
  function resetReel(colEl, items) {
    colEl.style.transition = 'none';
    colEl.style.transform  = 'translateY(0px)';
    colEl.innerHTML = items.map(sym => `<div class="oly-reel-item">${sym}</div>`).join('');
  }

  /* ── Animasikan 1 kolom spin ke bawah ── */
  function animateCol(colIdx, finalSym, duration, delay) {
    return new Promise(resolve => {
      const colEl = document.getElementById(`oly-col-${colIdx}`);
      if (!colEl) return resolve();
      const items   = buildReelItems(finalSym);
      resetReel(colEl, items);
      const targetY = PAD * ITEM_H;
      setTimeout(() => {
        void colEl.offsetHeight; // force reflow
        colEl.style.transition = `transform ${duration}ms cubic-bezier(0.08, 0.82, 0.17, 1)`;
        colEl.style.transform  = `translateY(${targetY}px)`;
        setTimeout(resolve, duration);
      }, delay);
    });
  }

  /* ── Render grid UI ── */
  function _render() {
    const area = document.createElement('div');
    area.id        = 'gameArea';
    area.className = 'game-area slide-in';

    // Buat kolom-kolom (masing-masing 5 baris)
    // Layout: 6 kolom, tiap kolom scroll vertikal (reel)
    let cols = '';
    for (let c = 0; c < COLS; c++) {
      cols += `
        <div class="oly-col-window">
          <div class="oly-col-reel" id="oly-col-${c}">
            ${Array.from({length: ROWS}, () => `<div class="oly-reel-item">${rand(SYMBOLS)}</div>`).join('')}
          </div>
        </div>
      `;
    }

    area.innerHTML = `
      <div class="olympus-card">
        <div class="slot-section-label">⚡ Zeus Fortune — Cluster Pay</div>

        <div class="olympus-hud" id="olympusHud">
          Spin untuk memutar! Klaster 8+ simbol = MENANG
        </div>

        <div class="oly-spin-info" id="olySpinInfo"></div>

        <div class="oly-grid-outer">
          <div class="oly-grid-wrapper" id="olyGridWrapper">
            ${cols}
          </div>
          <div class="oly-overlay-grid" id="olyOverlayGrid">
            ${Array.from({length: TOTAL}, (_,i) => `<div class="oly-overlay-cell" id="ooly_${i}"></div>`).join('')}
          </div>
        </div>

        <div class="olympus-orb-row" id="olympusOrbRow"></div>

        <button class="spin-game-btn" id="spinGameBtn" onclick="Olympus.spin()">
          ⚡ &nbsp;SPIN  <span id="olyBetLabel">(${BET_PER_SPIN} bet/spin)</span>
        </button>
      </div>
    `;
    _mount(area);
    _updateSpinInfo();
  }

  function _updateSpinInfo() {
    const el = document.getElementById('olySpinInfo');
    if (!el) return;
    const remaining = _totalSpins - _spinsDone;
    el.textContent = `Spin ke-${_spinsDone + 1} dari ${_totalSpins}  •  ${remaining} spin tersisa`;
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
    _bet      = gacha.betAmount || 0;
    _done     = false;
    _spinning = false;
    _spinsDone = 0;
    _winCells  = [];

    // Hitung jumlah spin
    _betPerSpin = BET_PER_SPIN;
    _totalSpins = Math.max(1, Math.floor(_bet / _betPerSpin));

    // Tentukan di spin keberapa win (kalau win) — acak salah satu spin
    const isWin = _gacha.result === 'win';
    _winGrid = null;
    _winCells = [];

    if (isWin) {
      const built = buildWinGrid();
      _winGrid  = built.grid;
      _winCells = built.winCells;
    }

    _render();
  }

  /* ── Spin satu kali ── */
  async function spin() {
    if (_done || _spinning) return;
    const btn = document.getElementById('spinGameBtn');
    if (!btn || btn.disabled) return;
    _spinning = true;
    btn.disabled = true;
    window.setTokenSlotMode('hidden');

    _spinsDone++;
    const isLastSpin = (_spinsDone >= _totalSpins);
    const isWin      = _gacha.result === 'win';
    const thisSpinWin = isWin && isLastSpin; // win HANYA di spin terakhir

    // Clear overlay highlights
    for (let i = 0; i < TOTAL; i++) {
      const el = document.getElementById(`ooly_${i}`);
      if (el) el.className = 'oly-overlay-cell';
    }
    const orbRow = document.getElementById('olympusOrbRow');
    if (orbRow) { orbRow.innerHTML = ''; orbRow.classList.remove('show'); }

    const hud = document.getElementById('olympusHud');
    if (hud) hud.textContent = '⚡ Memutar simbol...';
    window.setStatus('⚡ Memutar...', true);

    // Grid yang akan ditampilkan spin ini
    const grid = thisSpinWin ? _winGrid : buildLoseGrid();

    // Animasi: tiap kolom spin, delay bertahap dari kiri ke kanan
    const base = 1200;
    const colPromises = [];
    for (let c = 0; c < COLS; c++) {
      // Ambil simbol di tiap baris kolom ini
      // Reel scroll menampilkan seluruh kolom (ROWS item)
      const colSyms = [];
      for (let r = 0; r < ROWS; r++) colSyms.push(grid[r * COLS + c]);
      // Animasikan kolom ke simbol final baris paling bawah (yg keliatan)
      // Sebenarnya kita pakai overlay grid untuk hasil akhir
      const duration = base + c * 400 + Math.floor(Math.random() * 200);
      const delay    = c * 120;
      colPromises.push(animateCol(c, colSyms[ROWS - 1], duration, delay));
    }

    await Promise.all(colPromises);
    if (_done) return;

    // Update overlay grid dengan semua simbol hasil spin ini
    for (let i = 0; i < TOTAL; i++) {
      const el = document.getElementById(`ooly_${i}`);
      if (el) el.textContent = grid[i];
    }

    if (thisSpinWin) {
      // Highlight klaster
      for (const idx of _winCells) {
        const el = document.getElementById(`ooly_${idx}`);
        if (el) el.classList.add('oly-win-cell');
      }
      const size = _winCells.length;
      if (hud) hud.textContent = `🏆 Klaster ${size} simbol sama!`;
      window.setStatus(`🏆 KLASTER ${size}!`, true);
      await new Promise(r => setTimeout(r, 800));
      if (_done) return;

      // Tumble — burst win cells
      for (const idx of _winCells) {
        document.getElementById(`ooly_${idx}`)?.classList.add('bursting');
      }
      await new Promise(r => setTimeout(r, 380));
      if (_done) return;

      // Orbs
      const baseMult = multiplierForSize(size);
      const orbs     = rollOrbs();
      if (orbs.length && orbRow) {
        orbRow.innerHTML = orbs.map(v => `<span class="olympus-orb">⚡ x${v}</span>`).join('');
        orbRow.classList.add('show');
        await new Promise(r => setTimeout(r, 700));
        if (_done) return;
      }

      const orbSum    = orbs.reduce((a, b) => a + b, 0);
      const finalMult = Math.min(OLYMPUS_MULT_CAP, baseMult + orbSum);

      if (hud) {
        hud.textContent = orbs.length
          ? `🏆 Klaster ${size} (${baseMult}x) + Petir Zeus (+${orbSum}) = ${finalMult.toFixed(2)}x!`
          : `🏆 Klaster ${size} simbol — ${finalMult.toFixed(2)}x MENANG!`;
      }
      window.setStatus(`🏆 MENANG ${finalMult.toFixed(2)}x!`, true);

      await new Promise(r => setTimeout(r, 1200));
      if (_done) return;
      _done = true;

      const winRp = Math.floor(_bet * finalMult) * 1000;
      _onResult(true, winRp);

    } else if (isLastSpin) {
      // Spin terakhir, kalah
      if (hud) hud.textContent = '💀 Belum ada klaster 8+ — tidak beruntung...';
      window.setStatus('💀 Belum beruntung...', false);
      await new Promise(r => setTimeout(r, 1000));
      if (_done) return;
      _done = true;
      _onResult(false, _gacha.money);

    } else {
      // Spin intermediate — tampilkan hasil, aktifkan spin lagi
      if (hud) hud.textContent = `Belum klaster — spin lagi! (${_totalSpins - _spinsDone} tersisa)`;
      window.setStatus(`Spin ke-${_spinsDone} — lanjut!`, true);
      _updateSpinInfo();
      await new Promise(r => setTimeout(r, 600));
      if (_done) return;
      _spinning = false;
      btn.disabled = false;
    }
  }

  return { init, spin };
})();
