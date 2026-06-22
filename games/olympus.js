/* ══════════════════════════════════════
   ZEUS FORTUNE — Cluster Pay Slot (gaya "Olympus")
   games/olympus.js

   Mekanik ORISINAL terinspirasi genre cluster-pay (bukan jiplak aset/
   logo game pihak ketiga manapun — simbol, nama, dan kode semua buatan
   sendiri):

     - Grid 6 kolom × 5 baris (30 sel), TANPA payline.
     - Menang kalau ada KLASTER ≥ 8 simbol SAMA yang nyambung langsung
       (atas/bawah/kiri/kanan, bukan diagonal) di mana saja di grid.
     - Klaster makin besar = multiplier makin besar (lihat TIERS).
     - Setelah klaster ke-detect, sel yang menang "meledak" lalu sel
       kosongnya diisi simbol baru (efek tumble — kosmetik, gak nambah
       kemenangan lagi, biar deterministic & gampang divalidasi server).
     - Bonus: "Orb Petir Zeus" — 0-2 orb muncul random tiap kali menang,
       nilainya DITAMBAHKAN ke multiplier dasar, dengan cap di
       OLYMPUS_MULT_CAP (harus SAMA dengan MAX_GAME_MULTIPLIER.olympus
       di app.js & api/gacha-update.js).

   Predetermined result tetap dari server (_gacha.result) — sama seperti
   reelsgird/mines. Yang dirandomize cuma BENTUK klaster, simbolnya,
   ukurannya (dalam batas tier), dan orb bonus.
══════════════════════════════════════ */
const Olympus = (() => {

  const COLS  = 6;
  const ROWS  = 5;
  const TOTAL = COLS * ROWS;
  const MIN_MATCH = 8;

  /* Simbol orisinal — bukan aset game manapun. 4 "biasa" + 4 "premium". */
  const SYMBOLS = ['🔷','🔶','🟣','🟢','👑','🦅','🍯','⚱️'];

  /* Tabel tier: ukuran klaster -> multiplier dasar (sebelum bonus orb) */
  const TIERS = [
    { min: 8,  max: 9,  mult: 1.4 },
    { min: 10, max: 11, mult: 2.5 },
    { min: 12, max: 14, mult: 5   },
    { min: 15, max: 19, mult: 9   },
    { min: 20, max: 30, mult: 14  },
  ];

  /* HARUS SAMA dengan MAX_GAME_MULTIPLIER.olympus di app.js & gacha-update.js */
  const OLYMPUS_MULT_CAP = 20;

  const ORB_VALUES  = [2, 3, 5, 8, 10];
  /* Distribusi jumlah orb yang muncul saat menang: index = jumlah orb */
  const ORB_COUNT_WEIGHTS = [55, 32, 13]; // 0 orb / 1 orb / 2 orb

  let _gacha    = null;
  let _onResult = null;
  let _bet      = 0;
  let _done     = false;
  let _grid     = [];     // array simbol, index 0..TOTAL-1
  let _winCells = [];     // index sel yang menang (kosong kalau lose)

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
    if (r < ROWS - 1)  out.push(idx + COLS);
    if (c > 0)        out.push(idx - 1);
    if (c < COLS - 1)  out.push(idx + 1);
    return out;
  }

  /* ── Cari semua komponen terhubung (klaster) di grid saat ini ── */
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
          if (!seen[n] && grid[n] === sym) {
            seen[n] = true;
            stack.push(n);
          }
        }
      }
      clusters.push({ symbol: sym, cells });
    }
    return clusters;
  }

  /* ── Tumbuhkan klaster dari satu seed sampai sebesar targetSize ── */
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

  /* ── Pecahkan klaster liar (>= maxAllowed) yang TIDAK boleh ada,
       dengan ganti satu sel per klaster ke simbol lain. forbidSym =
       simbol yang tidak boleh dipakai buat ganti (biar gak nyambung
       balik ke klaster menang yang sengaja dibuat). lockedSet = sel
       yang gak boleh disentuh sama sekali (klaster menang asli). ── */
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

  /* ── Bangun grid untuk hasil MENANG ── */
  function buildWinGrid() {
    const targetSize = pickWinSize();
    const winSymbol  = rand(SYMBOLS);
    const seed       = Math.floor(Math.random() * TOTAL);
    const clusterCells = growCluster(seed, Math.min(targetSize, TOTAL));
    const lockedSet  = new Set(clusterCells);

    const grid = new Array(TOTAL);
    for (const c of clusterCells) grid[c] = winSymbol;

    const others = SYMBOLS.filter(s => s !== winSymbol);
    for (let i = 0; i < TOTAL; i++) {
      if (!lockedSet.has(i)) grid[i] = rand(others);
    }

    breakOverflowClusters(grid, MIN_MATCH, lockedSet, winSymbol);

    /* Baca ulang klaster final buat highlight (harusnya = clusterCells) */
    const clusters = findClusters(grid);
    const winCluster = clusters.find(cl => cl.cells.some(c => lockedSet.has(c))) || { cells: clusterCells };

    return { grid, winCells: winCluster.cells, size: winCluster.cells.length };
  }

  /* ── Bangun grid untuk hasil KALAH — gak boleh ada klaster >= MIN_MATCH ── */
  function buildLoseGrid() {
    let grid;
    let ok = false;
    for (let attempt = 0; attempt < 25 && !ok; attempt++) {
      grid = Array.from({ length: TOTAL }, () => rand(SYMBOLS));
      const clusters = findClusters(grid);
      ok = clusters.every(cl => cl.cells.length < MIN_MATCH);
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

  /* ── Render board ── */
  function _render() {
    const area = document.createElement('div');
    area.id        = 'gameArea';
    area.className = 'game-area slide-in';

    let cells = '';
    for (let i = 0; i < TOTAL; i++) {
      cells += `<div class="olympus-cell" id="ocell_${i}"><span>${_grid[i]}</span></div>`;
    }

    area.innerHTML = `
      <div class="olympus-card">
        <div class="slot-section-label">⚡ Zeus Fortune — Cluster Pay</div>
        <div class="olympus-hud" id="olympusHud">Minimal 8 simbol sama nyambung buat menang!</div>

        <div class="olympus-grid" id="olympusGrid"
             style="grid-template-columns: repeat(${COLS}, 1fr); grid-template-rows: repeat(${ROWS}, 1fr);">
          ${cells}
        </div>

        <div class="olympus-orb-row" id="olympusOrbRow"></div>

        <button class="spin-game-btn" id="spinGameBtn" onclick="Olympus.spin()">
          ⚡ &nbsp;SPIN
        </button>
      </div>
    `;
    _mount(area);
  }

  function _mount(area) {
    const infoCard  = document.getElementById('gachaInfoCard');
    const existGame = document.getElementById('gameArea');
    if (infoCard)       infoCard.replaceWith(area);
    else if (existGame) existGame.replaceWith(area);
    else document.querySelector('.glass-card').insertAdjacentElement('afterend', area);
  }

  function init(gacha, onResult) {
    _gacha    = gacha;
    _onResult = onResult;
    _bet      = gacha.betAmount || 0;
    _done     = false;
    _winCells = [];

    const isWin = _gacha.result === 'win';
    if (isWin) {
      const built = buildWinGrid();
      _grid     = built.grid;
      _winCells = built.winCells;
    } else {
      _grid     = buildLoseGrid();
      _winCells = [];
    }

    _render();
  }

  /* ── Spin: animasikan reveal, lalu tumble sel menang, lalu result ── */
  async function spin() {
    if (_done) return;
    const btn = document.getElementById('spinGameBtn');
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    window.setTokenSlotMode('hidden');
    window.setStatus('⚡ Memutar simbol...', true);

    /* Animasi reveal — sel muncul satu-satu */
    for (let i = 0; i < TOTAL; i++) {
      const el = document.getElementById('ocell_' + i);
      if (el) {
        await new Promise(r => setTimeout(r, 18));
        el.classList.add('reveal-in');
      }
    }
    await new Promise(r => setTimeout(r, 250));
    if (_done) return;

    const isWin = _gacha.result === 'win';
    const hud   = document.getElementById('olympusHud');

    if (!isWin) {
      if (hud) hud.textContent = '💀 Belum ada klaster 8+ — belum beruntung...';
      window.setStatus('💀 Belum beruntung...', false);
      await new Promise(r => setTimeout(r, 1200));
      if (_done) return;
      _done = true;
      _onResult(false, _gacha.money);
      return;
    }

    /* ── Highlight klaster menang ── */
    const size = _winCells.length;
    for (const idx of _winCells) {
      document.getElementById('ocell_' + idx)?.classList.add('win-cluster');
    }
    if (hud) hud.textContent = `🏆 Klaster ${size} simbol sama!`;
    window.setStatus(`🏆 KLASTER ${size}!`, true);
    await new Promise(r => setTimeout(r, 900));
    if (_done) return;

    /* ── Tumble: sel menang "meledak" lalu diisi simbol baru (kosmetik) ── */
    for (const idx of _winCells) {
      document.getElementById('ocell_' + idx)?.classList.add('bursting');
    }
    await new Promise(r => setTimeout(r, 380));
    if (_done) return;

    for (const idx of _winCells) {
      const el = document.getElementById('ocell_' + idx);
      if (!el) continue;
      el.classList.remove('bursting', 'win-cluster');
      el.innerHTML = `<span>${rand(SYMBOLS)}</span>`;
      el.classList.add('refill-in');
    }
    await new Promise(r => setTimeout(r, 350));
    if (_done) return;

    /* ── Orb Petir Zeus ── */
    const baseMult = multiplierForSize(size);
    const orbs     = rollOrbs();
    const orbRow   = document.getElementById('olympusOrbRow');
    if (orbs.length && orbRow) {
      orbRow.innerHTML = orbs.map(v => `<span class="olympus-orb">⚡ x${v}</span>`).join('');
      orbRow.classList.add('show');
      await new Promise(r => setTimeout(r, 700));
      if (_done) return;
    }

    const orbSum     = orbs.reduce((a, b) => a + b, 0);
    const finalMult  = Math.min(OLYMPUS_MULT_CAP, baseMult + orbSum);

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
  }

  return { init, spin };
})();
