/* ══════════════════════════════════════
   AIRPLANE — Versi Pesawat dari Spaceman
   Fase:
     ready   → pesawat diam di kiri-bawah, langit biru, awan bergerak
     flying  → terbang diagonal ke tengah layar, lalu hover di sana
                dengan animasi goyang + trail asap putih
     crashed → mesin terbakar, pesawat jatuh ke kanan-bawah dengan api
     done    → landing mulus ke kanan-bawah (cashout berhasil)
══════════════════════════════════════ */

const Airplane = (() => {

  /* ── Config ── */
  const TICK_MS    = 100;
  const SPEED_BASE = 0.015;
  const SPEED_FAST = 0.025;
  const TRAIL_MAX  = 120;

  /* ── State ── */
  let _gacha       = null;
  let _callback    = null;
  let _multiplier  = 1.00;
  let _crashAt     = 2.00;
  let _cashedOut   = false;
  let _isWin       = false;
  let _phase       = 'ready';   // ready | flying | crashed | done
  let _tickTimer   = null;
  let _rafId       = null;

  /* ── Anim vars ── */
  let _ax = 0, _ay = 0;
  let _tx = 0, _ty = 0;
  let _floatT   = 0;
  let _shineT   = 0;
  let _engineT  = 0;
  let _cloudT   = 0;
  let _crashT   = 0;
  let _flyT     = 0;
  let _trail    = [];
  let _stars    = [];
  let _clouds   = [];
  let _bgRed    = 0;
  let _tilt     = 0;
  let _crashStartX = null;
  let _crashStartY = null;
  let _fireParticles = [];
  let _smokeParticles = [];
  let _exitT    = 0;   // untuk fase done/crashed exit ke kanan-bawah
  let _speed    = 0.6; // kecepatan dunia (parallax), makin tinggi multiplier makin kencang
  let _hills    = [];
  let _halfTaken = false;  // cashout 50% sudah dipakai?
  let _halfPrize = 0;      // Rp yang sudah diambil lewat cashout 50%
  let _streaks  = [];

  /* ── Canvas ── */
  let _cv = null, _ctx = null;

  /* ════════════════════════════════
     INIT
  ════════════════════════════════ */
  function init(gacha, callback) {
    _gacha    = gacha;
    _callback = callback;
    _reset();
    _buildHTML();
  }

  function _reset() {
    _multiplier  = 1.00;
    _phase       = 'ready';
    _cashedOut   = false;
    _isWin       = false;
    _trail       = [];
    _fireParticles = [];
    _smokeParticles = [];
    _floatT  = 0; _shineT = 0; _engineT = 0;
    _cloudT  = 0; _crashT = 0; _flyT = 0; _exitT = 0;
    _bgRed   = 0;
    _speed   = 0.6;
    _halfTaken = false; _halfPrize = 0;
    _tilt    = 0;
    _crashStartX = null;
    _crashStartY = null;
    if (_tickTimer) clearInterval(_tickTimer);
    if (_rafId)     cancelAnimationFrame(_rafId);
    _tickTimer = _rafId = null;
  }

  /* FIX: cap maksimum dinaikkan ke 22.22x (dari 8.5x).
     - win  : 1% kemungkinan nabrak rendah pas 2.00x (hampir-rugi),
              99% sisanya tersebar 3.5x - 22.22x.
     - lose : tetap 1.5x - 3.5x, tidak diubah.
     PENTING: cap 22.22 ini HARUS sinkron dengan MAX_GAME_MULTIPLIER.airplane
     di app.js dan api/gacha-update.js — kalau salah satu lupa diubah,
     hasil >batas lama akan ditolak server (400) walau menang di animasi. */
  function _calcCrashAt(win) {
    if (!win) return parseFloat((1.5 + Math.random() * 2.0).toFixed(2));

    if (Math.random() < 0.01) return 2.00; // 1% nabrak rendah di 2x
    return parseFloat((3.5 + Math.random() * 18.72).toFixed(2)); // 3.50 - 22.22
  }

  /* ════════════════════════════════
     HTML
  ════════════════════════════════ */
  function _buildHTML() {
    const old = document.getElementById('gameArea');
    if (old) old.remove();
    const anchor = document.getElementById('gachaInfoCard');

    const area = document.createElement('div');
    area.id = 'gameArea'; area.className = 'game-area slide-in';
    area.innerHTML = `
      <div class="airplane-card" id="airplaneCard">
        <div class="slot-section-label">✈️ AIRPLANE MULTIPLIER</div>
        <div class="airplane-canvas-wrap" id="apWrap">
          <canvas id="apCanvas"></canvas>
        </div>
        <div class="ap-btn-row" id="apBtnRow">
          <button class="ap-btn ap-btn-start ap-main" id="apMainBtn" onclick="Airplane._start()">
            ▶ MULAI
          </button>
        </div>
        <div class="airplane-info-row">
          <div class="airplane-info-item">
            <span class="airplane-info-label">Taruhan</span>
            <span class="airplane-info-val gold">${_gacha.betAmount || (_gacha.money/1000)} bet</span>
          </div>
          <div class="airplane-info-item">
            <span class="airplane-info-label">Status</span>
            <span class="airplane-info-val" id="apStatus">Siap di landasan...</span>
          </div>
        </div>
      </div>`;

    if (anchor) anchor.replaceWith(area);
    else document.querySelector('.glass-card').insertAdjacentElement('afterend', area);

    _cv  = document.getElementById('apCanvas');
    _ctx = _cv.getContext('2d');
    _setupCanvas();
    _genClouds();
    _genStars();

    _isWin   = _gacha.result === 'win';
    _crashAt = _calcCrashAt(_isWin);

    const W = _cv._lw, H = _cv._lh;
    _ax = W * 0.08; _ay = H * 0.82;
    _tx = _ax;      _ty = _ay;

    _rafId = requestAnimationFrame(_loop);
  }

  function _setupCanvas() {
    const w     = _cv.parentElement.clientWidth || 360;
    const ratio = window.devicePixelRatio || 1;
    const h     = 280;
    _cv.width        = w * ratio;
    _cv.height       = h * ratio;
    _cv.style.width  = w + 'px';
    _cv.style.height = h + 'px';
    _ctx.scale(ratio, ratio);
    _cv._lw = w; _cv._lh = h;
  }

  function _genClouds() {
    const W = _cv._lw, H = _cv._lh;
    /* 3 lapisan: jauh (kecil, lambat) → dekat (besar, cepat) */
    _clouds = [];
    const layers = [
      { n: 5, sc: 0.55, f: 0.35, y0: 0.06, y1: 0.45, a: 0.55 },
      { n: 4, sc: 0.85, f: 0.65, y0: 0.10, y1: 0.65, a: 0.80 },
      { n: 3, sc: 1.30, f: 1.15, y0: 0.20, y1: 0.85, a: 0.95 },
    ];
    layers.forEach(L => {
      for (let i = 0; i < L.n; i++) {
        _clouds.push({
          x: Math.random() * W * 1.3,
          y: H * (L.y0 + Math.random() * (L.y1 - L.y0)),
          w: (70 + Math.random() * 50) * L.sc,
          h: (20 + Math.random() * 14) * L.sc,
          f: L.f, alpha: L.a,
        });
      }
    });
    _hills = Array.from({ length: 7 }, (_, i) => ({ x: i * W * 0.22, w: W * (0.3 + Math.random() * 0.2), h: H * (0.06 + Math.random() * 0.07) }));
    _streaks = Array.from({ length: 14 }, () => ({ x: Math.random() * W, y: Math.random() * H * 0.85, l: 20 + Math.random() * 50, f: 0.6 + Math.random() * 0.8 }));
  }

  function _genStars() {
    const W = _cv._lw, H = _cv._lh;
    _stars = Array.from({ length: 30 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H * 0.5,
      r: 0.5 + Math.random() * 1.2,
      t: Math.random() * Math.PI * 2,
      spd: 0.015 + Math.random() * 0.02,
    }));
  }

  /* ════════════════════════════════
     CONTROLS
  ════════════════════════════════ */
  function _betVal() { return _gacha.betAmount || (_gacha.money / 1000); }
  /* Rp hadiah penuh kalau semua diambil sekarang (RTP 0.95) */
  function _fullNow() { return Math.floor(_betVal() * _multiplier * 1000 * 0.95); }
  /* Rp separuh taruhan di multiplier sekarang */
  /* Tanpa pajak 5%: bet 100 cashout 50% di 2× = tepat 100 (balik modal, tidak rugi) */
  function _halfNow() { return Math.floor(_betVal() * _multiplier * 1000 * 0.5); }
  /* Sisa separuh taruhan kalau di-cashout sekarang (pajak 5% seperti cashout biasa) */
  function _remainNow() { return Math.floor(_betVal() * _multiplier * 1000 * 0.5 * 0.95); }
  /* Total Rp kalau cashout sekarang (termasuk 50% yang sudah diambil) */
  function _totalNow() { return _halfTaken ? _halfPrize + _remainNow() : _fullNow(); }
  const _rp = n => 'Rp ' + n.toLocaleString('id-ID');

  function _updateButtons() {
    if (_phase !== 'flying') return;
    const cb = document.getElementById('apCashBtn');
    const hb = document.getElementById('apHalfBtn');
    if (cb) cb.innerHTML = `<span class="ap-cash-top">CASHOUT</span><span class="ap-cash-amt">${_rp(_halfTaken ? _remainNow() : _fullNow())}</span>`;
    if (hb && !_halfTaken) hb.innerHTML = `<span class="ap-cash-top">CASHOUT 50%</span><span class="ap-cash-amt">${_rp(_halfNow())}</span>`;
  }

  function _start() {
    if (_phase !== 'ready') return;
    _phase = 'flying';
    SFX.airplane.engineStart();
    window.setTokenSlotMode('hidden'); // Sembunyikan tombol back begitu pesawat mulai terbang
    /* Tombol MULAI diganti 2 tombol: kiri Cashout (pesawat berhenti), kanan Cashout 50% (pesawat lanjut) */
    const row = document.getElementById('apBtnRow');
    if (row) {
      row.classList.add('two');
      row.innerHTML = `
        <button class="ap-btn ap-btn-take" id="apCashBtn" onclick="Airplane._cashout()"></button>
        <button class="ap-btn ap-btn-half" id="apHalfBtn" onclick="Airplane._cashHalf()"></button>`;
    }
    _updateButtons();
    const st = document.getElementById('apStatus');
    if (st) st.textContent = 'Pesawat terus terbang!';
    _tickTimer = setInterval(_tick, TICK_MS);
  }

  function _cashout() {
    if (_phase !== 'flying' || _cashedOut) return;
    _doCashout();
  }

  /* Cashout 50%: ambil separuh taruhan sekarang, pesawat tetap terbang. Cuma bisa sekali. */
  function _cashHalf() {
    if (_phase !== 'flying' || _cashedOut || _halfTaken) return;
    _halfTaken = true;
    _halfPrize = _halfNow();
    SFX.airplane.cashout();
    const hb = document.getElementById('apHalfBtn');
    if (hb) {
      hb.disabled = true;
      hb.classList.add('used');
      hb.innerHTML = `<span class="ap-cash-top">✓ 50% DIAMBIL</span><span class="ap-cash-amt">${_rp(_halfPrize)}</span>`;
    }
    const st = document.getElementById('apStatus');
    if (st) { st.textContent = `50% diambil ${_multiplier.toFixed(2)}× — ${_rp(_halfPrize)}. Sisanya masih terbang!`; st.style.color = '#4caf82'; }
  }

  function _doCashout() {
    if (_cashedOut) return;
    _cashedOut = true;
    _phase     = 'done';
    clearInterval(_tickTimer);
    SFX.airplane.cashout();
    const cb = document.getElementById('apCashBtn');
    const hb = document.getElementById('apHalfBtn');
    if (cb) { cb.disabled = true; cb.classList.remove('ap-btn-take'); cb.classList.add('ap-btn-done'); cb.textContent = '✓ DIAMBIL'; }
    if (hb) { hb.disabled = true; hb.classList.add('used'); }
    const prize = _totalNow();
    const st = document.getElementById('apStatus');
    if (st) {
      st.textContent = `✓ Diambil ${_multiplier.toFixed(2)}× — ${_rp(prize)}!`;
      st.style.color = '#4caf82';
    }
    /* menang kalau total > modal; kalau tidak, dihitung rugi sebagian */
    setTimeout(() => _callback(prize >= _betVal() * 1000, prize), 3000);
  }

  function _doCrash() {
    if (_phase === 'crashed') return;
    _phase = 'crashed';
    clearInterval(_tickTimer);
    SFX.airplane.crash();
    _crashStartX = _ax;
    _crashStartY = _ay;
    const cb = document.getElementById('apCashBtn');
    const hb = document.getElementById('apHalfBtn');
    if (cb) { cb.disabled = true; cb.classList.remove('ap-btn-take'); cb.classList.add('ap-btn-crash'); cb.textContent = '💥 JATUH'; }
    if (hb) { hb.disabled = true; hb.classList.add('used'); }
    const st = document.getElementById('apStatus');
    if (st) {
      st.textContent = `Nabrak di ${_multiplier.toFixed(2)}×`;
      st.style.color = '#cf5c5c';
    }
    /* Kalau 50% sudah diambil, jumlah itu tetap jadi milik pemain */
    setTimeout(() => _callback(_halfPrize >= _betVal() * 1000, _halfPrize), 3500);
  }

  /* ════════════════════════════════
     TICK
  ════════════════════════════════ */
  function _tick() {
    if (_phase !== 'flying') return;
    const inc   = _multiplier >= 2.0 ? SPEED_FAST : SPEED_BASE;
    _multiplier = parseFloat((_multiplier + inc).toFixed(3));
    SFX.airplane.ascend();
    _updateButtons();
    if (_multiplier >= _crashAt) _doCrash();
  }

  /* ════════════════════════════════
     RENDER LOOP
  ════════════════════════════════ */
  let _lastTs = 0, _k = 1, _dispMult = 1;
  const _ease = f => 1 - Math.pow(1 - f, _k);          /* lerp yang tidak tergantung refresh rate */
  function _loop(ts) {
    _k = _lastTs ? Math.min(3, Math.max(0.25, (ts - _lastTs) / 16.667)) : 1;
    _lastTs = ts;
    _draw();
    _rafId = requestAnimationFrame(_loop);
  }

  function _draw() {
    if (!_ctx) return;
    const ctx = _ctx, W = _cv._lw, H = _cv._lh;

    _floatT  += 0.030 * _k;
    _shineT  += 0.018 * _k;
    _engineT += 0.22 * _k;
    _cloudT  += _k;

    if (_phase === 'flying') _flyT += 0.016 * _k;
    if (_phase === 'crashed' || _phase === 'done') _exitT += 0.018 * _k;
    if (_phase === 'crashed') _crashT += 0.025 * _k;

    /* Kecepatan dunia (parallax) */
    const tgtSpeed = _phase === 'ready' ? 0.6
                   : _phase === 'flying' ? Math.min(11, 3 + _multiplier * 0.55)
                   : _phase === 'done'   ? 2.5 : 0.4;
    _speed += (tgtSpeed - _speed) * _ease(0.04);

    /* Lerp bg merah */
    const targetRed = _phase === 'crashed' ? 1 : 0;
    _bgRed += (targetRed - _bgRed) * _ease(0.04);
    _dispMult += (_multiplier - _dispMult) * _ease(0.22);

    /* ── Background ── */
    _drawBg(ctx, W, H);

    /* ── Stars (malam / crash) ── */
    if (_bgRed > 0.1) _drawStars(ctx, W, H);

    /* ── Matahari & bukit ── */
    _drawScenery(ctx, W, H);

    /* ── Clouds ── */
    if (_bgRed < 0.85) _drawClouds(ctx, W, H);
    _drawSpeedLines(ctx, W, H);

    /* ── Multiplier display (tengah atas) ── */
if (_phase === 'flying') {
  _drawMultiplierBadge(ctx, W, H);
}

    /* ── Trail asap ── */
    if (_trail.length > 1 && (_phase === 'flying' || _phase === 'done')) {
      _drawTrail(ctx);
    }

    /* ── Update posisi ── */
    _updatePos(W, H);

    /* ── Fire particles (crash) ── */
    if (_phase === 'crashed') {
      _updateFireParticles();
      _drawCrashOverlay(ctx, W, H);
    }

    /* ── Pesawat ── */
    if (_phase === 'crashed') {

  const shake =
    Math.min(5, _crashT * 12);

  ctx.save();

  ctx.translate(
    (Math.random() - 0.5) * shake,
    (Math.random() - 0.5) * shake
  );

  _drawPlane(ctx, W, H);

  ctx.restore();

} else {

  _drawPlane(ctx, W, H);

}

    /* ── Fire di atas pesawat (crash) ── */
    if (_phase === 'crashed') {
      _drawFireParticles(ctx);
      _drawCrashText(ctx, W, H);
    }

    /* ── Done text ── */
    if (_phase === 'done') {
      _drawDoneText(ctx, W, H);
    }
  }

  /* ─────────────────────────────────
     BACKGROUND — langit biru → merah saat crash
  ───────────────────────────────── */
  function _drawBg(ctx, W, H) {
    const r0 = Math.round(20  + _bgRed * 140);
    const g0 = Math.round(80  + _bgRed * -75);
    const b0 = Math.round(160 + _bgRed * -155);
    const r1 = Math.round(40  + _bgRed * 160);
    const g1 = Math.round(120 + _bgRed * -115);
    const b1 = Math.round(200 + _bgRed * -195);

    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0,   `rgb(${r0},${g0},${b0})`);
    bg.addColorStop(0.6, `rgb(${r1},${g1},${b1})`);
    bg.addColorStop(1,   `rgb(${Math.round(r1*0.55)},${Math.round(g1*0.4)},${Math.round(b1*0.3)})`);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    /* Ground strip bawah */
    let groundAlpha = 0;

if (_phase === 'ready') {
  groundAlpha = 1;
}
else if (_phase === 'flying') {
  const t = Math.min(1, _flyT * 0.8);
groundAlpha = 1 - (t * t * t);
}
else if (_phase === 'done' || _phase === 'crashed') {
  groundAlpha = 1;
}
    if (groundAlpha > 0) {
      const gg = ctx.createLinearGradient(0, H*0.88, 0, H);
      gg.addColorStop(0, `rgba(30,80,30,${groundAlpha * 0.8})`);
      gg.addColorStop(1, `rgba(20,60,20,${groundAlpha})`);
      ctx.fillStyle = gg;
      ctx.fillRect(0, H*0.88, W, H*0.12);

      /* Runway dashes */
      ctx.save();
      ctx.globalAlpha = groundAlpha * 0.5;
      ctx.fillStyle = '#f5d020';
      for (let i = 0; i < 6; i++) {
        const rx = W * 0.08 + i * W * 0.14;
        ctx.fillRect(rx, H*0.915, W*0.08, 3);
      }
      ctx.restore();
    }

    /* Burst rays saat crash */
    if (_bgRed > 0.15) {
      const cx = _ax || W*0.5, cy = _ay || H*0.45;
      const a0 = _bgRed * 0.10;
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + _shineT * 0.15;
        const len = W * 0.9;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a - 0.06) * 20, cy + Math.sin(a - 0.06) * 20);
        ctx.lineTo(cx + Math.cos(a - 0.06) * len, cy + Math.sin(a - 0.06) * len);
        ctx.lineTo(cx + Math.cos(a + 0.06) * len, cy + Math.sin(a + 0.06) * len);
        ctx.lineTo(cx + Math.cos(a + 0.06) * 20, cy + Math.sin(a + 0.06) * 20);
        ctx.fillStyle = `rgba(255,180,0,${a0})`;
        ctx.fill();
      }
    }
  }

  /* ─────────────────────────────────
     CLOUDS
  ───────────────────────────────── */
  function _drawClouds(ctx, W, H) {
    for (const c of _clouds) {
      c.x -= _speed * c.f * _k;
      if (c.x < -c.w * 1.2) { c.x = W + c.w * 1.2; c.y = H * (0.06 + Math.random() * 0.75); }

      ctx.save();
      ctx.globalAlpha = c.alpha * (1 - _bgRed * 0.6);
      ctx.shadowBlur = 18;
      ctx.shadowColor = 'rgba(255,255,255,0.35)';
      const g = ctx.createLinearGradient(0, c.y - c.h, 0, c.y + c.h);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, '#cfe2f7');
      ctx.fillStyle = g;
      ctx.beginPath();
      const E = (x, y, rx, ry) => { ctx.moveTo(x + rx, y); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); };
      E(c.x, c.y, c.w * 0.40, c.h);
      E(c.x - c.w * 0.30, c.y + c.h * 0.25, c.w * 0.28, c.h * 0.75);
      E(c.x + c.w * 0.30, c.y + c.h * 0.25, c.w * 0.30, c.h * 0.78);
      E(c.x + c.w * 0.05, c.y - c.h * 0.55, c.w * 0.24, c.h * 0.7);
      ctx.fill();
      ctx.restore();
    }
  }

  /* Garis kecepatan: makin cepat saat multiplier naik → kesan pesawat tidak pernah berhenti */
  function _drawSpeedLines(ctx, W, H) {
    if (_phase !== 'flying' && _phase !== 'done') return;
    const a = Math.min(0.5, (_speed - 2) * 0.06);
    if (a <= 0.02) return;
    ctx.save();
    ctx.strokeStyle = `rgba(255,255,255,${a})`;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    for (const s of _streaks) {
      s.x -= _speed * s.f * 2.2 * _k;
      if (s.x < -s.l) { s.x = W + Math.random() * 40; s.y = Math.random() * H * 0.85; }
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x + s.l * Math.min(2, _speed * 0.25), s.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* Matahari + bukit jauh (parallax) */
  function _drawScenery(ctx, W, H) {
    const vis = 1 - _bgRed;
    /* matahari */
    const sg = ctx.createRadialGradient(W * 0.86, H * 0.16, 2, W * 0.86, H * 0.16, H * 0.34);
    sg.addColorStop(0, `rgba(255,248,200,${0.95 * vis})`);
    sg.addColorStop(0.18, `rgba(255,230,140,${0.55 * vis})`);
    sg.addColorStop(1, 'rgba(255,220,120,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, W, H);

    /* bukit — hanya terlihat dekat landasan, memudar saat tinggi */
    let ha = _phase === 'ready' ? 1 : (_phase === 'flying' ? Math.max(0, 1 - _flyT * 0.7) : 0.6);
    if (ha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = ha * 0.85;
    for (const h of _hills) {
      h.x -= _speed * 0.25 * _k;
      if (h.x < -h.w) h.x += W * 1.6;
      ctx.beginPath();
      ctx.moveTo(h.x, H * 0.88);
      ctx.quadraticCurveTo(h.x + h.w / 2, H * 0.88 - h.h * 2, h.x + h.w, H * 0.88);
      ctx.closePath();
      ctx.fillStyle = 'rgba(30,90,80,0.9)';
      ctx.fill();
    }
    ctx.restore();
  }

  /* ─────────────────────────────────
     STARS (muncul saat crash)
  ───────────────────────────────── */
  function _drawStars(ctx, W, H) {
    _stars.forEach(s => {
      s.t += s.spd;
      const a = (_bgRed * 0.8) * (0.4 + Math.sin(s.t) * 0.4);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fill();
    });
  }

  /* ─────────────────────────────────
     MULTIPLIER BADGE (tengah-atas)
  ───────────────────────────────── */
  function _drawMultiplierBadge(ctx, W, H) {
    const cx = W * 0.5, cy = H * 0.18;
    const progress = Math.min(1, _flyT / 1.5);

    /* Warna sesuai multiplier */
    let col;

if (_multiplier < 2) {

  /* Hijau */
  col = {
    bg: 'rgba(40,220,120,0.18)',
    border: 'rgba(60,255,140,0.75)',
    text: '#4cffaa'
  };

} else if (_multiplier < 3) {

  /* Biru */
  col = {
    bg: 'rgba(50,140,255,0.20)',
    border: 'rgba(80,180,255,0.75)',
    text: '#7ec8ff'
  };

} else if (_multiplier < 5) {

  /* Orange */
  col = {
    bg: 'rgba(255,140,0,0.22)',
    border: 'rgba(255,170,40,0.80)',
    text: '#ffb84d'
  };

} else if (_multiplier < 10) {

  /* Merah */
  col = {
    bg: 'rgba(255,70,70,0.22)',
    border: 'rgba(255,90,90,0.85)',
    text: '#ff7070'
  };

} else if (_multiplier < 20) {

  /* Ungu */
  col = {
    bg: 'rgba(170,80,255,0.22)',
    border: 'rgba(190,120,255,0.85)',
    text: '#d7a5ff'
  };

} else {

  /* Legendary Gold */
  col = {
    bg: 'rgba(255,210,50,0.25)',
    border: 'rgba(255,230,120,0.95)',
    text: '#ffe066'
  };

}

    ctx.save();
    ctx.globalAlpha = progress;
    
    

    /* Badge pill */
    const bw = 128, bh = 50;
    const bx = cx - bw/2, by = cy - bh/2;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, bh/2);
    ctx.fillStyle = col.bg;
    ctx.fill();
    ctx.strokeStyle = col.border;
    ctx.lineWidth = 1.5;
    ctx.stroke();

ctx.font = `900 32px Syne, sans-serif`;
ctx.fillStyle = '#ffffff';

ctx.textAlign = 'center';
ctx.textBaseline = 'middle';

ctx.lineWidth = 4;
ctx.strokeStyle = 'rgba(0,0,0,0.45)';
ctx.strokeText(_multiplier.toFixed(2) + '×', cx, cy);

ctx.shadowBlur =
  18 + Math.min(20, _multiplier * 1.5);

ctx.shadowColor = col.border;
ctx.fillText(_dispMult.toFixed(2) + '×', cx, cy);

    ctx.restore();
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
  }

  /* ─────────────────────────────────
     TRAIL asap putih
  ───────────────────────────────── */
  function _drawTrail(ctx) {
    ctx.save();
    for (let i = 1; i < _trail.length; i++) {
      const t   = i / _trail.length;
      const alpha = t * 0.35;
      const r   = 3 + t * 4;
      ctx.beginPath();
      ctx.arc(_trail[i].x, _trail[i].y, r, 0, Math.PI*2);
      ctx.fillStyle = `rgba(220,220,220,${alpha})`;
      ctx.fill();
    }
    /* Garis putus-putus tipis */
    ctx.setLineDash([6, 8]);
    ctx.lineDashOffset = -(_shineT * 10 % 14);
    ctx.beginPath();
    ctx.moveTo(_trail[0].x, _trail[0].y);
    for (let i = 1; i < _trail.length - 1; i++) {
      const mx = (_trail[i].x + _trail[i+1].x) / 2;
      const my = (_trail[i].y + _trail[i+1].y) / 2;
      ctx.quadraticCurveTo(_trail[i].x, _trail[i].y, mx, my);
    }
    const last = _trail[_trail.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  /* ─────────────────────────────────
     UPDATE POSISI PESAWAT
  ───────────────────────────────── */
  function _updatePos(W, H) {
    if (_phase === 'ready') {
      /* Diam di kiri-bawah, sedikit goyang */
      _ax   = W * 0.08;
      _ay   = H * 0.80;
      _tilt = Math.sin(_floatT * 0.4) * 0.03;

    } else if (_phase === 'flying') {
      const risePhase = Math.min(1, _flyT / 1.5);
      const riseE     = 1 - Math.pow(1 - risePhase, 3);

      const startX = W * 0.08;
      const startY = H * 0.80;
      const midX   = W * 0.45;
      const midY   = H * (0.44 - Math.min(0.12, (_multiplier - 1) * 0.012));

      /* Float setelah sampai di tengah */
      const floatY = risePhase >= 1 ? Math.sin(_flyT * 1.1) * 7   : 0;
      const floatX = risePhase >= 1 ? Math.cos(_flyT * 0.7) * 5   : 0;

      _tx = startX + riseE * (midX - startX) + floatX;
      _ty = startY + riseE * (midY - startY) + floatY;

      /* Tilt: naik → hidung ke atas, hover → sedikit goyang */
      const riseAngle  = -0.38 * (1 - riseE);
      const floatAngle = risePhase >= 1 ? Math.sin(_floatT * 1.2) * 0.05 : 0;
      _tilt = riseAngle + floatAngle;

      _ax += (_tx - _ax) * _ease(0.07);
      _ay += (_ty - _ay) * _ease(0.07);
      /* jejak asap ikut tergeser ke kiri → pesawat terlihat terus melaju */
      for (const t of _trail) t.x -= _speed * 1.6 * _k;
      _trail.push({ x: _ax - 30, y: _ay });
      if (_trail.length > TRAIL_MAX || (_trail[0] && _trail[0].x < -10)) _trail.shift();

} else if (_phase === 'crashed') {

  const t = Math.min(1, _exitT * 0.18);

  /* 0 - 30% : kehilangan kontrol */
  const panicPhase = Math.min(1, t / 0.30);

  /* 30 - 100% : nosedive */
  const divePhase =
    t <= 0.30
      ? 0
      : (t - 0.30) / 0.70;

  const diveEase =
    1 - Math.pow(1 - divePhase, 3);

  /* Drift dulu sebelum jatuh */
  _tx =
    _crashStartX +
    panicPhase * 30 +
    diveEase * (_cv._lw * 0.60);

  /* Awalnya hampir datar lalu drop */
  _ty =
    _crashStartY +
    diveEase * diveEase * (_cv._lh * 0.75);

  /* Oleng keras */
  const panicShake =
    Math.sin(_crashT * 18) *
    0.65 *
    (1 - divePhase);

  /* Nosedive bertahap */
  const diveSpin =
    diveEase * 4.8;

  _tilt = panicShake + diveSpin;

  /* Berat */
  _ax += (_tx - _ax) * _ease(0.025);
  _ay += (_ty - _ay) * _ease(0.025);

  /* Api makin brutal */
  if (Math.random() < 0.95) {
    _spawnFire();
  }
    } else if (_phase === 'done') {
      /* Landing mulus ke kanan-bawah */
      const exitE = Math.min(1, _exitT * 0.55);
      const ease  = 1 - Math.pow(1 - exitE, 2);
      const startX = _ax;
      _tx = _cv._lw * 0.88;
      _ty = _cv._lh * 0.78;
      _tilt = -ease * 0.18;   /* hidung sedikit turun */

      _ax += (_tx - _ax) * _ease(0.035);
      _ay += (_ty - _ay) * _ease(0.035);
    }
  }

  /* ─────────────────────────────────
     FIRE PARTICLES (crash)
  ───────────────────────────────── */
  function _spawnFire() {
    for (let i = 0; i < 3; i++) {
      _fireParticles.push({
        x  : _ax + (Math.random() - 0.5) * 20,
        y  : _ay + (Math.random() - 0.5) * 14,
        vx : (Math.random() - 0.5) * 3,
        vy : -1.5 - Math.random() * 3,
        life: 1,
        r  : 4 + Math.random() * 8,
        type: Math.random() < 0.5 ? 'fire' : 'smoke',
      });
    }
  }

  function _updateFireParticles() {
    _fireParticles = _fireParticles.filter(p => p.life > 0);
    _fireParticles.forEach(p => {
      p.x  += p.vx;
      p.y  += p.vy;
      p.vy *= 0.97;
      p.r  *= 1.025;
      p.life -= p.type === 'fire' ? 0.045 : 0.030;
    });
  }

  function _drawFireParticles(ctx) {
    _fireParticles.forEach(p => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      if (p.type === 'fire') {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0,   'rgba(255,255,200,1)');
        g.addColorStop(0.35,'rgba(255,120,0,0.9)');
        g.addColorStop(1,   'rgba(200,0,0,0)');
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
        ctx.fillStyle = g; ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
        ctx.fillStyle = `rgba(80,80,80,${p.life * 0.5})`;
        ctx.fill();
      }
      ctx.restore();
    });
  }

  /* ─────────────────────────────────
     CRASH OVERLAY
  ───────────────────────────────── */
function _drawCrashOverlay(ctx, W, H) {

  const vg = ctx.createRadialGradient(
    W / 2,
    H / 2,
    H * 0.1,
    W / 2,
    H / 2,
    H
  );

  vg.addColorStop(0, 'rgba(180,0,0,0)');
  vg.addColorStop(
    1,
    `rgba(160,0,0,${
      Math.min(0.55, _crashT * 0.4)
    })`
  );

  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  /* FLASH PUTIH */
  if (_crashT < 0.15) {

    const flashAlpha =
      (0.15 - _crashT) / 0.15;

    ctx.fillStyle =
      `rgba(255,255,255,${
        flashAlpha * 0.9
      })`;

    ctx.fillRect(0, 0, W, H);
  }

  /* GELAP SESAAT SETELAH FLASH */
  if (_crashT > 0.15 && _crashT < 0.35) {

    const dark =
      (_crashT - 0.15) / 0.20;

    ctx.fillStyle =
      `rgba(0,0,0,${
        dark * 0.35
      })`;

    ctx.fillRect(0, 0, W, H);
  }
}

  /* ─────────────────────────────────
     CRASH TEXT
  ───────────────────────────────── */
  function _drawCrashText(ctx, W, H) {
    const alpha = Math.min(1, _crashT * 1.8);
    if (alpha < 0.05) return;
    ctx.save();
    ctx.globalAlpha  = alpha;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    ctx.font      = `bold 20px Syne, sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur  = 12;
    ctx.shadowColor = 'rgba(255,80,0,0.9)';
    ctx.fillText('PESAWAT JATUH!', W * 0.5, H * 0.22);

    ctx.font      = `bold 34px Syne, sans-serif`;
    ctx.fillStyle = '#ff4444';
    ctx.shadowColor = 'rgba(255,0,0,0.8)';
    ctx.shadowBlur  = 22;
    ctx.fillText(_multiplier.toFixed(2) + '×', W * 0.5, H * 0.34);

    ctx.restore();
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
  }

  /* ─────────────────────────────────
     DONE TEXT (cashout)
  ───────────────────────────────── */
  function _drawDoneText(ctx, W, H) {
    const alpha = Math.min(1, _exitT * 1.5);
    if (alpha < 0.05) return;
    ctx.save();
    ctx.globalAlpha  = alpha;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = `900 20px Syne, sans-serif`;
ctx.fillStyle = '#4cffaa';

ctx.lineWidth = 3;
ctx.strokeStyle = 'rgba(0,0,0,0.45)';
ctx.strokeText('BERHASIL DIAMBIL ✓', W * 0.5, H * 0.22);

ctx.shadowBlur = 8;
ctx.shadowColor = 'rgba(60,220,140,0.8)';
ctx.fillText('BERHASIL DIAMBIL ✓', W * 0.5, H * 0.22);

    ctx.font = `900 42px Syne, sans-serif`;
ctx.fillStyle = '#f5d020';

ctx.lineWidth = 6;
ctx.strokeStyle = 'rgba(0,0,0,0.55)';
ctx.strokeText(_multiplier.toFixed(2) + '×', W * 0.5, H * 0.34);

ctx.shadowBlur = 10;
ctx.shadowColor = '#f5d020';
ctx.fillText(_multiplier.toFixed(2) + '×', W * 0.5, H * 0.34);

    ctx.restore();
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
  }

  /* ═══════════════════════════════════════════
     GAMBAR PESAWAT
     Koordinat relatif ke titik pusat (_ax, _ay)
     Pesawat menghadap kanan →
  ═══════════════════════════════════════════ */
  function _drawPlane(ctx, W, H) {
    ctx.save();
    ctx.translate(_ax, _ay);
    ctx.rotate(_tilt);

    /* Skala sedikit lebih besar saat hover */
    const sc = _phase === 'flying' && _flyT > 1.5 ? 1.05 + Math.sin(_floatT*1.3)*0.02 : 1.0;
    ctx.scale(sc, sc);

    if (_phase === 'crashed') {
      /* Saat jatuh: pesawat sedikit lebih kecil, efek jelek */
      ctx.scale(0.9, 0.9);
    }

    _drawPlaneBody(ctx);

    ctx.restore();
  }

  function _drawPlaneBody(ctx) {
    /* ── Ekor ── */
    /* Sirip vertikal */
    ctx.fillStyle = '#cc2200';
    ctx.beginPath();
    ctx.moveTo(-36, -4);
    ctx.lineTo(-24, -22);
    ctx.lineTo(-16, -8);
    ctx.closePath(); ctx.fill();

    /* Sirip horizontal kecil kiri */
    ctx.fillStyle = '#dd3311';
    ctx.beginPath();
    ctx.moveTo(-34, 4);
    ctx.lineTo(-22, -2);
    ctx.lineTo(-20, 6);
    ctx.lineTo(-34, 8);
    ctx.closePath(); ctx.fill();

    /* ── Badan utama (fuselage) ── */
    const bodyG = ctx.createLinearGradient(-38, -10, 0, 14);
    bodyG.addColorStop(0,   '#e8e8ee');
    bodyG.addColorStop(0.4, '#f4f4f8');
    bodyG.addColorStop(1,   '#b0b0bc');
    ctx.fillStyle = bodyG;
    ctx.beginPath();
    ctx.moveTo(-38, 6);                   /* ekor bawah */
    ctx.lineTo(-34, -4);                  /* ekor atas */
    ctx.quadraticCurveTo(0, -12, 32, -4);/* atas badan melengkung */
    ctx.quadraticCurveTo(44, -1, 50, 4); /* hidung */
    ctx.quadraticCurveTo(44, 9, 30, 10); /* bawah hidung */
    ctx.quadraticCurveTo(0, 13, -38, 6); /* balik ke ekor */
    ctx.fill();

    /* Garis tengah badan */
    ctx.strokeStyle = 'rgba(100,100,120,0.3)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(-32, 1); ctx.quadraticCurveTo(10, -2, 44, 2);
    ctx.stroke();

    /* ── Jendela kabin ── */
    const winColors = ['#88ccff','#aaddff','#77bbff','#99ccff','#88bbff'];
    [-18, -8, 2, 12, 22].forEach((wx, i) => {
      /* Window frame */
      ctx.fillStyle = 'rgba(60,60,80,0.25)';
      ctx.beginPath(); ctx.roundRect(wx - 1, -8, 9, 8, 3); ctx.fill();
      /* Window glass */
      const wg = ctx.createLinearGradient(wx, -8, wx, -1);
      wg.addColorStop(0, '#c8eeff'); wg.addColorStop(1, winColors[i]);
      ctx.fillStyle = wg;
      ctx.beginPath(); ctx.roundRect(wx, -7, 7, 6, 2.5); ctx.fill();
      /* Refleksi kecil */
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath(); ctx.roundRect(wx+1, -6.5, 2.5, 2, 1); ctx.fill();
    });

    /* ── Cockpit / hidung ── */
    const cockG = ctx.createLinearGradient(32, -4, 50, 4);
    cockG.addColorStop(0, '#77aadd');
    cockG.addColorStop(0.5, '#99ccff');
    cockG.addColorStop(1, '#4488bb');
    ctx.fillStyle = cockG;
    ctx.beginPath();
    ctx.moveTo(32, -4);
    ctx.quadraticCurveTo(44, -1, 50, 4);
    ctx.quadraticCurveTo(44, 9, 30, 10);
    ctx.quadraticCurveTo(38, 4, 32, -4);
    ctx.fill();
    /* Kilauan cockpit */
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath(); ctx.ellipse(38, -1, 5, 3, -0.3, 0, Math.PI*2); ctx.fill();

    /* ── Sayap utama (tengah badan, menjulur ke bawah/depan) ── */
    const wingG = ctx.createLinearGradient(-4, 0, 12, 40);
    wingG.addColorStop(0, '#d8d8e4');
    wingG.addColorStop(1, '#a0a0b4');
    ctx.fillStyle = wingG;
    ctx.beginPath();
    ctx.moveTo(-4, 6);
    ctx.lineTo(12, 8);
    ctx.lineTo(22, 40);
    ctx.lineTo(-2, 36);
    ctx.closePath(); ctx.fill();
    /* Garis sayap */
    ctx.strokeStyle = 'rgba(80,80,100,0.3)';
    ctx.lineWidth   = 0.8;
    ctx.beginPath(); ctx.moveTo(8, 9); ctx.lineTo(14, 36); ctx.stroke();

    /* Winglet kecil di ujung sayap */
    ctx.fillStyle = '#cc2200';
    ctx.beginPath();
    ctx.moveTo(20, 38); ctx.lineTo(26, 32); ctx.lineTo(24, 42);
    ctx.closePath(); ctx.fill();

    /* Sayap kiri (belakang layar → atas = negatif Y) */
    ctx.fillStyle = '#c8c8d8';
    ctx.beginPath();
    ctx.moveTo(-4, 4);
    ctx.lineTo(8, 2);
    ctx.lineTo(16, -28);
    ctx.lineTo(0, -24);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(14, -26); ctx.lineTo(20, -20); ctx.lineTo(16, -28);
    ctx.closePath();
    ctx.fillStyle = '#cc2200'; ctx.fill();

    /* ── Mesin (di bawah sayap) ── */
_drawEngine(ctx, 4, 22);
_drawEngine(ctx, -10, -18);

    /* ── Stripe dekorasi merah ── */
    ctx.strokeStyle = '#cc2200';
    ctx.lineWidth   = 2.5;
    ctx.beginPath();
    ctx.moveTo(-30, 2);
    ctx.quadraticCurveTo(0, -2, 28, 2);
    ctx.stroke();
    ctx.lineWidth   = 1.5;
    ctx.strokeStyle = '#ff6644';
    ctx.beginPath();
    ctx.moveTo(-28, 4.5);
    ctx.quadraticCurveTo(0, 0.5, 26, 4.5);
    ctx.stroke();

    /* ── Roda (hanya saat ready) ── */
    if (_phase === 'ready' || (_phase === 'flying' && _flyT < 0.5)) {
      const gearAlpha = _phase === 'ready' ? 1 : Math.max(0, 1 - _flyT * 2);
      ctx.save();
      ctx.globalAlpha = gearAlpha;
      /* Batang roda */
      ctx.strokeStyle = '#888899'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(8, 10); ctx.lineTo(8, 20); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-10, 8); ctx.lineTo(-10, 18); ctx.stroke();
      /* Roda */
      ctx.fillStyle = '#333';
      ctx.beginPath(); ctx.ellipse(8, 22, 5, 4, 0, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-10, 20, 5, 4, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#555';
      ctx.beginPath(); ctx.arc(8, 22, 2, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(-10, 20, 2, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }
  }

  function _drawEngine(ctx, ox, oy) {
    /* Cowling mesin */
    const eg = ctx.createLinearGradient(ox - 6, oy, ox + 6, oy + 12);
    eg.addColorStop(0, '#aaaabc');
    eg.addColorStop(1, '#666678');
    ctx.fillStyle = eg;
    ctx.beginPath(); ctx.roundRect(ox - 6, oy, 14, 10, 4); ctx.fill();

    /* Inlet mesin (depan, ujung kanan pesawat) */
    ctx.fillStyle = '#333344';
    ctx.beginPath(); ctx.ellipse(ox + 8, oy + 5, 3.5, 4.5, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.ellipse(ox + 8, oy + 5, 2, 3.2, 0, 0, Math.PI*2); ctx.fill();

    /* Exhaust / api mesin (kiri) */
    const fl = 8 + Math.sin(_engineT) * 4;
    const fg = ctx.createLinearGradient(ox - 6, oy+5, ox - 6 - fl, oy+5);
    fg.addColorStop(0,   'rgba(255,240,80,0.9)');
    fg.addColorStop(0.4, 'rgba(255,100,0,0.7)');
    fg.addColorStop(1,   'rgba(255,50,0,0)');
    ctx.beginPath();
    ctx.moveTo(ox - 5, oy + 2);
    ctx.lineTo(ox - 5 - fl, oy + 5 + Math.sin(_engineT) * 2);
    ctx.lineTo(ox - 5, oy + 8);
    ctx.fillStyle = fg; ctx.fill();

    /* Inner flame putih */
    const fg2 = ctx.createLinearGradient(ox - 6, oy+5, ox - 6 - fl*0.55, oy+5);
    fg2.addColorStop(0, 'rgba(255,255,255,0.9)');
    fg2.addColorStop(1, 'rgba(255,200,0,0)');
    ctx.beginPath();
    ctx.moveTo(ox - 5, oy + 3.5);
    ctx.lineTo(ox - 5 - fl*0.55, oy + 5);
    ctx.lineTo(ox - 5, oy + 6.5);
    ctx.fillStyle = fg2; ctx.fill();

    /* Glow mesin saat crashed — api lebih besar */
    if (_phase === 'crashed') {
      const bigFl = 18 + Math.sin(_engineT * 1.5) * 10;
      const bgFire = ctx.createRadialGradient(ox - 8, oy+5, 0, ox - 8, oy+5, bigFl);
      bgFire.addColorStop(0,   'rgba(255,220,60,0.85)');
      bgFire.addColorStop(0.4, 'rgba(255,80,0,0.6)');
      bgFire.addColorStop(1,   'rgba(200,0,0,0)');
      ctx.beginPath(); ctx.arc(ox - 8, oy+5, bigFl, 0, Math.PI*2);
      ctx.fillStyle = bgFire; ctx.fill();
    }
  }

  /* ════════════════════════════════
     EXPOSE
  ════════════════════════════════ */
  return { init, _start, _cashout, _cashHalf };
})();
