/* ══════════════════════════════════════
   PLINKO — Multiplier Drop Game
   games/plinko.js

   Mekanisme:
   - 16 baris pin (segitiga), bola jatuh dari atas-tengah
   - Tiap baris bola "memilih" kiri/kanan (binomial random walk)
   - Mendarat di salah satu 17 slot multiplier di bawah
   - _gacha.result dari app.js cuma nentuin KATEGORI:
       'win'  -> path dipaksa berakhir di slot dengan mult >= 1.2x
       'lose' -> path dipaksa berakhir di slot dengan mult < 1x
     Multiplier PERSIS berapa & jalur bola tetap divariasikan acak,
     sama seperti pola predetermined-result di horserace/roulette.
══════════════════════════════════════ */

const Plinko = (() => {

  /* ── Config papan ── */
  const ROWS       = 16;                 // jumlah baris pin
  const SLOTS      = ROWS + 1;           // 17 slot di bawah
  const BOARD_W     = 360;
  const BOARD_H     = 420;
  const PIN_R       = 4;
  const BALL_R      = 7;
  const TOP_PAD     = 28;     // jarak baris pin pertama dari atas
  const ROW_GAP     = (BOARD_H - 70 - TOP_PAD) / ROWS; // jarak antar baris pin
  const DROP_MS     = 4800;   // total durasi animasi jatuh

  /* ── Tabel multiplier (low-risk style, 17 slot, simetris) ── */
  const MULTS = [
    10, 3, 1.6, 1.4, 1.2, 1.1, 1, 0.5, 0.3, 0.5, 1, 1.1, 1.2, 1.4, 1.6, 3, 10
  ];

  /* ── State ── */
  let _gacha     = null;
  let _onResult  = null;
  let _bet       = 0;
  let _dropping  = false;
  let _done      = false;
  let _rafId     = null;

  let _canvas = null;
  let _ctx    = null;
  let _pins   = [];      // {x,y} tiap pin
  let _slotX  = [];      // x tengah tiap slot di bawah

  /* ────────────────────────────────────
     INIT
  ──────────────────────────────────── */
  function init(gacha, onResult) {
    _gacha    = gacha;
    _onResult = onResult;
    _bet      = gacha.betAmount || 0;
    _dropping = false;
    _done     = false;
    if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }

    _render();
    requestAnimationFrame(() => {
      _initCanvas();
      _buildBoard();
      _drawIdle();
    });
  }

  /* ────────────────────────────────────
     RENDER HTML
  ──────────────────────────────────── */
  function _render() {
    const area = document.createElement('div');
    area.id        = 'gameArea';
    area.className = 'game-area slide-in';
    area.innerHTML = `
      <div class="plinko-card" id="plinkoCard">
        <div class="slot-section-label">🟣 Plinko</div>

        <div class="plinko-canvas-wrap">
          <canvas id="plinkoCanvas"></canvas>
        </div>

        <div class="plinko-hud" id="plinkoHud">Bet: ${_bet} bet — siap dijatuhkan</div>

        <button class="spin-game-btn" id="spinGameBtn" onclick="Plinko.drop()">
          🟣 &nbsp;DROP BALL
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
     CANVAS SETUP
  ──────────────────────────────────── */
  function _initCanvas() {
    _canvas = document.getElementById('plinkoCanvas');
    const wrap = document.querySelector('.plinko-canvas-wrap');
    const w = Math.min(wrap.clientWidth, BOARD_W);
    const scale = w / BOARD_W;
    _canvas.width  = BOARD_W;
    _canvas.height = BOARD_H;
    _canvas.style.width  = w + 'px';
    _canvas.style.height = (BOARD_H * scale) + 'px';
    _ctx = _canvas.getContext('2d');
  }

  /* Bangun posisi pin segitiga (row 0 = 3 pin, row N = N+3 pin)
     dan posisi x tiap slot multiplier di bawah */
  function _buildBoard() {
    _pins = [];
    const centerX = BOARD_W / 2;

    for (let row = 0; row < ROWS; row++) {
      const pinCount = row + 3;
      const y = TOP_PAD + row * ROW_GAP;
      const rowWidth = (pinCount - 1) * (BOARD_W / (ROWS + 4));
      const startX   = centerX - rowWidth / 2;
      for (let i = 0; i < pinCount; i++) {
        _pins.push({
          x: startX + i * (BOARD_W / (ROWS + 4)),
          y,
        });
      }
    }

    /* Slot x-position di bawah (SLOTS slot, merata di lebar board) */
    _slotX = [];
    const slotW = BOARD_W / SLOTS;
    for (let i = 0; i < SLOTS; i++) {
      _slotX.push(slotW * i + slotW / 2);
    }
  }

  /* ────────────────────────────────────
     TENTUKAN PATH BOLA
     Path = array berisi ROWS langkah, tiap langkah 0 (kiri) atau 1 (kanan)
     Jumlah langkah "kanan" menentukan slot akhir (binomial).
     slot akhir = jumlah langkah kanan (0..ROWS) -> index 0..SLOTS-1
  ──────────────────────────────────── */
  function _generatePath(targetSlot) {
    /* targetSlot = jumlah "kanan" yang harus terjadi dari ROWS langkah */
    const steps = [];
    let rightsLeft = targetSlot;
    let stepsLeft  = ROWS;

    for (let i = 0; i < ROWS; i++) {
      /* Probabilitas langkah ini "kanan", supaya total kanan = targetSlot
         tapi tetap divariasikan acak (bukan selalu kanan-dulu/kiri-dulu) */
      const probRight = stepsLeft > 0 ? rightsLeft / stepsLeft : 0;
      const goRight = Math.random() < probRight;
      steps.push(goRight ? 1 : 0);
      if (goRight) rightsLeft--;
      stepsLeft--;
    }
    /* Acak urutannya supaya jalur kiri/kanan tidak selalu bias ke awal */
    for (let i = steps.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [steps[i], steps[j]] = [steps[j], steps[i]];
    }
    return steps;
  }

  /* Pilih slot tujuan berdasarkan kategori win/lose dari app.js
     Target persentase saat WIN (total 100 tiket):
       Merah   (10x, 3x)                    -> 20%
       Kuning  (1x,1.1x,1.2x,1.4x,1.6x)    -> 75%
       Abu-abu (0.3x, 0.5x)                 ->  5%
  */
  function _pickTargetSlot(isWin) {
    if (isWin) {
      const pool = [
        // Merah 20 tiket: 10x kiri=4, 3x kiri=6, 3x kanan=6, 10x kanan=4
        0,0,0,0, 1,1,1,1,1,1, 15,15,15,15,15,15, 16,16,16,16,
        // Abu-abu 5 tiket: 0.5=2, 0.3=1, 0.5=2
        7,7, 8, 9,9,
        // Kuning 75 tiket (10 slot, ~7-8 tiket tiap slot)
        2,2,2,2,2,2,2,2,
        3,3,3,3,3,3,3,3,
        4,4,4,4,4,4,4,
        5,5,5,5,5,5,5,5,
        6,6,6,6,6,6,6,
        10,10,10,10,10,10,10,
        11,11,11,11,11,11,11,11,
        12,12,12,12,12,12,12,
        13,13,13,13,13,13,13,13,
        14,14,14,14,14,14,14,14,
      ];
      return pool[Math.floor(Math.random() * pool.length)];
    } else {
      // Lose: jatuh ke 0.3x / 0.5x (tengah abu-abu)
      const losePool = [7, 7, 8, 9, 9];
      return losePool[Math.floor(Math.random() * losePool.length)];
    }
  }

  /* ────────────────────────────────────
     DROP — entry point tombol
  ──────────────────────────────────── */
  async function drop() {
    if (_done || _dropping) return;
    if (!_bet || _bet < 1) return;

    const btn = document.getElementById('spinGameBtn');
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    _dropping = true;
    window.setTokenSlotMode('hidden'); // Sembunyikan tombol back begitu bola dijatuhkan
    window.setStatus('🟣 Bola jatuh...', true);

    const hud = document.getElementById('plinkoHud');
    if (hud) hud.textContent = '🟣 Bola sedang jatuh...';

    /* ── Tentukan hasil — dari app.js (sumber kebenaran) ── */
    const isWin       = _gacha.result === 'win';
    const targetSlot   = _pickTargetSlot(isWin);
    const mult         = MULTS[targetSlot];
    const path         = _generatePath(targetSlot);

    await _animateDrop(path, targetSlot);
    if (_done) return;

    /* ── Hitung payout ── */
    const winRp  = Math.floor(_bet * mult) * 1000;
    const won    = mult >= 1; // konsisten: untung kalau mult >= 1x

    if (hud) {
      hud.textContent = `🎯 Mendarat di ${mult}x — ${won ? 'UNTUNG' : 'RUGI'}!`;
    }
    window.setStatus(won ? `🏆 MENANG ${mult}x!` : `💀 Kalah... (${mult}x)`, won);

    await new Promise(r => setTimeout(r, 1200));
    if (_done) return;
    _done = true;
    _onResult(won, winRp);
  }

  /* ────────────────────────────────────
     ANIMASI — simulasi bola turun
  ──────────────────────────────────── */
  /* Easing: ease-in (makin cepat ke bawah, seperti gravitasi) */
  function _easeIn(t) {
    return t * t * t;
  }

  /* Smooth step antar waypoint (cubic interpolasi) */
  function _smoothStep(t) {
    return t * t * (3 - 2 * t);
  }

  function _animateDrop(path, targetSlot) {
    return new Promise(resolve => {
      const startTime = performance.now();
      const centerX   = BOARD_W / 2;

      /* Hitung waypoint x,y tiap baris berdasarkan path (kiri/kanan) */
      const waypoints = [{ x: centerX, y: 6 }];
      let curX = centerX;
      for (let row = 0; row < ROWS; row++) {
        const y = TOP_PAD + row * ROW_GAP;
        const dir = path[row] === 1 ? 1 : -1;
        curX += dir * (BOARD_W / (ROWS + 4)) / 2;
        waypoints.push({ x: curX, y });
      }
      /* Waypoint akhir: posisi slot final di dasar board */
      waypoints.push({ x: _slotX[targetSlot], y: BOARD_H - 40 });

      /* Hitung bobot tiap segmen berdasarkan jarak (pin makin jauh = lebih lama) */
      const segCount = waypoints.length - 1;
      const segDists = [];
      let totalDist = 0;
      for (let i = 0; i < segCount; i++) {
        const dx = waypoints[i+1].x - waypoints[i].x;
        const dy = waypoints[i+1].y - waypoints[i].y;
        const d  = Math.sqrt(dx*dx + dy*dy);
        segDists.push(d);
        totalDist += d;
      }
      /* Waktu kumulatif tiap waypoint (makin ke bawah makin cepat = ease-in gravity) */
      const segTimes = [0]; // waktu relatif 0..1 tiap waypoint
      let cumTime = 0;
      for (let i = 0; i < segCount; i++) {
        /* Gravitasi: segmen atas lambat, bawah cepat
           Bobot waktu = proporsi jarak tapi dibalik dengan faktor gravity */
        const gravityFactor = 1 - (i / segCount) * 0.55; // segmen atas x1.0, bawah x0.45
        cumTime += (segDists[i] / totalDist) * gravityFactor;
        segTimes.push(cumTime);
      }
      /* Normalisasi ke 0..1 */
      const maxT = segTimes[segTimes.length - 1];
      for (let i = 0; i < segTimes.length; i++) segTimes[i] /= maxT;

      /* Bounce kecil saat mengenai pin — time-based, bukan frame-decay,
         supaya konsisten di semua refresh rate dan terasa "natural" */
      let lastSeg        = -1;
      let bounceStart    = -1;
      const BOUNCE_MS    = 150;   // durasi tiap micro-bounce
      const BOUNCE_PEAK  = 4.5;   // tinggi bounce (px)

      function frame(now) {
        const elapsed  = now - startTime;
        const rawProgress = Math.max(0, Math.min(elapsed / DROP_MS, 1));

        /* Terapkan ease-in global (bola makin cepat selama jatuh) */
        const progress = _easeIn(rawProgress);

        /* Cari segmen saat ini berdasarkan segTimes */
        let segIdx = 0;
        for (let i = 0; i < segCount; i++) {
          if (progress >= segTimes[i]) segIdx = i;
        }
        segIdx = Math.min(segIdx, segCount - 1);

        /* Deteksi benturan pin baru → mulai bounce baru */
        if (segIdx !== lastSeg && segIdx > 0 && segIdx < segCount - 1) {
          bounceStart = now;
          lastSeg = segIdx;
        }

        /* Hitung bounce: kurva sinus (0 → peak → 0), halus, time-based */
        let bounceOffset = 0;
        let squash = 1;
        if (bounceStart >= 0) {
          const bt = (now - bounceStart) / BOUNCE_MS;
          if (bt < 1) {
            const shape   = Math.sin(bt * Math.PI); // 0 di awal/akhir, 1 di puncak
            bounceOffset  = shape * BOUNCE_PEAK;
            squash        = 1 - shape * 0.18;        // sedikit gepeng pas kena pin
          } else {
            bounceStart = -1;
          }
        }

        /* Interpolasi posisi dalam segmen dengan smoothStep */
        const t0 = segTimes[segIdx];
        const t1 = segTimes[Math.min(segIdx + 1, segCount)];
        const ratio = t1 > t0 ? Math.max(0, Math.min(1, (progress - t0) / (t1 - t0))) : 1;
        const segT = _smoothStep(ratio);

        const a = waypoints[segIdx];
        const b = waypoints[segIdx + 1] || waypoints[segIdx];
        const ballX = a.x + (b.x - a.x) * segT;
        const ballY = a.y + (b.y - a.y) * segT - bounceOffset;

        _drawBoard(ballX, ballY, squash);

        if (rawProgress < 1 && !_done) {
          _rafId = requestAnimationFrame(frame);
        } else {
          resolve();
        }
      }
      _rafId = requestAnimationFrame(frame);
    });
  }

  /* ────────────────────────────────────
     DRAWING
  ──────────────────────────────────── */
  function _drawIdle() {
    _drawBoard(BOARD_W / 2, 6);
  }

  function _drawBoard(ballX, ballY, squash = 1) {
    const ctx = _ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, BOARD_W, BOARD_H);

    /* Background */
    ctx.fillStyle = '#1a1410';
    ctx.fillRect(0, 0, BOARD_W, BOARD_H);

    /* Pins */
    ctx.fillStyle = '#d4af5a';
    for (const p of _pins) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, PIN_R, 0, Math.PI * 2);
      ctx.fill();
    }

    /* Slot multiplier di dasar */
    const slotW = BOARD_W / SLOTS;
    for (let i = 0; i < SLOTS; i++) {
      const m = MULTS[i];
      const x = i * slotW;
      const y = BOARD_H - 34;
      ctx.fillStyle = m >= 3 ? '#e05555' : m >= 1 ? '#d4af5a' : '#5a5a5a';
      ctx.fillRect(x + 1, y, slotW - 2, 30);
      ctx.fillStyle = '#1a1410';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(m + 'x', x + slotW / 2, y + 19);
    }

    /* Bola — squash dikit pas kena pin biar ada kesan "impact" */
    ctx.save();
    ctx.translate(ballX, ballY);
    ctx.scale(1 / squash, squash); // gepeng vertikal, melebar horizontal
    ctx.fillStyle = '#fff8dc';
    ctx.beginPath();
    ctx.arc(0, 0, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#b8860b';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  return { init, drop };
})();
