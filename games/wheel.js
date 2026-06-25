/* ══════════════════════════════════════
   GAME: WHEEL OF FORTUNE — Arcade Barrel (Big Bass Style)
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

  /* ── HTML layout mirip mesin arcade ── */
  function render() {
    const area = document.createElement('div');
    area.id        = 'gameArea';
    area.className = 'game-area slide-in';
    area.innerHTML = `
      <div class="wheel-card" id="wheelCard">
        <div class="slot-section-label">🎯 Wheel of Fortune</div>

        <!-- Mesin arcade: wrap luar dengan frame + jarum -->
        <div class="wb-machine-wrap">

          <!-- Top jackpot banner (hijau gelap, mirip foto) -->
          <div class="wb-top-banner">
            <span class="wb-top-label">JACKPOT</span>
            <span class="wb-top-value">5×</span>
          </div>

          <!-- Row: panel kiri + barrel + jarum kanan -->
          <div class="wb-barrel-row">

            <!-- Panel kiri: dekorasi chrome/baut -->
            <div class="wb-side-panel wb-side-left">
              <div class="wb-bolt"></div>
              <div class="wb-side-stripe"></div>
              <div class="wb-bolt"></div>
            </div>

            <!-- Barrel wrapper (overflow hidden, clip capsule via CSS) -->
            <div class="wb-barrel-outer">
              <canvas id="wheelCanvas"></canvas>
            </div>

            <!-- Panel kanan + jarum -->
            <div class="wb-side-panel wb-side-right">
              <div class="wb-bolt"></div>
              <div class="wb-pointer-wrap">
                <div class="wb-pointer"></div>
              </div>
              <div class="wb-bolt"></div>
            </div>

          </div>

          <!-- Bottom chrome strip -->
          <div class="wb-bottom-strip">
            <span class="wb-bottom-text">★ MIWA FORTUNE ★</span>
          </div>

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

    /* Inject CSS inline biar tidak perlu edit style.css */
    _injectCSS();
  }

  function _injectCSS() {
    if (document.getElementById('wb-injected-css')) return;
    const style = document.createElement('style');
    style.id = 'wb-injected-css';
    style.textContent = `
      /* ── Machine outer wrap ── */
      .wb-machine-wrap {
        width: 100%;
        max-width: 340px;
        margin: 0 auto 20px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0;
        filter: drop-shadow(0 16px 40px rgba(0,0,0,0.7));
      }

      /* ── Top banner (hijau tua / dark green seperti foto) ── */
      .wb-top-banner {
        width: 88%;
        background: linear-gradient(180deg, #1a4a1a 0%, #0d2e0d 100%);
        border: 2px solid #2e8a2e;
        border-bottom: none;
        border-radius: 12px 12px 0 0;
        padding: 6px 12px 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        position: relative;
        z-index: 2;
      }
      .wb-top-label {
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 3px;
        color: #4ad44a;
        text-shadow: 0 0 8px rgba(74,212,74,0.7);
      }
      .wb-top-value {
        font-size: 22px;
        font-weight: 900;
        color: #f0d080;
        text-shadow: 0 0 12px rgba(240,208,80,0.9), 0 2px 0 rgba(0,0,0,0.5);
        font-family: 'DM Serif Display', serif;
      }

      /* ── Row: kiri + barrel + kanan ── */
      .wb-barrel-row {
        display: flex;
        align-items: stretch;
        width: 100%;
        position: relative;
        z-index: 1;
      }

      /* ── Side panels (chrome, kiri & kanan) ── */
      .wb-side-panel {
        width: 28px;
        background: linear-gradient(180deg, #b0bcc8 0%, #6a7a88 40%, #8a9aaa 70%, #b0bcc8 100%);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: space-between;
        padding: 8px 0;
        border: 1px solid #404a54;
        position: relative;
        flex-shrink: 0;
      }
      .wb-side-left  { border-right: none; border-radius: 0; }
      .wb-side-right { border-left:  none; border-radius: 0; }

      .wb-bolt {
        width: 10px; height: 10px;
        background: radial-gradient(circle at 35% 35%, #e8eef4, #888fa0);
        border-radius: 50%;
        border: 1px solid #505860;
        box-shadow: 0 1px 2px rgba(0,0,0,0.4);
      }
      .wb-side-stripe {
        flex: 1;
        width: 4px;
        background: linear-gradient(180deg, rgba(255,255,255,0.3), rgba(255,255,255,0.05));
        border-radius: 2px;
        margin: 4px 0;
      }

      /* ── Pointer wrap (kanan) ── */
      .wb-pointer-wrap {
        position: relative;
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        flex: 1;
      }
      /* Segitiga kuning nunjuk ke kiri (ke barrel) */
      .wb-pointer {
        width: 0;
        height: 0;
        border-top:    13px solid transparent;
        border-bottom: 13px solid transparent;
        border-right:  20px solid #f0d080;
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.7))
                drop-shadow(0 0 6px rgba(240,208,80,0.5));
        position: relative;
        left: -4px;
      }

      /* ── Barrel outer (clip dengan border-radius tinggi) ── */
      .wb-barrel-outer {
        flex: 1;
        overflow: hidden;
        border-left:  2px solid #404a54;
        border-right: 2px solid #404a54;
        position: relative;
        background: #050505;
      }

      #wheelCanvas {
        display: block;
        width: 100%;
        height: 100%;
      }

      /* ── Bottom strip chrome ── */
      .wb-bottom-strip {
        width: 88%;
        background: linear-gradient(180deg, #0d2e0d 0%, #1a4a1a 100%);
        border: 2px solid #2e8a2e;
        border-top: none;
        border-radius: 0 0 12px 12px;
        padding: 5px 12px;
        text-align: center;
        position: relative;
        z-index: 2;
      }
      .wb-bottom-text {
        font-size: 8px;
        font-weight: 800;
        letter-spacing: 3px;
        color: #4ad44a;
        text-shadow: 0 0 6px rgba(74,212,74,0.5);
      }

      /* Glow aura saat spinning */
      .wb-machine-wrap.is-spinning .wb-barrel-outer {
        box-shadow: 0 0 30px rgba(240,208,80,0.3) inset;
      }
      .wb-machine-wrap.is-spinning .wb-top-value {
        animation: wbJackpotPulse 0.7s ease-in-out infinite alternate;
      }
      @keyframes wbJackpotPulse {
        from { text-shadow: 0 0 12px rgba(240,208,80,0.9); }
        to   { text-shadow: 0 0 28px rgba(240,208,80,1), 0 0 50px rgba(240,160,0,0.7); }
      }
    `;
    document.head.appendChild(style);
  }

  /* ══════════════════════════════════════
     CANVAS SETUP
  ══════════════════════════════════════ */
  function initCanvas() {
    canvas = document.getElementById('wheelCanvas');
    const outer = canvas.parentElement;
    W = outer.clientWidth || 240;
    H = Math.round(W * 1.1);  // sedikit lebih persegi (3 pita kelihatan pas)
    canvas.width  = W;
    canvas.height = H;
    ctx = canvas.getContext('2d');
    _bandH = H / 3;   // tepat 3 pita penuh dalam viewport
    outer.style.height = H + 'px';
  }

  /* ══════════════════════════════════════
     DRAW BARREL
     - 3 pita kelihatan: atas (samar), tengah (full bright), bawah (samar)
     - Setiap pita: warna solid + garis kayu vertikal
     - Teks: angka besar di tengah pita, sub kecil di bawahnya
     - Shading silinder: kiri & kanan gelap, tengah terang
     - Garis hitam tebal antar pita
  ══════════════════════════════════════ */
  function drawBarrel(scrollY, tickFlash) {
    ctx.clearRect(0, 0, W, H);

    const bandH = _bandH;
    const midY  = H / 2;  // y tengah viewport = pointer

    /* ── Gambar tiap pita yang terlihat ── */
    const minVI = Math.floor((-bandH + scrollY) / bandH) - 1;
    const maxVI = Math.ceil((H + bandH + scrollY) / bandH) + 1;

    for (let vi = minVI; vi <= maxVI; vi++) {
      const y   = vi * bandH - scrollY;
      if (y > H + bandH || y < -bandH * 2) continue;
      const idx = ((vi % N) + N) % N;
      const seg = SEGMENTS[idx];

      /* Seberapa jauh dari tengah (untuk dim atas/bawah) */
      const centerDist = Math.abs((y + bandH / 2) - midY) / bandH;
      const dimFactor  = Math.max(0, 1 - centerDist * 0.7); // 1 = penuh, ~0.3 = redup

      /* ── Warna solid pita (dengan gradient atas-bawah tipis) ── */
      const grad = ctx.createLinearGradient(0, y, 0, y + bandH);
      grad.addColorStop(0,    seg.light);
      grad.addColorStop(0.12, seg.color);
      grad.addColorStop(0.88, seg.color);
      grad.addColorStop(1,    seg.light + '88');
      ctx.globalAlpha = 0.35 + dimFactor * 0.65;
      ctx.fillStyle = grad;
      ctx.fillRect(0, y, W, bandH);

      /* ── Garis kayu vertikal (wood grain effect) ── */
      ctx.globalAlpha = 0.18 * dimFactor;
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      for (let lx = 6; lx < W; lx += 10) {
        ctx.beginPath();
        ctx.moveTo(lx, y + 3);
        ctx.lineTo(lx, y + bandH - 3);
        ctx.stroke();
      }
      /* Highlight stripe tipis di kiri setiap plank */
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 0.7;
      for (let lx = 7; lx < W; lx += 10) {
        ctx.beginPath();
        ctx.moveTo(lx, y + 3);
        ctx.lineTo(lx, y + bandH - 3);
        ctx.stroke();
      }

      /* ── Label angka besar ── */
      ctx.globalAlpha = dimFactor * (seg.mult === 0 ? 0.55 : 1);
      ctx.save();
      ctx.translate(W / 2, y + bandH / 2);

      /* Shadow teks */
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur  = 8;

      /* Angka utama */
      ctx.fillStyle    = seg.textColor;
      ctx.font         = `900 ${Math.round(bandH * 0.44)}px Syne, sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(seg.label, 0, -bandH * 0.08);

      /* Sub label */
      ctx.shadowBlur  = 4;
      ctx.fillStyle   = seg.subColor;
      ctx.font        = `700 ${Math.round(bandH * 0.17)}px Syne, sans-serif`;
      ctx.fillText(seg.sub, 0, bandH * 0.30);
      ctx.restore();

      ctx.globalAlpha = 1;

      /* ── Garis batas antar pita: hitam tebal + highlight tipis ── */
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(0, y + bandH - 2, W, 4);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(0, y + bandH + 2, W, 1.5);
    }

    /* ── Shading silinder: gelap kiri-kanan, terang tengah (3D drum look) ── */
    const cylGrad = ctx.createLinearGradient(0, 0, W, 0);
    cylGrad.addColorStop(0,    'rgba(0,0,0,0.62)');
    cylGrad.addColorStop(0.10, 'rgba(0,0,0,0.22)');
    cylGrad.addColorStop(0.28, 'rgba(0,0,0,0.05)');
    cylGrad.addColorStop(0.50, 'rgba(255,255,255,0.07)');
    cylGrad.addColorStop(0.72, 'rgba(0,0,0,0.05)');
    cylGrad.addColorStop(0.90, 'rgba(0,0,0,0.22)');
    cylGrad.addColorStop(1,    'rgba(0,0,0,0.62)');
    ctx.fillStyle = cylGrad;
    ctx.fillRect(0, 0, W, H);

    /* Highlight shimmer kiri (seperti pantulan cahaya di foto) */
    const shimmer = ctx.createLinearGradient(0, 0, W * 0.32, 0);
    shimmer.addColorStop(0,    'rgba(255,255,255,0.00)');
    shimmer.addColorStop(0.35, 'rgba(255,255,255,0.13)');
    shimmer.addColorStop(0.65, 'rgba(255,255,255,0.04)');
    shimmer.addColorStop(1,    'rgba(255,255,255,0.00)');
    ctx.fillStyle = shimmer;
    ctx.fillRect(0, 0, W * 0.32, H);

    /* ── Zona gelap atas & bawah (pita tidak aktif lebih redup) ── */
    const fadeTop = ctx.createLinearGradient(0, 0, 0, bandH * 0.8);
    fadeTop.addColorStop(0,   'rgba(0,0,0,0.55)');
    fadeTop.addColorStop(1,   'rgba(0,0,0,0.00)');
    ctx.fillStyle = fadeTop;
    ctx.fillRect(0, 0, W, bandH * 0.8);

    const fadeBot = ctx.createLinearGradient(0, H - bandH * 0.8, 0, H);
    fadeBot.addColorStop(0,   'rgba(0,0,0,0.00)');
    fadeBot.addColorStop(1,   'rgba(0,0,0,0.55)');
    ctx.fillStyle = fadeBot;
    ctx.fillRect(0, H - bandH * 0.8, W, bandH * 0.8);

    /* ── Garis horizontal indicator di tengah (pointer line) ── */
    ctx.save();
    ctx.strokeStyle = 'rgba(240,208,80,0.60)';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(0, midY - bandH / 2);
    ctx.lineTo(W, midY - bandH / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, midY + bandH / 2);
    ctx.lineTo(W, midY + bandH / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    /* ── Flash putih saat pita berganti (tick) ── */
    if (tickFlash) {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(0, 0, W, H);
    }
  }

  /* ══════════════════════════════════════
     ANIMASI SPIN — easeOut quintic
  ══════════════════════════════════════ */
  function easeOut5(t) { return 1 - Math.pow(1 - t, 5); }

  async function runSpin(targetIdx) {
    const TOTAL_MS   = 4000;
    const MIN_ROUNDS = 6;
    const bandH      = _bandH;

    /* scrollY akhir = center pita targetIdx pas di midY (H/2) */
    const vi          = targetIdx + MIN_ROUNDS * N;
    const finalScroll = vi * bandH + bandH / 2 - H / 2;

    const t0 = performance.now();
    let _lastBand = null;

    return new Promise(resolve => {
      function frame(now) {
        const elapsed = now - t0;
        const t       = Math.min(elapsed / TOTAL_MS, 1);
        const tE      = easeOut5(t);
        const curScroll = finalScroll * tE;

        const bandCrossed = Math.floor(curScroll / bandH);
        let flash = false;
        if (bandCrossed !== _lastBand) {
          SFX.wheel.tick();
          _lastBand = bandCrossed;
          flash = true;
        }

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
      drawBarrel(_bandH * 0.5, false); // mulai di tengah pita pertama
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

    document.querySelector('.wb-machine-wrap')?.classList.add('is-spinning');

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

    document.querySelector('.wb-machine-wrap')?.classList.remove('is-spinning');

    const actualWin = seg.mult >= 1;
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
    _onResult(actualWin, prize);
  }

  return { init, spin };
})();
