/* ══════════════════════════════════════
   GAME: WHEEL OF FORTUNE — Roda tegak + lampu + jarum emas
   Expose: Wheel.init(gacha, onResult)

   Visual referensi: mesin arcade Big Bass Wheel
   - Barrel silinder berdiri tegak, lebar, pita kayu berwarna tebal
   - Setiap pita: warna solid bold (biru/kuning/oranye), angka besar
   - Banner hitam di puncak dome: "JACKPOT 5×"
   - Jarum/flapper kuning di sisi kanan, nunjuk ke kiri
   - Glow shimmer di sisi kiri barrel (highlight silinder)
   - 3 pita kelihatan sekaligus (tengah = aktif, atas/bawah = samar)

   Segments (8 pita, mirip Big Bass Wheel):
     BANGKRUT 0× | 1× | BANGKRUT 0× | 3× | 1× | 5× JACKPOT | BANGKRUT 0× | 1×
   Warna authentic arcade: biru gelap, biru terang, kuning, oranye/coklat
══════════════════════════════════════ */
const Wheel = (() => {

  /* ── Pita (bands) — urutan barrel dari atas ke bawah ── */
  const SEGMENTS = [
    { mult: 0,   label: 'BANGKRUT', sub: '0×',         color: '#1a1a1a', light: '#2e2e2e',   textColor: '#888', subColor: '#555' },
    { mult: 1,   label: '1×',       sub: 'WIN',         color: '#1a3a6e', light: '#2a5aaa',   textColor: '#fff', subColor: '#a8c8ff' },
    { mult: 0,   label: 'BANGKRUT', sub: '0×',         color: '#1a1a1a', light: '#2e2e2e',   textColor: '#888', subColor: '#555' },
    { mult: 3,   label: '3×',       sub: 'WIN',         color: '#c47a00', light: '#f5a800',   textColor: '#fff', subColor: '#ffe085' },
    { mult: 1,   label: '1×',       sub: 'WIN',         color: '#1a3a6e', light: '#2a5aaa',   textColor: '#fff', subColor: '#a8c8ff' },
    { mult: 5,   label: '5×',       sub: 'JACKPOT 🏆',  color: '#8a1a00', light: '#d44000',   textColor: '#ffe85c', subColor: '#ffb830' },
    { mult: 0,   label: 'BANGKRUT', sub: '0×',         color: '#1a1a1a', light: '#2e2e2e',   textColor: '#888', subColor: '#555' },
    { mult: 1,   label: '1×',       sub: 'WIN',         color: '#0e5a2e', light: '#1a9a50',   textColor: '#fff', subColor: '#80ffb8' },
  ];
  const N        = SEGMENTS.length;
  const MAX_MULT = 5; // HARUS sama dengan MAX_GAME_MULTIPLIER.wheel di app.js & gacha-update.js

  /* ── Warna chrome ── */
  const C = {
    gold:       '#d4af5a',
    goldLight:  '#f0d080',
    chrome:     '#c0c8d0',
    chromeLight:'#e8eef4',
    chromeDark: '#606870',
    frameDark:  '#080c10',
    rimBlue:    '#1e4a8a',
    rimLight:   '#4a90d0',
  };

  /* ── State ── */
  let _gacha    = null;
  let _onResult = null;
  let _bet      = 0;
  let _spinning = false;
  let _done     = false;
  let _raf      = null;
  let _bandH    = 0;

  /* ── Canvas ── */
  let canvas, ctx, W, H;

  /* ── Warna segmen (roda) ── */
  const SEG_STYLE = {
    bust:    { a: '#7a1a0c', b: '#3d0c05', text: '#ff9a7a', stroke: '#2a0803' },
    win1:    { a: '#ffd24a', b: '#e9a315', text: '#7a4a00', stroke: '#b97a0a' },
    win3:    { a: '#ffae2b', b: '#e06a12', text: '#6a2a00', stroke: '#a9460a' },
    jackpot: { a: '#ff5a2a', b: '#b8200a', text: '#ffe9c0', stroke: '#ffffff' },
  };
  function styleOf(seg) {
    if (seg.mult === 0) return SEG_STYLE.bust;
    if (seg.mult >= 5)  return SEG_STYLE.jackpot;
    if (seg.mult >= 3)  return SEG_STYLE.win3;
    return SEG_STYLE.win1;
  }

  /* ── HTML: roda tegak (fortune wheel) dengan lampu & jarum emas ── */
  function render() {
    const area = document.createElement('div');
    area.id        = 'gameArea';
    area.className = 'game-area slide-in';
    area.innerHTML = `
      <div class="wheel-card" id="wheelCard">
        <div class="slot-section-label">🎯 Wheel of Fortune</div>
        <div class="wf-stage wb-machine-wrap" id="wfStage">
          <div class="wf-title">FORTUNE<small>wheel</small></div>
          <div class="wf-canvas-box"><canvas id="wheelCanvas"></canvas></div>
        </div>
        <div class="wheel-result-hud" id="wheelResultHud">Tekan SPIN untuk mulai</div>
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

    _injectCSS();
  }

  function _injectCSS() {
    if (document.getElementById('wf-injected-css')) return;
    const style = document.createElement('style');
    style.id = 'wf-injected-css';
    style.textContent = `
      .wf-stage {
        position: relative;
        width: 100%;
        max-width: 340px;
        margin: 4px auto 18px;
        padding: 18px 0 0;
        border-radius: 22px;
        overflow: hidden;
        background:
          radial-gradient(ellipse 70% 55% at 50% 100%, rgba(40,150,210,0.55) 0%, transparent 70%),
          linear-gradient(180deg, #06324a 0%, #0a5a7c 60%, #0b4560 100%);
        border: 1px solid rgba(120,200,240,0.25);
        box-shadow: 0 14px 40px rgba(0,0,0,0.55), inset 0 0 40px rgba(0,0,0,0.35);
      }
      /* sorot cahaya diagonal seperti referensi */
      .wf-stage::before {
        content: '';
        position: absolute; inset: 0;
        background:
          linear-gradient(115deg, transparent 38%, rgba(255,255,255,0.05) 46%, transparent 54%),
          linear-gradient(65deg,  transparent 38%, rgba(255,255,255,0.05) 46%, transparent 54%);
        pointer-events: none;
      }
      .wf-title {
        text-align: center;
        font-family: 'Syne', sans-serif;
        font-weight: 900;
        font-size: 40px;
        letter-spacing: 1px;
        line-height: 1;
        color: #fff;
        text-shadow: 0 3px 10px rgba(0,0,0,0.5);
        margin-bottom: 4px;
      }
      .wf-title small {
        display: block;
        font-size: 26px;
        font-weight: 700;
        letter-spacing: 1px;
        color: #2fa9e6;
        text-shadow: none;
        margin-top: 2px;
      }
      .wf-canvas-box { position: relative; width: 100%; aspect-ratio: 1 / 0.82; }
      .wf-canvas-box #wheelCanvas { width: 100%; height: 100%; display: block; filter: none; }
      .wf-stage.is-spinning { box-shadow: 0 14px 40px rgba(0,0,0,0.55), 0 0 36px rgba(255,200,80,0.35), inset 0 0 40px rgba(0,0,0,0.35); }
    `;
    document.head.appendChild(style);
  }

  /* ══════════════════════════════════════
     CANVAS SETUP
  ══════════════════════════════════════ */
  let _rot = 0;          // sudut roda (rad)
  let _pointerKick = 0;  // ayunan jarum saat melewati pasak
  let _lastPeg = null;

  function initCanvas() {
    canvas = document.getElementById('wheelCanvas');
    const box = canvas.parentElement;
    W = Math.round(box.clientWidth || 300);
    H = Math.round(W * 0.82);
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width  = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingQuality = 'high';
  }

  /* ══════════════════════════════════════
     DRAW WHEEL
  ══════════════════════════════════════ */
  function drawWheel(rot, now) {
    const TAU = Math.PI * 2;
    const SEG = TAU / N;
    ctx.clearRect(0, 0, W, H);

    /* Roda raksasa — hanya bagian atasnya yang terlihat (seperti referensi) */
    const R  = W * 0.68;
    const CX = W / 2;
    const CY = H * 0.2 + R;
    const rFace = R * 0.88;

    /* ── Sorot cahaya ke atas ── */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let k = -3; k <= 3; k++) {
      const ang = -Math.PI / 2 + k * 0.22;
      const g = ctx.createLinearGradient(CX, CY - R, CX + Math.cos(ang) * W, CY - R + Math.sin(ang) * W);
      g.addColorStop(0, 'rgba(120,210,255,0.16)');
      g.addColorStop(1, 'rgba(120,210,255,0)');
      ctx.beginPath();
      ctx.moveTo(CX - 40, CY - R + 8);
      ctx.lineTo(CX + 40, CY - R + 8);
      ctx.lineTo(CX + Math.cos(ang + 0.07) * W * 1.2, CY - R + Math.sin(ang + 0.07) * W * 1.2);
      ctx.lineTo(CX + Math.cos(ang - 0.07) * W * 1.2, CY - R + Math.sin(ang - 0.07) * W * 1.2);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
    }
    ctx.restore();

    /* ── Bingkai gelap ── */
    const frame = ctx.createRadialGradient(CX, CY, R * 0.85, CX, CY, R);
    frame.addColorStop(0, '#16212c');
    frame.addColorStop(0.75, '#070b10');
    frame.addColorStop(1, '#2a3846');
    ctx.beginPath();
    ctx.arc(CX, CY, R, 0, TAU);
    ctx.fillStyle = frame;
    ctx.fill();
    ctx.strokeStyle = '#3d4f61';
    ctx.lineWidth = 2;
    ctx.stroke();

    /* ── Segmen ── */
    for (let i = 0; i < N; i++) {
      const st  = styleOf(SEGMENTS[i]);
      const mid = i * SEG + rot - Math.PI / 2;
      const g = ctx.createRadialGradient(CX, CY, rFace * 0.3, CX, CY, rFace);
      g.addColorStop(0, st.b);
      g.addColorStop(1, st.a);
      ctx.beginPath();
      ctx.moveTo(CX, CY);
      ctx.arc(CX, CY, rFace, mid - SEG / 2, mid + SEG / 2);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
    }

    /* Garis pemisah gelap */
    for (let i = 0; i < N; i++) {
      const a = i * SEG + rot - Math.PI / 2 - SEG / 2;
      ctx.beginPath();
      ctx.moveTo(CX + Math.cos(a) * rFace * 0.3, CY + Math.sin(a) * rFace * 0.3);
      ctx.lineTo(CX + Math.cos(a) * rFace, CY + Math.sin(a) * rFace);
      ctx.strokeStyle = 'rgba(70,30,0,0.6)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    /* JACKPOT: garis putih tebal bercahaya */
    for (let i = 0; i < N; i++) {
      if (SEGMENTS[i].mult < 5) continue;
      const mid = i * SEG + rot - Math.PI / 2;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(CX + Math.cos(mid) * rFace * 0.34, CY + Math.sin(mid) * rFace * 0.34);
      ctx.arc(CX, CY, rFace * 0.97, mid - SEG / 2 + 0.012, mid + SEG / 2 - 0.012);
      ctx.closePath();
      ctx.shadowColor = 'rgba(255,255,255,0.95)';
      ctx.shadowBlur = 12;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3.5;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.restore();
    }

    /* Label radial besar */
    for (let i = 0; i < N; i++) {
      const seg = SEGMENTS[i];
      const st  = styleOf(seg);
      const mid = i * SEG + rot - Math.PI / 2;
      const label = seg.mult === 0 ? 'BANGKRUT' : seg.mult >= 5 ? 'JACKPOT' : seg.mult + '×';
      ctx.save();
      ctx.translate(CX, CY);
      ctx.rotate(mid);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const fs = seg.mult === 0 ? R * 0.082 : seg.mult >= 5 ? R * 0.105 : R * 0.2;
      ctx.font = `900 ${Math.round(fs)}px Syne, sans-serif`;
      ctx.fillStyle = st.text;
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 2;
      ctx.fillText(label, rFace * 0.84, 0);
      ctx.restore();
    }

    /* Pasak emas di batas segmen */
    for (let i = 0; i < N; i++) {
      const a = i * SEG + rot - Math.PI / 2 - SEG / 2;
      const px = CX + Math.cos(a) * rFace * 0.955, py = CY + Math.sin(a) * rFace * 0.955;
      const pg = ctx.createRadialGradient(px - 1, py - 1, 0.5, px, py, 7);
      pg.addColorStop(0, '#fff6c8'); pg.addColorStop(1, '#c8921a');
      ctx.beginPath();
      ctx.arc(px, py, 5.5, 0, TAU);
      ctx.fillStyle = pg;
      ctx.fill();
    }

    /* Cincin muka roda */
    ctx.beginPath();
    ctx.arc(CX, CY, rFace, 0, TAU);
    ctx.strokeStyle = '#05080c';
    ctx.lineWidth = 4;
    ctx.stroke();

    /* ── Lampu di bingkai ── */
    const bulbs = 44;
    const tPhase = Math.floor((now || 0) / 280);
    for (let i = 0; i < bulbs; i++) {
      const a = (i / bulbs) * TAU - Math.PI / 2 + rot * 0;
      const bx = CX + Math.cos(a) * R * 0.945, by = CY + Math.sin(a) * R * 0.945;
      if (by > H + 20) continue;
      const on = (i + tPhase) % 3 !== 0;
      if (on) {
        const glow = ctx.createRadialGradient(bx, by, 0, bx, by, 17);
        glow.addColorStop(0, 'rgba(255,245,215,0.9)');
        glow.addColorStop(0.4, 'rgba(255,200,170,0.35)');
        glow.addColorStop(1, 'rgba(255,200,140,0)');
        ctx.beginPath();
        ctx.arc(bx, by, 17, 0, TAU);
        ctx.fillStyle = glow;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(bx, by, 4.5, 0, TAU);
      ctx.fillStyle = on ? '#fffaf0' : '#76664a';
      ctx.fill();
    }

    /* ── Jarum emas teardrop di puncak (menunjuk ke bawah) ── */
    ctx.save();
    const tipY = CY - rFace * 0.9;
    const ph = W * 0.12, pw = W * 0.04;
    ctx.translate(CX, tipY - ph);
    ctx.rotate(_pointerKick);
    ctx.beginPath();
    ctx.moveTo(0, ph);
    ctx.bezierCurveTo(pw * 1.25, ph * 0.35, pw * 1.35, -pw * 0.7, 0, -pw * 1.15);
    ctx.bezierCurveTo(-pw * 1.35, -pw * 0.7, -pw * 1.25, ph * 0.35, 0, ph);
    ctx.closePath();
    const pgd = ctx.createLinearGradient(-pw, 0, pw, 0);
    pgd.addColorStop(0, '#f2b83a'); pgd.addColorStop(0.5, '#fff0a8'); pgd.addColorStop(1, '#d9951a');
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = pgd;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#a56d12';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, ph - pw * 0.4, pw * 0.3, 0, TAU);
    ctx.fillStyle = '#fff6c8';
    ctx.fill();
    ctx.restore();
  }

  /* Loop idle: lampu tetap berkedip selagi belum spin */
  function _idleLoop(now) {
    if (_spinning || _done || !canvas || !document.body.contains(canvas)) { _raf = null; return; }
    _pointerKick *= 0.85;
    drawWheel(_rot, now);
    _raf = requestAnimationFrame(_idleLoop);
  }

  /* ══════════════════════════════════════
     ANIMASI SPIN — easeOut quintic, roda berputar searah jarum jam
  ══════════════════════════════════════ */
  function easeOut5(t) { return 1 - Math.pow(1 - t, 5); }

  async function runSpin(targetIdx) {
    const TAU = Math.PI * 2;
    const SEG = TAU / N;
    const TOTAL_MS   = 5000;
    const MIN_ROUNDS = 6;

    /* Segmen target ke bawah jarum (atas): rot ≡ -i*SEG, plus offset acak di dalam segmen */
    const jitter = (Math.random() - 0.5) * SEG * 0.6;
    const startRot = _rot % TAU;
    let finalRot = -targetIdx * SEG + jitter;
    finalRot = finalRot + Math.ceil((startRot - finalRot) / TAU) * TAU + MIN_ROUNDS * TAU;
    const delta = finalRot - startRot;

    const t0 = performance.now();
    _lastPeg = null;

    return new Promise(resolve => {
      function frame(now) {
        const t  = Math.min((now - t0) / TOTAL_MS, 1);
        const cur = startRot + delta * easeOut5(t);
        _rot = cur;

        /* pasak lewat jarum: batas segmen berada di rot = SEG/2 + k*SEG (mod) */
        const peg = Math.floor((cur + SEG / 2) / SEG);
        if (peg !== _lastPeg) {
          if (_lastPeg !== null) { SFX.wheel.tick(); _pointerKick = 0.38; }
          _lastPeg = peg;
        }
        _pointerKick *= 0.86;

        drawWheel(cur, now);
        if (t >= 1) { _rot = finalRot; resolve(); return; }
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

    _rot = 0; _pointerKick = 0;
    render();
    requestAnimationFrame(() => {
      initCanvas();
      drawWheel(_rot, performance.now());
      _raf = requestAnimationFrame(_idleLoop);
    });
  }

  async function spin() {
    if (_done || _spinning) return;
    const btn = document.getElementById('wheelSpinBtn');
    if (!btn || btn.disabled) return;

    _spinning = true;
    if (_raf) { cancelAnimationFrame(_raf); _raf = null; }
    btn.disabled = true;
    window.setTokenSlotMode('hidden');
    window.setStatus('🎯 Roda berputar...', true);
    SFX.wheel.spinStart();

    document.querySelector('.wf-stage')?.classList.add('is-spinning');

    const hud = document.getElementById('wheelResultHud');
    if (hud) { hud.textContent = '🎯 Berputar...'; hud.className = 'wheel-result-hud spinning'; }

    /* Tentukan target pita dari predetermined result */
    const isWin    = _gacha.result === 'win';
    const candidates = SEGMENTS
      .map((s, i) => ({ i, mult: s.mult }))
      .filter(s => isWin ? s.mult >= 1 : s.mult < 1);
    const picked    = candidates[Math.floor(Math.random() * candidates.length)];
    const targetIdx = picked.i;
    const seg       = SEGMENTS[targetIdx];

    await runSpin(targetIdx);
    if (_done) return;

    document.querySelector('.wf-stage')?.classList.remove('is-spinning');

    const actualWin = seg.mult >= 1;
    drawWheel(_rot, performance.now());
    if (hud) {
      hud.textContent = actualWin ? `🏆 ${seg.label} — Menang!` : `💀 ${seg.label}`;
      hud.className   = 'wheel-result-hud ' + (actualWin ? 'win' : 'lose');
    }
    window.setStatus(actualWin ? '🏆 MENANG!' : '💀 Kalah...', actualWin);
    actualWin ? SFX.wheel.win() : SFX.wheel.lose();

    await new Promise(r => setTimeout(r, actualWin ? 1200 : 800));
    if (_done) return;
    _done = true;

    const prize = actualWin ? Math.floor(_bet * Math.min(seg.mult, MAX_MULT) * 1000) : 0;
    /* prize = total yang diterima (termasuk bet kembali).
       onGameResult akan hitung balanceChange = (prize/1000) - bet,
       sama seperti pola airplane/mines. Pastikan kirim isWin=true
       supaya branch yang benar dipakai. */
    _onResult(actualWin, prize);
  }

  return { init, spin };
})();
