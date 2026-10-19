/* ══════════════════════════════════════
   GAME: COIN FLIP
   Expose: CoinFlip.init(gacha, onResult)

   VISUAL : Canvas — koin 3D flip pakai
            scaleX squish trick + gradient
   BET    : heads / tails
   ANIM   : koin naik sambil muter cepat,
            peak di tengah, turun makin lambat,
            landing bounce, reveal sisi
══════════════════════════════════════ */
const CoinFlip = (() => {

  let _gacha    = null;
  let _onResult = null;
  let _bet      = null;   // 'heads' | 'tails'
  let _spinning = false;
  let _raf      = null;
  let _done     = false;

  /* ── Render HTML ── */
  function render() {
    return `
      <div class="coin-card" id="coinCard">
        <div class="slot-section-label">🪙 Coin Flip</div>

        <div class="coin-canvas-wrap">
          <canvas id="coinCanvas"></canvas>
          <div class="coin-shadow" id="coinShadow"></div>
        </div>

        <div class="coin-hud" id="coinHud">Pilih sisi koin</div>

        <div class="coin-bet-section">
          <div class="roulette-bet-label">Pilih Taruhan</div>
          <div class="roulette-bet-row">
            <button class="bet-btn bet-heads" id="betHeads" onclick="CoinFlip.selectBet('heads')">👑 Heads</button>
            <button class="bet-btn bet-tails" id="betTails" onclick="CoinFlip.selectBet('tails')">⚔️ Tails</button>
          </div>
          <div class="roulette-odds">
            <span class="odds-item">👑 Heads — 50%</span>
            <span class="odds-sep">·</span>
            <span class="odds-item">⚔️ Tails — 50%</span>
          </div>
        </div>

        <button class="spin-game-btn" id="spinGameBtn" onclick="CoinFlip.flip()" disabled>
          🪙 &nbsp;FLIP
        </button>
      </div>
    `;
  }

  /* ══════════════════════════════════════
     CANVAS
  ══════════════════════════════════════ */
  let canvas, ctx, CX, CY, CR, SIZE;

  function initCanvas() {
    canvas = document.getElementById('coinCanvas');
    const wrap = document.querySelector('.coin-canvas-wrap');
    const size = Math.min(wrap.clientWidth, 260);
    const dpr  = Math.min(window.devicePixelRatio || 1, 3);
    SIZE = size;
    canvas.width  = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    canvas.style.width  = size + 'px';
    canvas.style.height = size + 'px';
    ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingQuality = 'high';
    const sh = document.getElementById('coinShadow');
    if (sh) { sh.style.willChange = 'transform, opacity'; sh.style.filter = 'blur(9px)'; }
    CX = size / 2;
    CY = size / 2;
    CR = size * 0.36;   // coin radius
  }

  /* ── Palette ── */
  const GOLD = {
    rim:     '#b8860b',
    face:    '#d4af5a',
    light:   '#f0d080',
    shine:   '#fff8dc',
    dark:    '#8a6c1a',
    shadow:  'rgba(0,0,0,0.55)',
  };

  /*
   * drawCoin(scaleX, yOffset, side, flipProgress)
   *   scaleX      : -1..1, squish untuk efek 3D rotate
   *   yOffset     : pixel offset vertikal (lompat)
   *   side        : 'heads' | 'tails' — sisi yang menghadap user
   *   flipProgress: 0..1 untuk efek tilt cahaya
   */
  function drawCoin(scaleX, yOffset, side, t) {
    ctx.clearRect(0, 0, SIZE, SIZE);

    const absX = Math.abs(scaleX);
    const cx   = CX;
    const cy   = CY + yOffset;
    const rx   = CR * absX;   // radius horizontal (squished)
    const ry   = CR;          // radius vertikal (tetap)

    if (rx < 1) return;       // terlalu tipis, skip

    /* ── Rim (edge tebal koin) ── */
    /* Gambar sedikit lebih lebar/tinggi buat kesan ketebalan */
    const thick = CR * 0.06;
    ctx.save();
    ctx.translate(cx, cy + thick * 0.5);
    ctx.scale(1, ry / (rx || 1));
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fillStyle = GOLD.dark;
    ctx.fill();     // FIX BUG 7: fill SEBELUM restore agar transform masih aktif
    ctx.restore();

    /* ── Face gradient ── */
    const isHeads = side === 'heads';

    /* Warna berbeda tiap sisi */
    const faceBase  = isHeads ? GOLD.face  : '#a0522d';   // gold vs bronze
    const faceLight = isHeads ? GOLD.light : '#cd853f';
    const faceDark  = isHeads ? GOLD.dark  : '#6b3a1f';
    const shineCol  = isHeads ? GOLD.shine : '#deb887';

    /* Radial gradient — highlight ikut scaleX biar kesan 3D */
    const hx = cx - rx * 0.35 * Math.sign(scaleX);
    const hy = cy - ry * 0.3;
    const fg = ctx.createRadialGradient(hx, hy, CR * 0.05, cx, cy, CR * 1.1);
    fg.addColorStop(0,   shineCol);
    fg.addColorStop(0.3, faceLight);
    fg.addColorStop(0.7, faceBase);
    fg.addColorStop(1,   faceDark);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(rx / CR, 1);
    ctx.beginPath();
    ctx.arc(0, 0, CR, 0, Math.PI * 2);
    ctx.restore();
    ctx.fillStyle = fg;
    ctx.fill();

    /* ── Rim stroke ── */
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(rx / CR, 1);
    ctx.beginPath();
    ctx.arc(0, 0, CR, 0, Math.PI * 2);
    ctx.restore();
    ctx.strokeStyle = GOLD.rim;
    ctx.lineWidth = CR * 0.04;
    ctx.stroke();

    /* ── Inner detail (hanya saat koin cukup lebar) ── */
    if (absX > 0.25) {
      const alpha = Math.min(1, (absX - 0.25) / 0.35);
      ctx.globalAlpha = alpha;

      /* Inner circle groove */
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(rx / CR, 1);
      ctx.beginPath();
      ctx.arc(0, 0, CR * 0.78, 0, Math.PI * 2);
      ctx.restore();
      ctx.strokeStyle = isHeads ? GOLD.dark : '#5c2e0e';
      ctx.lineWidth = CR * 0.025;
      ctx.stroke();

      /* Symbol di tengah */
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(absX, 1);   // ← symbol ikut squish biar proporsional
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';

      const u = CR * 0.36;
      ctx.fillStyle   = isHeads ? GOLD.dark : faceDark;
      ctx.globalAlpha = alpha * 0.75;
      ctx.beginPath();
      if (isHeads) {            /* mahkota */
        ctx.moveTo(-u, u * .65); ctx.lineTo(-u * 1.05, -u * .45); ctx.lineTo(-u * .5, u * .05);
        ctx.lineTo(0, -u * .85); ctx.lineTo(u * .5, u * .05); ctx.lineTo(u * 1.05, -u * .45);
        ctx.lineTo(u, u * .65); ctx.closePath(); ctx.fill();
        ctx.fillRect(-u, u * .78, u * 2, u * .2);
      } else {                  /* pedang */
        ctx.moveTo(0, -u * 1.1); ctx.lineTo(u * .17, -u * .65); ctx.lineTo(u * .17, u * .35);
        ctx.lineTo(-u * .17, u * .35); ctx.lineTo(-u * .17, -u * .65); ctx.closePath(); ctx.fill();
        ctx.fillRect(-u * .55, u * .35, u * 1.1, u * .15);
        ctx.fillRect(-u * .08, u * .5, u * .16, u * .45);
      }
      ctx.restore();

      ctx.globalAlpha = 1;
    }

      /* ── Specular shine streak (bergerak sesuai flip) ── */
      if (absX > 0.15) {
        const shineX = cx + rx * (0.6 - t * 0.4) * Math.sign(scaleX);
        const shineY = cy - ry * 0.5;
        const sg = ctx.createLinearGradient(
          shineX - rx * 0.15, shineY,
          shineX + rx * 0.05, shineY + ry * 0.5
        );
        sg.addColorStop(0,   'rgba(255,255,255,0)');
        sg.addColorStop(0.4, 'rgba(255,255,255,0.22)');
        sg.addColorStop(1,   'rgba(255,255,255,0)');

        /* FIX BUG 6: clip dan fill harus dalam save/restore yang sama
           agar clip aktif saat fill dieksekusi */
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(rx / CR, 1);
        ctx.beginPath();
        ctx.arc(0, 0, CR * 0.99, 0, Math.PI * 2);
        ctx.clip();
        ctx.scale(CR / (rx || 1), 1);   // balik scale agar fillRect lurus
        ctx.translate(-cx, -cy);
        ctx.fillStyle = sg;
        ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
        ctx.restore();
      }
    }

  /* ── Shadow bawah koin (div CSS, bukan canvas) ── */
  function updateShadow(yOffset, scaleX) {
    const shadow = document.getElementById('coinShadow');
    if (!shadow) return;
    const lift  = Math.max(0, -yOffset);
    const k     = Math.max(0.3, 1 - lift / (CR * 3.2));
    shadow.style.transform = `translateZ(0) scale(${(k * Math.max(0.35, Math.abs(scaleX))).toFixed(3)}, ${(k * 0.25).toFixed(3)})`;
    shadow.style.opacity   = Math.max(0.12, 0.5 - lift * 0.0028).toFixed(3);
  }

  /* ══════════════════════════════════════
     ANIMATION
  ══════════════════════════════════════ */
  function easeOutBounce(t) {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1/d1)       return n1*t*t;
    if (t < 2/d1)       return n1*(t-=1.5/d1)*t+0.75;
    if (t < 2.5/d1)     return n1*(t-=2.25/d1)*t+0.9375;
    return n1*(t-=2.625/d1)*t+0.984375;
  }
  function easeInOut(t) { return t < 0.5 ? 2*t*t : -1+(4-2*t)*t; }
  function easeOutCubic(t) { return 1 - Math.pow(1-t, 3); }

  async function runFlip(result) {
    const startSide = 'heads';
    const halfFlips = 12 + (result !== startSide ? 1 : 0);   /* ganjil = ganti sisi */
    const WIND = 220, FLIGHT = 1750, SETTLE = 700;
    const END  = WIND + FLIGHT + SETTLE;
    const maxH = CR * 2.7, sink = CR * 0.10;
    const easeOut = t => 1 - Math.pow(1 - t, 2.4);           /* putaran melambat halus */

    return new Promise(resolve => {
      const t0 = performance.now();
      function frame(now) {
        const e = Math.max(0, now - t0);
        let yOff = 0, angle = 0;

        if (e < WIND) {                                      /* windup: turun pelan, kecepatan akhir 0 */
          yOff = Math.sin((e / WIND) * Math.PI * 0.5) * sink;
        } else if (e < WIND + FLIGHT) {                      /* terbang: parabola + rotasi satu kurva */
          const t = (e - WIND) / FLIGHT;
          yOff  = sink * (1 - t) - 4 * maxH * t * (1 - t);
          angle = easeOut(t) * halfFlips * Math.PI;
        } else {                                             /* mendarat: pantulan teredam */
          const t = Math.min(1, (e - WIND - FLIGHT) / SETTLE);
          yOff  = -Math.abs(Math.sin(t * Math.PI * 2.5)) * CR * 0.16 * Math.pow(1 - t, 2);
          angle = halfFlips * Math.PI;
        }

        const scaleX = Math.cos(angle);
        const side   = scaleX >= 0 ? 'heads' : 'tails';
        const prog   = Math.min(1, angle / (halfFlips * Math.PI));
        drawCoin(scaleX, yOff, side, prog);
        updateShadow(yOff, scaleX);

        if (e >= END) { resolve(); return; }
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
    _bet      = null;
    _spinning = false;
    _done     = false;
    if (_raf) { cancelAnimationFrame(_raf); _raf = null; }

    const area = document.createElement('div');
    area.id        = 'gameArea';
    area.className = 'game-area slide-in';
    area.innerHTML = render();

    const infoCard  = document.getElementById('gachaInfoCard');
    const existGame = document.getElementById('gameArea');

    if (infoCard)       infoCard.replaceWith(area);
    else if (existGame) existGame.replaceWith(area);
    else document.querySelector('.glass-card').insertAdjacentElement('afterend', area);

    requestAnimationFrame(() => {
      initCanvas();
      /* Gambar koin idle (heads) */
      drawCoin(1, 0, 'heads', 0);
      updateShadow(0, 1);
    });
  }

  function selectBet(side) {
    if (_spinning) return;
    _bet = side;

    document.getElementById('betHeads').classList.toggle('selected', side === 'heads');
    document.getElementById('betTails').classList.toggle('selected', side === 'tails');

    const spinBtn = document.getElementById('spinGameBtn');
    if (spinBtn) spinBtn.disabled = false;

    const hud = document.getElementById('coinHud');
    if (hud) {
      hud.textContent = side === 'heads' ? '👑 Heads dipilih' : '⚔️ Tails dipilih';
      hud.className   = 'coin-hud chosen ' + (side === 'heads' ? 'hud-heads' : 'hud-tails');
    }
  }

  async function flip() {
    if (_done || _spinning || !_bet) return;

    const spinBtn = document.getElementById('spinGameBtn');
    if (!spinBtn || spinBtn.disabled) return;

    _spinning = true;
    spinBtn.disabled = true;
    document.getElementById('betHeads').disabled = true;
    document.getElementById('betTails').disabled = true;
    window.setTokenSlotMode('hidden'); // Sembunyikan tombol back begitu flip dimulai
    window.setStatus('🪙 Melempar koin...', true);
    SFX.coinflip.flip();

    const hud = document.getElementById('coinHud');
    if (hud) { hud.textContent = '🪙 Terbang...'; hud.className = 'coin-hud spinning'; }

    /* Tentukan hasil — dari app.js (sumber kebenaran) */
    const isWin  = _gacha.result === 'win';
    const result = isWin ? _bet : (_bet === 'heads' ? 'tails' : 'heads');

    await runFlip(result);
    SFX.coinflip.land();

    if (_done) return;

    /* Result HUD */
    const emoji = result === 'heads' ? '👑' : '⚔️';
    const label = result === 'heads' ? 'Heads' : 'Tails';
    if (hud) {
      hud.textContent = `${emoji} ${label}!`;
      hud.className   = 'coin-hud result ' + (isWin ? 'hud-win' : 'hud-lose');
    }

    window.setStatus(isWin ? '🏆 MENANG!' : '💀 Kalah...', isWin);
    isWin ? SFX.coinflip.win() : SFX.coinflip.lose();

    await new Promise(r => setTimeout(r, isWin ? 1200 : 800));
    if (_done) return;
    _done = true;
    _onResult(isWin, _gacha.money);
  }

  return { init, selectBet, flip };
})();
