/* ══════════════════════════════════════
   GAME: WHEEL OF FORTUNE — Spinning Multiplier Wheel
   Expose: Wheel.init(gacha, onResult)

   Mekanisme predetermined result (sama pola dengan roulette/plinko):
   - _gacha.result dari app.js cuma nentuin KATEGORI:
       'win'  -> wheel dipaksa berhenti di segment dengan mult >= 1×
       'lose' -> wheel dipaksa berhenti di segment dengan mult < 1× (bangkrut)
     Segment PERSIS mana yang kena tetap diacak di antara kandidat
     kategori tsb, jadi hasil tetap kerasa random ke user.
   - Tidak ada pilihan bet/warna — sama seperti plinko/mines, user cuma
     pasang bet di modal lalu langsung SPIN.

   8 SEGMENT : 0×, 1×, 1.5×, 0×, 2×, 0.5×, 3×, 5×(jackpot)
══════════════════════════════════════ */
const Wheel = (() => {

  /* ── Segments ── */
  const SEGMENTS = [
    { mult: 0,   label: 'BANGKRUT', color: '#1c1c1c', light: '#333333' },
    { mult: 1,   label: '1×',       color: '#5a3a8a', light: '#7c52b8' },
    { mult: 1.5, label: '1.5×',     color: '#1f6f4a', light: '#2ecc71' },
    { mult: 0,   label: 'BANGKRUT', color: '#1c1c1c', light: '#333333' },
    { mult: 2,   label: '2×',       color: '#1f6f4a', light: '#2ecc71' },
    { mult: 0.5, label: '0.5×',     color: '#7a4a1c', light: '#c0792b' },
    { mult: 3,   label: '3×',       color: '#1f6f4a', light: '#2ecc71' },
    { mult: 5,   label: '5× 👑',    color: '#a8841a', light: '#f0d080' },
  ];
  const N        = SEGMENTS.length;
  const SEG_ANG  = (Math.PI * 2) / N;
  const MAX_MULT = 5; // HARUS sama dengan MAX_GAME_MULTIPLIER.wheel di app.js & gacha-update.js

  /* ── Palette ── */
  const C = {
    gold:      '#d4af5a', goldLight:  '#f0d080', goldDim: '#8a7040',
    rim:       '#1e1608', rimLight:   '#3a2e10',
  };

  /* ── State ── */
  let _gacha    = null;
  let _onResult = null;
  let _bet      = 0;
  let _spinning = false;
  let _done     = false;
  let _raf      = null;

  /* ── Canvas ── */
  let canvas, ctx, CX, CY, R;

  /* ── HTML ── */
  function render() {
    const area = document.createElement('div');
    area.id        = 'gameArea';
    area.className = 'game-area slide-in';
    area.innerHTML = `
      <div class="wheel-card" id="wheelCard">
        <div class="slot-section-label">🎯 Wheel of Fortune</div>
        <div class="wheel-canvas-wrap">
          <div class="wheel-pointer"></div>
          <canvas id="wheelCanvas"></canvas>
        </div>
        <div class="wheel-result-hud" id="wheelResultHud">Putar untuk mulai</div>
        <button class="spin-game-btn" id="wheelSpinBtn" onclick="Wheel.spin()">
          🎯 &nbsp;SPIN
        </button>
      </div>
    `;

    const infoCard  = document.getElementById('gachaInfoCard');
    const existGame = document.getElementById('gameArea');
    if (infoCard)       infoCard.replaceWith(area);
    else if (existGame) existGame.replaceWith(area);
    else document.querySelector('.glass-card').insertAdjacentElement('afterend', area);
  }

  /* ══════════════════════════════════════
     CANVAS SETUP
  ══════════════════════════════════════ */
  function initCanvas() {
    canvas = document.getElementById('wheelCanvas');
    const wrap = canvas.parentElement;
    const size = Math.min(wrap.clientWidth, 320);
    canvas.width  = size;
    canvas.height = size;
    ctx = canvas.getContext('2d');
    CX = size / 2;
    CY = size / 2;
    R  = size / 2 - 8;
  }

  /* ══════════════════════════════════════
     DRAW WHEEL pada rotasi tertentu (radian)
     Pointer FIXED di luar canvas (12 o'clock), jadi segment yang kena
     adalah yang midAng-nya + rotation ≈ -π/2 (atas).
  ══════════════════════════════════════ */
  function drawWheel(rotation) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    /* ── Rim luar ── */
    ctx.beginPath();
    ctx.arc(CX, CY, R, 0, Math.PI * 2);
    const rimGrad = ctx.createLinearGradient(CX - R, CY - R, CX + R, CY + R);
    rimGrad.addColorStop(0,   C.rimLight);
    rimGrad.addColorStop(0.5, C.rim);
    rimGrad.addColorStop(1,   '#000');
    ctx.fillStyle = rimGrad;
    ctx.fill();

    ctx.save();
    ctx.translate(CX, CY);
    ctx.rotate(rotation);

    const segR = R * 0.92;
    for (let i = 0; i < N; i++) {
      const ang0 = i * SEG_ANG - Math.PI / 2 - SEG_ANG / 2;
      const ang1 = ang0 + SEG_ANG;
      const seg  = SEGMENTS[i];

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, segR, ang0, ang1);
      ctx.closePath();
      const grad = ctx.createRadialGradient(0, 0, segR * 0.15, 0, 0, segR);
      grad.addColorStop(0, seg.light);
      grad.addColorStop(1, seg.color);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(212,175,90,0.35)';
      ctx.lineWidth   = 1.2;
      ctx.stroke();

      /* ── Label ── */
      const midAng = ang0 + SEG_ANG / 2;
      ctx.save();
      ctx.rotate(midAng);
      ctx.translate(segR * 0.62, 0);
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle    = '#fff';
      ctx.font         = 'bold 13px Syne, sans-serif';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor  = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur   = 4;
      ctx.fillText(seg.label, 0, 0);
      ctx.restore();
    }
    ctx.restore();

    /* ── Hub tengah ── */
    const hubR = R * 0.13;
    const hg   = ctx.createRadialGradient(CX - 3, CY - 3, 1, CX, CY, hubR);
    hg.addColorStop(0,   C.goldLight);
    hg.addColorStop(0.5, C.gold);
    hg.addColorStop(1,   C.goldDim);
    ctx.beginPath();
    ctx.arc(CX, CY, hubR, 0, Math.PI * 2);
    ctx.fillStyle = hg;
    ctx.fill();
    ctx.strokeStyle = C.rim;
    ctx.lineWidth   = 2;
    ctx.stroke();
  }

  /* ══════════════════════════════════════
     ANIMASI SPIN — easeOut quintic, beberapa putaran penuh CW
  ══════════════════════════════════════ */
  function easeOut5(t) { return 1 - Math.pow(1 - t, 5); }

  async function runSpin(targetIdx) {
    const TOTAL_MS  = 4200;
    const MIN_ROUNDS = 6;

    const midAng = targetIdx * SEG_ANG - Math.PI / 2;
    /* rotation supaya midAng + rotation ≡ -π/2 (mod 2π) */
    let baseRot = (-Math.PI / 2 - midAng) % (Math.PI * 2);
    if (baseRot < 0) baseRot += Math.PI * 2;
    const finalRot = baseRot + MIN_ROUNDS * Math.PI * 2;

    const t0 = performance.now();
    let _lastSegCrossed = null;
    return new Promise(resolve => {
      function frame(now) {
        const elapsed = now - t0;
        const t  = Math.min(elapsed / TOTAL_MS, 1);
        const tE = easeOut5(t);
        const curRot = finalRot * tE;
        const segCrossed = Math.floor(curRot / SEG_ANG);
        if (segCrossed !== _lastSegCrossed) { SFX.wheel.tick(); _lastSegCrossed = segCrossed; }
        drawWheel(curRot);
        if (t >= 1) { resolve(); return; }
        _raf = requestAnimationFrame(frame);
      }
      _raf = requestAnimationFrame(frame);
    });
  }

  /* ══════════════════════════════════════
     PUBLIC API
  ══════════════════════════════════════ */
  function init(gacha, onResult) {
    _gacha    = gacha;
    _onResult = onResult;
    _bet      = gacha.betAmount || 0;
    _spinning = false;
    _done     = false;
    if (_raf) { cancelAnimationFrame(_raf); _raf = null; }

    render();
    requestAnimationFrame(() => {
      initCanvas();
      drawWheel(0);
    });
  }

  async function spin() {
    if (_done || _spinning) return;
    const btn = document.getElementById('wheelSpinBtn');
    if (!btn || btn.disabled) return;

    _spinning = true;
    btn.disabled = true;
    window.setTokenSlotMode('hidden');
    window.setStatus('🎯 Roda berputar...', true);
    SFX.wheel.spinStart();

    const hud = document.getElementById('wheelResultHud');
    if (hud) { hud.textContent = 'Berputar...'; hud.className = 'wheel-result-hud spinning'; }

    const isWin = _gacha.result === 'win';
    const candidates = SEGMENTS
      .map((s, i) => ({ i, mult: s.mult }))
      .filter(s => isWin ? s.mult >= 1 : s.mult < 1);
    const picked    = candidates[Math.floor(Math.random() * candidates.length)];
    const targetIdx = picked.i;
    const seg       = SEGMENTS[targetIdx];

    await runSpin(targetIdx);
    if (_done) return;

    const actualWin = seg.mult >= 1;
    if (hud) {
      hud.textContent = actualWin ? `🏆 ${seg.label}!` : `💀 ${seg.label}`;
      hud.className   = 'wheel-result-hud ' + (actualWin ? 'win' : 'lose');
    }
    window.setStatus(actualWin ? '🏆 MENANG!' : '💀 Kalah...', actualWin);
    actualWin ? SFX.wheel.win() : SFX.wheel.lose();

    await new Promise(r => setTimeout(r, actualWin ? 1200 : 800));
    if (_done) return;
    _done = true;

    const prize = actualWin ? Math.floor(_bet * Math.min(seg.mult, MAX_MULT) * 1000) : 0;
    _onResult(actualWin, prize);
  }

  return { init, spin };
})();
