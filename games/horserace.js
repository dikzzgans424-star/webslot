/* ══════════════════════════════════════
   HORSE RACE — Predetermined Race Game
   games/horserace.js
══════════════════════════════════════ */

const HorseRace = (() => {

  /* ── Horse definitions ── */
  const HORSES = [
    { id: 0, name: 'Merah',  color: '#e05555', mane: '#c03030', shadow: 'rgba(224,85,85,0.35)' },
    { id: 1, name: 'Biru',   color: '#4f8ef7', mane: '#2a5ec4', shadow: 'rgba(79,142,247,0.35)' },
    { id: 2, name: 'Kuning', color: '#f0c030', mane: '#c89010', shadow: 'rgba(240,192,48,0.35)'  },
    { id: 3, name: 'Hijau',  color: '#4caf82', mane: '#2e8060', shadow: 'rgba(76,175,130,0.35)'  },
    { id: 4, name: 'Ungu',   color: '#a06cd5', mane: '#7040a8', shadow: 'rgba(160,108,213,0.35)' },
  ];

  /* ── Config ── */
  const TRACK_H      = 280;   // canvas height
  const LANE_H       = 44;    // per lane
  const LANE_PAD     = 8;     // top pad before first lane
  const FINISH_X_PCT = 0.88;  // finish line at 88% of canvas width
  const BASE_SPEED   = 1.2;   // px per frame base
  const CAMERA_EASE  = 0.07;  // camera lerp

  /* ── State ── */
  let _gacha       = null;
  let _callback    = null;
  let _phase       = 'pick';  // pick | ready | racing | done
  let _picked      = -1;      // horse id user picked
  let _winnerIdx   = -1;      // predetermined winner
  let _isWin       = false;   // FIX BUG 3: simpan hasil di sini, bukan baca _gacha.result
  let _rafId       = null;
  let _cameraX     = 0;       // world scroll offset
  let _targetCamX  = 0;
  let _raceStarted = false;
  let _finished    = false;

  /* ── Per-horse runtime ── */
  let _horses = [];

  /* ── Canvas ── */
  let _canvas = null;
  let _ctx    = null;

  /* ── Idle ── */
  let _idleT = 0;

  /* ────────────────────────────────────
     PUBLIC: INIT
  ──────────────────────────────────── */
  function init(gacha, callback) {
    _gacha    = gacha;
    _callback = callback;
    _reset();
    _render();
  }

  function _reset() {
    _phase      = 'pick';
    _picked     = -1;
    _winnerIdx  = -1;
    _isWin      = false;   // FIX BUG 3
    _cameraX    = 0;
    _targetCamX = 0;
    _finished   = false;
    _raceStarted= false;
    _idleT      = 0;
    _horses     = [];
    if (_rafId) cancelAnimationFrame(_rafId);
    _rafId = null;
  }

  /* ────────────────────────────────────
     RENDER — inject HTML
  ──────────────────────────────────── */
  function _render() {
    const old = document.getElementById('gameArea');
    if (old) old.remove();
    const infoCard = document.getElementById('gachaInfoCard');

    const area = document.createElement('div');
    area.id        = 'gameArea';
    area.className = 'game-area slide-in';

    /* Horse pick buttons */
    const horseBtns = HORSES.map(h => `
      <button
        class="hr-horse-btn"
        id="hrBtn_${h.id}"
        style="--hc:${h.color};--hs:${h.shadow}"
        onclick="HorseRace._pickHorse(${h.id})">
        <span class="hr-horse-dot" style="background:${h.color};box-shadow:0 0 8px ${h.shadow}"></span>
        ${h.name}
      </button>
    `).join('');

    area.innerHTML = `
      <div class="hr-card" id="hrCard">

        <div class="slot-section-label">🏇 HORSE RACE</div>

        <div class="hr-canvas-wrap">
          <canvas id="hrCanvas"></canvas>
          <div class="hr-lane-labels" id="hrLaneLabels"></div>
        </div>

        <div class="hr-pick-section" id="hrPickSection">
          <div class="hr-pick-label">Pilih Kuda Kamu</div>
          <div class="hr-horse-btns">${horseBtns}</div>
        </div>

        <button class="hr-start-btn" id="hrStartBtn"
                onclick="HorseRace._onStart()" disabled>
          🏁 &nbsp;START RACE
        </button>

        <div class="hr-info-row">
          <div class="hr-info-item">
            <span class="hr-info-label">Hadiah</span>
            <span class="hr-info-val gold">
              Rp ${Number(_gacha.money).toLocaleString('id-ID')}
            </span>
          </div>
          <div class="hr-info-item">
            <span class="hr-info-label">Status</span>
            <span class="hr-info-val" id="hrStatus">Pilih kuda dulu!</span>
          </div>
        </div>

        <div class="win-rule">
          <div class="win-rule-title">🏇 Cara Main</div>
          <div class="win-rule-desc">
            Pilih warna kuda, lalu tekan <strong>START RACE</strong>.<br>
            Kuda kamu harus finish pertama untuk menang!
          </div>
        </div>

      </div>
    `;
    if (infoCard) {
      infoCard.replaceWith(area);
    } else {
      document.querySelector('.glass-card').insertAdjacentElement('afterend', area);
    }

    /* Setup canvas */
    _canvas = document.getElementById('hrCanvas');
    _ctx    = _canvas.getContext('2d');
    _resizeCanvas();
    _initHorses();
    _buildLaneLabels();

    /* Start idle draw loop */
    _phase = 'pick';
    _rafId = requestAnimationFrame(_loop);
  }

  /* ────────────────────────────────────
     CANVAS RESIZE
  ──────────────────────────────────── */
  function _resizeCanvas() {
    const wrap  = _canvas.parentElement;
    const w     = wrap.clientWidth || 380;
    const ratio = window.devicePixelRatio || 1;
    _canvas.width        = w * ratio;
    _canvas.height       = TRACK_H * ratio;
    _canvas.style.width  = w + 'px';
    _canvas.style.height = TRACK_H + 'px';
    _ctx.scale(ratio, ratio);
    _canvas._lw = w;
    _canvas._lh = TRACK_H;
  }

  /* ────────────────────────────────────
     INIT HORSES
  ──────────────────────────────────── */
  function _initHorses() {
    const W = _canvas._lw || 380;
    _horses = HORSES.map((h, i) => ({
      ...h,
      x:       W * 0.08,   // start position (world x)
      lane:    i,
      speed:   0,
      baseSpeed: BASE_SPEED + (Math.random() * 0.3 - 0.15),
      legT:    Math.random() * Math.PI * 2,   // leg cycle phase
      wobbleT: Math.random() * Math.PI * 2,   // vertical wobble
      finished: false,
      finishOrder: -1,
    }));
  }

  /* ────────────────────────────────────
     LANE LABELS (overlaid HTML)
  ──────────────────────────────────── */
  function _buildLaneLabels() {
    const el = document.getElementById('hrLaneLabels');
    if (!el) return;
    el.innerHTML = HORSES.map((h, i) => `
      <div class="hr-lane-label" style="
        top: ${LANE_PAD + 41 + i * LANE_H + LANE_H / 2 - 10}px;
        color: ${h.color};
        text-shadow: 0 0 8px ${h.shadow};
      ">${h.name}</div>
    `).join('');
  }

  /* ────────────────────────────────────
     PICK HORSE
  ──────────────────────────────────── */
  function _pickHorse(id) {
    if (_phase !== 'pick' && _phase !== 'ready') return;
    _picked = id;
    _phase  = 'ready';

    /* Tentukan menang/kalah dari app.js (sumber kebenaran) */
    const chance = _gacha.isPremium ? 0.40 : 0.30;
    _isWin = _gacha.result === 'win';

    if (_isWin) {
      _winnerIdx = id;
    } else {
      /* Pick a random loser (not the user's pick) */
      const others = HORSES.filter(h => h.id !== id);
      _winnerIdx = others[Math.floor(Math.random() * others.length)].id;
    }

    /* Update buttons */
    HORSES.forEach(h => {
      const btn = document.getElementById(`hrBtn_${h.id}`);
      if (!btn) return;
      btn.classList.toggle('selected', h.id === id);
      btn.classList.toggle('dimmed',   h.id !== id);
    });

    /* Enable start */
    const startBtn = document.getElementById('hrStartBtn');
    if (startBtn) { startBtn.disabled = false; startBtn.classList.add('ready'); }

    const stat = document.getElementById('hrStatus');
    if (stat) stat.textContent = `Kuda ${HORSES[id].name} dipilih! Siap balapan?`;
  }

  /* ────────────────────────────────────
     START RACE
  ──────────────────────────────────── */
  function _onStart() {
    if (_phase !== 'ready' || _picked < 0) return;
    _phase = 'racing';
    window.setTokenSlotMode('hidden'); // Sembunyikan tombol back begitu race dimulai

    const pickSec  = document.getElementById('hrPickSection');
    const startBtn = document.getElementById('hrStartBtn');
    if (pickSec)  pickSec.classList.add('hr-hidden');
    if (startBtn) { startBtn.disabled = true; startBtn.textContent = '🏁 Racing...'; startBtn.classList.remove('ready'); }

    const stat = document.getElementById('hrStatus');
    if (stat) stat.textContent = '🏇 Balapan dimulai!';

    const W         = _canvas._lw || 380;
    const finishX   = W * 0.08 + W * 3.5;
    const totalDist = finishX - W * 0.08;

    /* ── Script dramatik: tentukan momentum tiap kuda ── */
    /* Ide: bagi race jadi 3 zone (awal, tengah, akhir).
       Di tiap zone tiap kuda punya "target rank" berbeda.
       Si pemenang di awal boleh di belakang, tengah mulai naik,
       akhir dia yang paling depan.
       Si kalah boleh unggul di awal/tengah tapi keok di akhir. */

    const ZONES = 3;
    const zoneLen = totalDist / ZONES;

    /* Assign target rank per zone untuk tiap kuda */
    /* targetRank[zone] = urutan ke-berapa kuda ini di zone itu (0 = terdepan) */
    _horses.forEach(h => {
      h.targetRankByZone = [];
      h.finishX   = finishX;
      h.finished  = false;
      h.finishOrder = -1;
      h._speedVar = 0;
      h._nextVar  = 0;
      h._boostT   = 0;   // sisa frame burst speed
      h._zone     = 0;   // zone saat ini
    });

    /* Buat drama: acak urutan di tiap zone tapi paksa winner menang di akhir */
    const N   = HORSES.length;
    const ids  = HORSES.map(h => h.id);

    for (let z = 0; z < ZONES; z++) {
      /* Acak urutan */
      const shuffled = [...ids].sort(() => Math.random() - 0.5);

      if (z === ZONES - 1) {
        /* Zone terakhir: winner HARUS rank 0, loser TIDAK boleh rank 0 */
        const wi = shuffled.indexOf(_winnerIdx);
        if (wi !== 0) {
          /* Tukar winner ke depan, yang di depan mundur ke posisi winner */
          [shuffled[0], shuffled[wi]] = [shuffled[wi], shuffled[0]];
        }
        /* Pastikan picked horse (kalau kalah) tidak di rank 0 */
        if (!_isWin && shuffled[0] === _picked) {
          /* swap dengan rank 1 */
          [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
          /* cek lagi winner */
          const wii = shuffled.indexOf(_winnerIdx);
          if (wii !== 0) [shuffled[0], shuffled[wii]] = [shuffled[wii], shuffled[0]];
        }
      } else if (z === 0) {
        /* Zone awal: biar seru, winner TIDAK boleh rank 0 (kelihatan kalah dulu) */
        const wi = shuffled.indexOf(_winnerIdx);
        if (wi === 0 && N > 1) {
          [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
        }
      }
      /* Simpan target rank */
      shuffled.forEach((id, rank) => {
        _horses[id].targetRankByZone.push(rank);
      });
    }

    /* Speed awal semua kuda sama (base + sedikit noise) */
    _horses.forEach(h => {
      h.speed = BASE_SPEED + (Math.random() * 0.2 - 0.1);
    });

    _raceStarted = true;
  }

  /* ────────────────────────────────────
     MAIN LOOP
  ──────────────────────────────────── */
  let _lastGallopAt = 0;
  function _loop() {
    _draw();
    if (_phase === 'racing') {
      const now = performance.now();
      if (now - _lastGallopAt > 140) { SFX.horserace.gallop(); _lastGallopAt = now; }
    }
    if (_phase !== 'done') {
      _rafId = requestAnimationFrame(_loop);
    }
  }

  /* ────────────────────────────────────
     UPDATE & DRAW
  ──────────────────────────────────── */
  function _draw() {
    const ctx = _ctx;
    const W   = _canvas._lw || 380;
    const H   = _canvas._lh || TRACK_H;

    /* ── Update horse positions when racing ── */
    if (_phase === 'racing') {
      const W           = _canvas._lw || 380;
      const startWorldX = W * 0.08;
      const finishWorldX= startWorldX + W * 3.5;
      const totalDist   = finishWorldX - startWorldX;
      const ZONES       = 3;
      const zoneLen     = totalDist / ZONES;

      let finishCount = 0;
      let leaderX     = 0;

      /* Sort kuda berdasarkan posisi saat ini (depan = rank 0) */
      const sorted = [..._horses].sort((a, b) => b.x - a.x);

      _horses.forEach(h => {
        if (h.finished) { finishCount++; return; }

        /* Tentukan zone saat ini */
        const progress = (h.x - startWorldX) / totalDist;
        const zone     = Math.min(ZONES - 1, Math.floor(progress * ZONES));
        h._zone        = zone;

        /* Target rank kuda ini di zone saat ini */
        const targetRank = h.targetRankByZone[zone];

        /* Rank aktual saat ini */
        const currentRank = sorted.findIndex(s => s.id === h.id);

        /* Selisih rank: positif = kuda ini lebih belakang dari target */
        const rankDiff = currentRank - targetRank;

        /* Hitung jarak ke kuda di depan/belakang untuk referensi gap */
        const gap = (sorted[0]?.x - h.x) || 0;

        /* Speed adjustment berdasarkan rank vs target:
           - rankDiff > 0 (lebih belakang dari harusnya) → ngebut
           - rankDiff < 0 (lebih depan dari harusnya)   → melambat sedikit
           - rankDiff = 0                                → speed normal */
        let speedAdj = 0;
        if (rankDiff > 0) {
          /* Kejar → boost, makin jauh makin kenceng tapi ada cap */
          speedAdj = Math.min(rankDiff * 0.18, 0.7);
          /* Burst dramatis: kalau beda 2+ rank dan zona akhir → lebih kenceng */
          if (rankDiff >= 2 && zone === ZONES - 1) speedAdj += 0.35;
        } else if (rankDiff < 0) {
          /* Terlalu depan → sedikit melambat supaya yang lain bisa nyusul dulu */
          speedAdj = Math.max(rankDiff * 0.12, -0.4);
        }

        /* Random micro-variance biar tidak kelihatan robotik */
        h._nextVar--;
        if (h._nextVar <= 0) {
          h._speedVar = (Math.random() - 0.5) * 0.25;
          h._nextVar  = 18 + Math.floor(Math.random() * 22);
        }

        const spd = Math.max(0.55, h.speed + speedAdj + h._speedVar);
        h.x       += spd;
        h.legT    += spd * 0.18;
        h.wobbleT += 0.12;

        if (h.x > leaderX) leaderX = h.x;

        /* Check finish */
        if (h.x >= finishWorldX && !h.finished) {
          h.finished    = true;
          h.finishOrder = finishCount;
          finishCount++;

          /* Update status */
          const stat = document.getElementById('hrStatus');
          if (stat && h.id === _winnerIdx) {
            const isWin  = _isWin;
            const medal  = ['🥇','🥈','🥉'][h.finishOrder] || '🏁';
            stat.textContent = `${medal} ${h.name} finish pertama!`;
          }

          if (h.id === _winnerIdx) {
            setTimeout(() => _endRace(), 600);
          }
        }
      });

      /* Camera follows leader */
      const camTarget = Math.max(0, leaderX - (W * 0.38));
      _cameraX += (camTarget - _cameraX) * CAMERA_EASE;
    } else {
      /* Idle: horses bob in place */
      _idleT += 0.04;
      _horses.forEach((h, i) => {
        h.legT    += 0.03;
        h.wobbleT += 0.04;
      });
    }

    /* ── DRAW ── */
    ctx.clearRect(0, 0, W, H);

    /* Sky gradient */
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0,   '#1a1a2e');
    sky.addColorStop(0.4, '#16213e');
    sky.addColorStop(1,   '#0f3460');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    /* Crowd silhouette at top */
    _drawCrowd(ctx, W);

    /* Track lanes */
    _drawTrack(ctx, W, H);

    /* Finish line */
    _drawFinishLine(ctx, W, H);

    /* Horses */
    _horses.forEach(h => _drawHorse(ctx, h, W, H));

    /* Starting line */
    _drawStartLine(ctx, W, H);

    /* HUD overlay */
    _drawHUD(ctx, W, H);
  }

  /* ── Crowd ── */
  function _drawCrowd(ctx, W) {
    const H = 38;
    /* Stadium back */
    ctx.fillStyle = '#0d0d20';
    ctx.fillRect(0, 0, W, H + 10);

    /* Crowd dots */
    for (let i = 0; i < 60; i++) {
      const x = ((i * 73 + 11) % W);
      const y = 6 + ((i * 37) % 22);
      const r = 2.5 + (i % 3);
      const colors = ['#e05555','#4f8ef7','#f0c030','#4caf82','#a06cd5','#fff','#f97','#adf'];
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = colors[i % colors.length];
      ctx.globalAlpha = 0.6 + (i % 4) * 0.1;
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    /* Fence top */
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(0, H, W, 3);
  }

  /* ── Track ── */
  function _drawTrack(ctx, W, H) {
    const offsetX = -(_cameraX % (W * 0.5));

    HORSES.forEach((_, i) => {
      const y    = LANE_PAD + i * LANE_H + 41;
      const laneH = LANE_H;
      const isEven = i % 2 === 0;

      /* Lane background */
      ctx.fillStyle = isEven ? 'rgba(34,60,34,0.9)' : 'rgba(28,50,28,0.9)';
      ctx.fillRect(0, y, W, laneH);

      /* Grass texture lines */
      ctx.strokeStyle = isEven ? 'rgba(50,90,50,0.4)' : 'rgba(40,75,40,0.4)';
      ctx.lineWidth   = 1;
      for (let gx = offsetX; gx < W + 40; gx += 38) {
        ctx.beginPath();
        ctx.moveTo(gx, y);
        ctx.lineTo(gx, y + laneH);
        ctx.stroke();
      }

      /* Lane divider */
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth   = 1;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(0, y + laneH);
      ctx.lineTo(W, y + laneH);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    /* Ground strip below last lane */
    const lastY = LANE_PAD + HORSES.length * LANE_H + 41;
    ctx.fillStyle = '#1a3020';
    ctx.fillRect(0, lastY, W, H - lastY);
  }

  /* ── Finish line ── */
  function _drawFinishLine(ctx, W, H) {
    const worldFinishX = W * 0.08 + W * 3.5;
    const screenX      = worldFinishX - _cameraX;

    if (screenX < -20 || screenX > W + 20) return;

    const trackTop = LANE_PAD + 41;
    const trackBot = trackTop + HORSES.length * LANE_H;

    /* Checkered pattern */
    const squareH = 8;
    const squareW = 8;
    for (let row = 0; row * squareH < (trackBot - trackTop); row++) {
      for (let col = 0; col < 3; col++) {
        const dark = (row + col) % 2 === 0;
        ctx.fillStyle = dark ? '#000' : '#fff';
        ctx.fillRect(
          screenX - squareW + col * squareW,
          trackTop + row * squareH,
          squareW, squareH
        );
      }
    }

    /* Glow */
    const g = ctx.createLinearGradient(screenX - 20, 0, screenX + 20, 0);
    g.addColorStop(0,   'rgba(255,255,200,0)');
    g.addColorStop(0.5, 'rgba(255,255,200,0.15)');
    g.addColorStop(1,   'rgba(255,255,200,0)');
    ctx.fillStyle = g;
    ctx.fillRect(screenX - 20, trackTop, 40, trackBot - trackTop);

    /* FINISH label */
    ctx.font      = 'bold 9px Syne, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText('FINISH', screenX, trackTop - 6);
  }

  /* ── Start line ── */
  function _drawStartLine(ctx, W, H) {
    const worldStartX = W * 0.08;
    const screenX     = worldStartX - _cameraX;

    if (screenX < -5 || screenX > W + 5) return;

    const trackTop = LANE_PAD + 41;
    const trackBot = trackTop + HORSES.length * LANE_H;

    ctx.strokeStyle = 'rgba(255,220,60,0.7)';
    ctx.lineWidth   = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(screenX, trackTop);
    ctx.lineTo(screenX, trackBot);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /* ── Horse drawing ── */
  function _drawHorse(ctx, h, W, H) {
    const screenX = h.x - _cameraX;
    if (screenX < -60 || screenX > W + 60) return;

    const laneY    = LANE_PAD + h.lane * LANE_H + 41 + LANE_H * 0.5 + 4;
    const wobble   = Math.sin(h.wobbleT) * (h.finished ? 0 : 2.5);
    const drawY    = laneY + wobble;

    const scale    = 0.85;
    const legCycle = h.legT;

    ctx.save();
    ctx.translate(screenX, drawY);
    ctx.scale(scale, scale);

    /* Shadow under horse */
    ctx.beginPath();
    ctx.ellipse(0, 14, 22, 5, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();

    /* ── Body ── */
    ctx.beginPath();
    ctx.ellipse(0, 0, 20, 11, 0.1, 0, Math.PI * 2);
    ctx.fillStyle = h.color;
    ctx.fill();

    /* Body highlight */
    const bhl = ctx.createLinearGradient(-10, -11, 10, 2);
    bhl.addColorStop(0, 'rgba(255,255,255,0.22)');
    bhl.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bhl;
    ctx.beginPath();
    ctx.ellipse(0, 0, 20, 11, 0.1, 0, Math.PI * 2);
    ctx.fill();

    /* ── Neck ── */
    ctx.beginPath();
    ctx.moveTo(12, -4);
    ctx.quadraticCurveTo(18, -12, 16, -18);
    ctx.quadraticCurveTo(14, -22, 10, -20);
    ctx.quadraticCurveTo(8, -12, 10, -4);
    ctx.closePath();
    ctx.fillStyle = h.color;
    ctx.fill();

    /* ── Head ── */
    ctx.beginPath();
    ctx.ellipse(17, -20, 8, 5.5, -0.3, 0, Math.PI * 2);
    ctx.fillStyle = h.color;
    ctx.fill();

    /* Nose */
    ctx.beginPath();
    ctx.ellipse(23, -18, 4, 3, 0.2, 0, Math.PI * 2);
    ctx.fillStyle = h.color;
    ctx.fill();

    /* Nostril */
    ctx.beginPath();
    ctx.ellipse(25, -17, 1.2, 0.9, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fill();

    /* Eye */
    ctx.beginPath();
    ctx.arc(19, -22, 1.8, 0, Math.PI * 2);
    ctx.fillStyle = '#111';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(19.5, -22.5, 0.6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fill();

    /* ── Mane ── */
    for (let m = 0; m < 5; m++) {
      const mx = 10 - m * 2;
      const my = -18 - m * 1.5;
      const mw = 3 + Math.sin(legCycle + m) * 1.5;
      ctx.beginPath();
      ctx.ellipse(mx, my, mw, 3, -0.5, 0, Math.PI * 2);
      ctx.fillStyle = h.mane;
      ctx.fill();
    }

    /* ── Ears ── */
    ctx.beginPath();
    ctx.moveTo(13, -25); ctx.lineTo(15, -30); ctx.lineTo(17, -25);
    ctx.closePath();
    ctx.fillStyle = h.mane;
    ctx.fill();

    /* ── Tail ── */
    const tailSwing = Math.sin(legCycle * 0.7) * 8;
    ctx.beginPath();
    ctx.moveTo(-20, -2);
    ctx.quadraticCurveTo(-28 + tailSwing * 0.3, 4, -26 + tailSwing, 14);
    ctx.quadraticCurveTo(-24 + tailSwing, 18, -22, 14);
    ctx.quadraticCurveTo(-20, 6, -20, -2);
    ctx.fillStyle = h.mane;
    ctx.fill();

    /* ── Legs (4 legs, animated) ── */
    _drawLegs(ctx, h, legCycle);

    /* ── Jockey ── */
    _drawJockey(ctx, h, legCycle);

    /* Finish ribbon if done */
    if (h.finished && h.finishOrder === 0) {
      ctx.font      = '14px serif';
      ctx.textAlign = 'center';
      ctx.fillText('🥇', 0, -38);
    }

    ctx.restore();
  }

  function _drawLegs(ctx, h, t) {
    const legs = [
      { ox: 10,  phase: 0 },
      { ox: 10,  phase: Math.PI },
      { ox: -10, phase: Math.PI * 0.5 },
      { ox: -10, phase: Math.PI * 1.5 },
    ];

    legs.forEach(leg => {
      const swing = Math.sin(t + leg.phase) * 10;
      const kneeX = leg.ox + swing * 0.5;
      const kneeY = 8 + Math.abs(Math.sin(t + leg.phase)) * 4;
      const footX = leg.ox + swing;
      const footY = 14 + Math.max(0, -Math.sin(t + leg.phase)) * 6;

      ctx.beginPath();
      ctx.moveTo(leg.ox, 6);
      ctx.lineTo(kneeX, kneeY);
      ctx.lineTo(footX, footY);
      ctx.strokeStyle = h.color;
      ctx.lineWidth   = 3;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      ctx.stroke();

      /* Hoof */
      ctx.beginPath();
      ctx.ellipse(footX, footY + 1.5, 3, 2, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#333';
      ctx.fill();
    });
  }

  function _drawJockey(ctx, h, t) {
    const bobY = Math.sin(t * 2) * 1.5;

    /* Body */
    ctx.beginPath();
    ctx.ellipse(4, -13 + bobY, 5, 7, 0.1, 0, Math.PI * 2);
    ctx.fillStyle = h.mane;
    ctx.fill();

    /* Head */
    ctx.beginPath();
    ctx.arc(6, -21 + bobY, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#f5c99a';
    ctx.fill();

    /* Helmet */
    ctx.beginPath();
    ctx.arc(6, -23 + bobY, 4.8, Math.PI, 0);
    ctx.fillStyle = h.color;
    ctx.fill();
    ctx.beginPath();
    ctx.rect(1, -23 + bobY, 10, 2);
    ctx.fillStyle = h.mane;
    ctx.fill();

    /* Arm/whip */
    const whip = Math.sin(t * 1.5) * 5;
    ctx.beginPath();
    ctx.moveTo(8, -15 + bobY);
    ctx.lineTo(14 + whip * 0.3, -10 + whip * 0.5);
    ctx.strokeStyle = '#888';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
  }

  /* ── HUD ── */
  function _drawHUD(ctx, W, H) {
    /* HUD kosong — indikator titik dihapus */
  }

  /* ────────────────────────────────────
     END RACE
  ──────────────────────────────────── */
  function _endRace() {
    if (_finished) return;
    _finished = true;
    _phase    = 'done';

    /* FIX BUG 4: gunakan _isWin yang sudah ditentukan di _pickHorse,
       bukan _gacha.result yang belum tentu ter-set */
    const isWin  = _isWin;
    const winner = HORSES[_winnerIdx];

    const stat = document.getElementById('hrStatus');
    if (stat) {
      stat.textContent = isWin
        ? `🏆 ${winner.name} menang! Kamu menang!`
        : `💀 ${winner.name} menang! Kamu kalah.`;
      stat.style.color = isWin ? 'var(--win-green)' : 'var(--lose-red)';
    }
    isWin ? SFX.horserace.fanfare() : SFX.horserace.lose();

    const startBtn = document.getElementById('hrStartBtn');
    if (startBtn) startBtn.textContent = isWin ? '🏆 Menang!' : '💀 Kalah';

    setTimeout(() => {
      cancelAnimationFrame(_rafId);
      _callback(isWin, _gacha.money);
    }, 1800);
  }

  /* ── Expose ── */
  return { init, _pickHorse, _onStart };

})();
