/* ══════════════════════════════════════
   GAME: WHEEL OF FORTUNE — Vertical Ticket Barrel
   Expose: Wheel.init(gacha, onResult)

   Tampilan terinspirasi barrel/drum arcade ticket-redemption (bukan
   roda pizza-slice) — pita angka horizontal yang scroll vertikal di
   dalam tabung kaca, jarum/flapper penunjuk diam di sisi kanan tengah.

   Mekanisme predetermined result (sama pola dengan roulette/plinko):
   - _gacha.result dari app.js cuma nentuin KATEGORI:
       'win'  -> barrel dipaksa berhenti di pita dengan mult >= 1×
       'lose' -> barrel dipaksa berhenti di pita dengan mult < 1× (bangkrut)
     Pita PERSIS mana yang kena tetap diacak di antara kandidat
     kategori tsb, jadi hasil tetap kerasa random ke user.
   - Tidak ada pilihan bet/warna — sama seperti plinko/mines, user cuma
     pasang bet di modal lalu langsung SPIN.

   8 PITA : 0×, 1×, 1.5×, 0×, 2×, 0.5×, 3×, 5×(jackpot)
══════════════════════════════════════ */
const Wheel = (() => {

  /* ── Pita (bands) — urutan menentukan susunan vertikal barrel ── */
  const SEGMENTS = [
    { mult: 0,   label: 'BANGKRUT', sub: '0×',   color: '#1c1c1c', light: '#3a3a3a' },
    { mult: 1,   label: '1×',       sub: 'WIN',  color: '#3d2a73', light: '#7c52b8' },
    { mult: 1.5, label: '1.5×',     sub: 'WIN',  color: '#0e5f7a', light: '#2ec0d8' },
    { mult: 0,   label: 'BANGKRUT', sub: '0×',   color: '#1c1c1c', light: '#3a3a3a' },
    { mult: 2,   label: '2×',       sub: 'WIN',  color: '#1f6f4a', light: '#2ecc71' },
    { mult: 0.5, label: '0.5×',     sub: 'WIN',  color: '#7a4a1c', light: '#e08a2b' },
    { mult: 3,   label: '3×',       sub: 'WIN',  color: '#0e5f7a', light: '#2ec0d8' },
    { mult: 5,   label: '5×',       sub: 'JACKPOT 👑', color: '#a8841a', light: '#f0d080' },
  ];
  const N        = SEGMENTS.length;
  const MAX_MULT = 5; // HARUS sama dengan MAX_GAME_MULTIPLIER.wheel di app.js & gacha-update.js

  const C = {
    gold:      '#d4af5a', goldLight:  '#f0d080', goldDim: '#8a7040',
    frame:     '#0e1410', ring:       '#1c8a5e', ringLight: '#3ddb96',
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

  /* ── HTML ── */
  function render() {
    const area = document.createElement('div');
    area.id        = 'gameArea';
    area.className = 'game-area slide-in';
    area.innerHTML = `
      <div class="wheel-card" id="wheelCard">
        <div class="slot-section-label">🎯 Wheel of Fortune</div>
        <div class="wheel-canvas-wrap">
          <canvas id="wheelCanvas"></canvas>
          <div class="wheel-pointer"></div>
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
     CANVAS SETUP — barrel berdiri (tinggi > lebar)
  ══════════════════════════════════════ */
  function initCanvas() {
    canvas = document.getElementById('wheelCanvas');
    const wrap = canvas.parentElement;
    const w = Math.min(wrap.clientWidth, 280);
    W = w;
    H = Math.round(w * 1.25);
    canvas.width  = W;
    canvas.height = H;
    ctx = canvas.getContext('2d');
    _bandH = H / 3.1; // ~3 pita kelihatan penuh dalam viewport tiap saat
  }

  /* Bentuk capsule/barrel: dome di atas & bawah, sisi lurus */
  function _barrelPath(x, y, w, h) {
    const r = w / 2;
    ctx.beginPath();
    ctx.moveTo(x, y + r);
    ctx.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
    ctx.lineTo(x + w - r, y);
    ctx.arc(x + w - r, y + r, r, Math.PI * 1.5, 0);
    ctx.lineTo(x + w, y + h - r);
    ctx.arc(x + w - r, y + h - r, r, 0, Math.PI * 0.5);
    ctx.lineTo(x + r, y + h);
    ctx.arc(x + r, y + h - r, r, Math.PI * 0.5, Math.PI);
    ctx.closePath();
  }

  /* ══════════════════════════════════════
     DRAW BARREL pada scrollY tertentu (px)
     Pointer FIXED di luar canvas (kanan-tengah), jadi pita yang kena
     adalah yang center-nya pas di H/2 saat berhenti.
  ══════════════════════════════════════ */
  function drawBarrel(scrollY, tickFlash) {
    ctx.clearRect(0, 0, W, H);
    const pad = 3;
    const bw = W - pad * 2, bh = H - pad * 2;

    ctx.save();
    _barrelPath(pad, pad, bw, bh);
    ctx.clip();

    /* ── BG dasar ── */
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, W, H);

    /* ── Pita-pita yang scroll (infinite loop via modulo virtual index) ── */
    const bandH = _bandH;
    const cycle = N * bandH;
    const minVI = Math.floor((-bandH + scrollY) / bandH) - 1;
    const maxVI = Math.ceil((H + bandH + scrollY) / bandH) + 1;
    for (let vi = minVI; vi <= maxVI; vi++) {
      const y = vi * bandH - scrollY;
      if (y > H + bandH || y < -bandH * 2) continue;
      const idx = ((vi % N) + N) % N;
      const seg = SEGMENTS[idx];

      const grad = ctx.createLinearGradient(0, y, 0, y + bandH);
      grad.addColorStop(0,   seg.light);
      grad.addColorStop(0.5, seg.color);
      grad.addColorStop(1,   seg.color);
      ctx.fillStyle = grad;
      ctx.fillRect(0, y, W, bandH);

      /* garis kayu/wood-plank halus di tiap pita */
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1;
      for (let lx = 8; lx < W; lx += 14) {
        ctx.beginPath();
        ctx.moveTo(lx, y + 4);
        ctx.lineTo(lx, y + bandH - 4);
        ctx.stroke();
      }

      /* pembatas antar pita */
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, y + bandH);
      ctx.lineTo(W, y + bandH);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y + bandH + 1.5);
      ctx.lineTo(W, y + bandH + 1.5);
      ctx.stroke();

      /* label angka besar + sub label */
      ctx.save();
      ctx.translate(W / 2, y + bandH / 2);
      ctx.fillStyle    = '#fff';
      ctx.font         = `bold ${Math.round(bandH * 0.38)}px Syne, sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor  = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur   = 5;
      ctx.fillText(seg.label, 0, -bandH * 0.06);
      ctx.font = `bold ${Math.round(bandH * 0.16)}px Syne, sans-serif`;
      ctx.shadowBlur = 3;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(seg.sub, 0, bandH * 0.28);
      ctx.restore();
    }

    /* ── Shading silinder (gelap di tepi kiri/kanan, terang di tengah) ── */
    const cylGrad = ctx.createLinearGradient(0, 0, W, 0);
    cylGrad.addColorStop(0,    'rgba(0,0,0,0.55)');
    cylGrad.addColorStop(0.18, 'rgba(0,0,0,0.12)');
    cylGrad.addColorStop(0.5,  'rgba(255,255,255,0.06)');
    cylGrad.addColorStop(0.82, 'rgba(0,0,0,0.12)');
    cylGrad.addColorStop(1,    'rgba(0,0,0,0.55)');
    ctx.fillStyle = cylGrad;
    ctx.fillRect(0, 0, W, H);

    /* ── flash putih sekilas tiap kali lewat 1 pita (tick) ── */
    if (tickFlash) {
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(0, 0, W, H);
    }

    ctx.restore();

    /* ── Frame/rangka luar barrel (di luar clip) ── */
    ctx.save();
    _barrelPath(pad, pad, bw, bh);
    ctx.lineWidth = pad * 2 + 2;
    ctx.strokeStyle = C.frame;
    ctx.stroke();

    /* cincin hijau metalik (dome atas & bawah, seperti foto referensi) */
    ctx.lineWidth = 4;
    const ringGrad = ctx.createLinearGradient(0, 0, W, 0);
    ringGrad.addColorStop(0,   C.ring);
    ringGrad.addColorStop(0.5, C.ringLight);
    ringGrad.addColorStop(1,   C.ring);
    ctx.strokeStyle = ringGrad;
    _barrelPath(pad + 3, pad + 3, bw - 6, bh - 6);
    ctx.stroke();
    ctx.restore();

    /* ── Banner gelap kecil di puncak dome (mirip label JACKPOT di foto) ── */
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    const bannerH = bandH * 0.22;
    _barrelPath(pad, pad, bw, bandH * 0.3);
    ctx.clip();
    ctx.fillRect(0, pad, W, bannerH + pad);
    ctx.fillStyle = C.goldLight;
    ctx.font = `bold ${Math.round(bandH * 0.13)}px Syne, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★ MIWA FORTUNE ★', W / 2, pad + bannerH / 2 + 2);
    ctx.restore();
  }

  /* ══════════════════════════════════════
     ANIMASI SPIN — easeOut quintic, scroll vertikal beberapa putaran
  ══════════════════════════════════════ */
  function easeOut5(t) { return 1 - Math.pow(1 - t, 5); }

  async function runSpin(targetIdx) {
    const TOTAL_MS   = 4200;
    const MIN_ROUNDS = 5;
    const bandH = _bandH;

    /* scrollY akhir supaya center pita targetIdx pas di H/2 */
    const vi = targetIdx + MIN_ROUNDS * N;
    const finalScroll = vi * bandH + bandH / 2 - H / 2;

    const t0 = performance.now();
    let _lastBand = null;
    return new Promise(resolve => {
      function frame(now) {
        const elapsed = now - t0;
        const t  = Math.min(elapsed / TOTAL_MS, 1);
        const tE = easeOut5(t);
        const curScroll = finalScroll * tE;
        const bandCrossed = Math.floor(curScroll / bandH);
        let flash = false;
        if (bandCrossed !== _lastBand) { SFX.wheel.tick(); _lastBand = bandCrossed; flash = true; }
        drawBarrel(curScroll, flash);
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
      drawBarrel(0, false);
    });
  }

  async function spin() {
    if (_done || _spinning) return;
    const btn = document.getElementById('wheelSpinBtn');
    if (!btn || btn.disabled) return;

    _spinning = true;
    btn.disabled = true;
    window.setTokenSlotMode('hidden');
    window.setStatus('🎯 Barrel berputar...', true);
    SFX.wheel.spinStart();
    document.querySelector('.wheel-canvas-wrap')?.classList.add('is-spinning');

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
    document.querySelector('.wheel-canvas-wrap')?.classList.remove('is-spinning');

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
