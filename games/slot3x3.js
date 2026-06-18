/* ══════════════════════════════════════
   GAME: SLOT 3×3
   Expose: Slot3x3.init(gacha, onResult)

   GRID LAYOUT (row-major):
     sw1  sw2  sw3   ← baris atas
     sw4  sw5  sw6   ← baris TENGAH = PAYLINE
     sw7  sw8  sw9   ← baris bawah

   WIN: simbol tengah sw4 === sw5 === sw6

   MEKANISME:
   1. Tentukan apakah menang (chance%)
   2. Bangun simbol untuk semua 9 reel — mid sw4/5/6 dikontrol
   3. Jalankan animasi
   4. Setelah animasi berhenti, READ-BACK simbol tengah
      dari DOM secara langsung (getSymbolAtCenter)
   5. Cek menang dari DOM read-back, bukan data internal
   6. console.log CENTER PAYLINE untuk debug
══════════════════════════════════════ */
const Slot3x3 = (() => {

  const EMOJIS = ['🍇','🍉','🍋','🍌','🍎','🍑','🍒','🫐','🥥','🥑'];

  /*
   * ITEM_H: tinggi satu simbol dalam px.
   * HARUS sinkron dengan CSS: .slot-reel div { height: Xpx }
   * Window height = ITEM_H × 1 (hanya 1 baris terlihat per slot-window)
   *
   * ⚠ CSS .slot-window height = 80px → ITEM_H WAJIB = 80
   */
  const ITEM_H = 80;
  const PAD    = 28;   /* item random sebelum 3 simbol target */

  let _gacha    = null;
  let _onResult = null;

  /* ── Helpers ── */
  function rand(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /* Guard: apakah game sudah selesai (callback sudah dipanggil) */
  let _done = false;
  function isGameDone() { return _done; }

  /*
   * buildReel — isi reel dengan:
   *   [PAD item random] [top] [mid] [bot] [1 buffer]
   *
   * Stop translateY = -(PAD * ITEM_H)
   * → item[PAD]   = baris atas  window  (sw1/sw4/sw7)
   * → item[PAD+1] = baris TENGAH window (sw2/sw5/sw8)  — tapi kita scroll hanya 1 row per window
   * → item[PAD+2] = baris bawah window  (sw3/sw6/sw9)
   *
   * Karena setiap slot-window hanya menampilkan 1 baris (height = ITEM_H),
   * stop di -(PAD * ITEM_H) berarti item[PAD] muncul tepat di tengah window.
   * Untuk payline (sw4,sw5,sw6) kita kontrol item[PAD] = simbol yang diinginkan.
   */
  function buildReel(reel, symbol) {
    const items = [];
    for (let i = 0; i < PAD; i++) items.push(rand(EMOJIS));
    items.push(symbol);           /* index PAD → simbol yang tampil saat stop */
    items.push(rand(EMOJIS));     /* buffer */

    reel.innerHTML = items.map(e => `<div>${e}</div>`).join('');
    reel.style.transition = 'none';
    reel.style.transform  = 'translateY(0px)';
  }

  /*
   * getSymbolAtCenter — baca simbol yang BENAR-BENAR terlihat
   * di window setelah animasi berhenti.
   *
   * Cara: ambil computed translateY, hitung item index yang
   * visible di window (window height = ITEM_H = 1 item).
   */
  function getSymbolAtCenter(reel) {
    const style      = window.getComputedStyle(reel);
    const matrix     = new DOMMatrix(style.transform);
    const translateY = matrix.m42;
    const scrolled   = Math.abs(translateY);
    const idx        = Math.round(scrolled / ITEM_H);
    const items      = reel.querySelectorAll('div');
    return items[idx]?.textContent?.trim() ?? '?';
  }

  /* ── Animasi ── */
  function animateReel(reel, symbol, duration, delay) {
    return new Promise(resolve => {
      buildReel(reel, symbol);
      const targetY = -(PAD * ITEM_H);
      setTimeout(() => {
        reel.style.transition = `transform ${duration}ms cubic-bezier(0.08, 0.82, 0.17, 1)`;
        reel.style.transform  = `translateY(${targetY}px)`;
        setTimeout(resolve, duration);
      }, delay);
    });
  }

  /* ── Render HTML ── */
  function render() {
    const windows = Array.from({length: 9}, (_, i) =>
      `<div class="slot-window" id="sw${i + 1}">
         <div class="slot-reel"  id="reel${i + 1}"></div>
       </div>`
    ).join('');

    return `
      <div class="slot-card">
        <div class="slot-section-label">Slot 3 × 3</div>
        <div class="slot-grid-3x3">${windows}</div>
        <div class="payline-wrap">
          <div class="payline-track">
            <div class="payline-dot left"></div>
            <div class="payline-dot center"></div>
            <div class="payline-dot right"></div>
          </div>
        </div>

        <div class="win-rule">
          <div class="win-rule-title">🎯 Cara Menang</div>
          <div class="win-rule-grid">
            🍋 🍒 🍇<br>
            🍉 🍉 🍉 ← MENANG<br>
            🍎 🍌 🍑
          </div>
          <div class="win-rule-desc">
            Menang jika 3 simbol pada <strong>BARIS TENGAH</strong> sama.
          </div>
        </div>

        <button class="spin-game-btn" id="spinGameBtn" onclick="Slot3x3.spin()">
          🎰 &nbsp;SPIN
        </button>
      </div>
    `;
  }

  /* ── Init ── */
  function init(gacha, onResult) {
    _gacha    = gacha;
    _onResult = onResult;
    _done     = false;

    const area = document.createElement('div');
    area.id        = 'gameArea';
    area.className = 'game-area slide-in';
    area.innerHTML = render();

    /*
     * Cari anchor untuk replace — prioritas:
     * 1. Info card masih di DOM → replace langsung di posisinya
     * 2. Game area lama masih ada → replace
     * 3. Fallback → insert setelah glass-card
     */
    const infoCard  = document.getElementById('gachaInfoCard');
    const existGame = document.getElementById('gameArea');

    if (infoCard) {
      infoCard.replaceWith(area);
    } else if (existGame) {
      existGame.replaceWith(area);
    } else {
      document.querySelector('.glass-card').insertAdjacentElement('afterend', area);
    }

    /* State awal reel — semua random */
    for (let i = 1; i <= 9; i++) {
      buildReel(
        document.getElementById('reel' + i),
        rand(EMOJIS)
      );
    }
  }

  /* ── Spin ── */
  async function spin() {
    if (isGameDone()) return;

    const btn = document.getElementById('spinGameBtn');
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    window.setTokenSlotMode('hidden'); // Sembunyikan tombol back begitu spin dimulai
    window.setStatus('🎰 Spinning...', true);

    /* ── 1. Tentukan hasil — dari app.js (sumber kebenaran) ── */
    const isWin = _gacha.result === 'win';

    /*
     * ── 2. Bangun simbol untuk semua 9 reel ──
     *
     * PAYLINE = baris TENGAH grid = sw4, sw5, sw6
     * → reel4, reel5, reel6 → array index 3, 4, 5
     *
     * reelSymbols[i] = simbol yang tampil saat stop
     */
    const reelSymbols = Array.from({length: 9}, () => rand(EMOJIS));

    if (isWin) {
      /* Paksa ketiga payline sama */
      const winSym = rand(EMOJIS);
      reelSymbols[3] = winSym;
      reelSymbols[4] = winSym;
      reelSymbols[5] = winSym;
    } else {
      /* Paksa tidak semua sama — pastikan minimal 1 berbeda */
      reelSymbols[3] = rand(EMOJIS);
      reelSymbols[4] = rand(EMOJIS);
      /* Pastikan reel6 beda dari reel4 dan reel5 */
      do {
        reelSymbols[5] = rand(EMOJIS);
      } while (reelSymbols[5] === reelSymbols[3] && reelSymbols[5] === reelSymbols[4]);
    }

    /* ── 3. Jalankan animasi ── */
    const base   = _gacha.isPremium ? 1000 : 600;
    const durs   = [base + 2000, base + 3000, base + 4200];
    const delays = [0, 200, 400];

    await Promise.all(
      reelSymbols.map((sym, i) => {
        const reel = document.getElementById('reel' + (i + 1));
        const col  = i % 3;
        return animateReel(reel, sym, durs[col], delays[col]);
      })
    );

    if (isGameDone()) return;

    /* ── 4. READ-BACK dari DOM — baca simbol payline ── */
    const paylineReels = [
      document.getElementById('reel4'),
      document.getElementById('reel5'),
      document.getElementById('reel6'),
    ];

    const middleRow = paylineReels.map(r => getSymbolAtCenter(r));

    /* DEBUG */
    console.log('CENTER PAYLINE:', middleRow);
    console.log('isWin (planned):', isWin);
    console.log('planned symbols [3,4,5]:', reelSymbols[3], reelSymbols[4], reelSymbols[5]);

    /* ── 5. Evaluasi dari DOM read-back ── */
    const actualWin =
      middleRow[0] !== '?' &&
      middleRow[0] === middleRow[1] &&
      middleRow[1] === middleRow[2];

    /* Sanity check */
    if (actualWin !== isWin) {
      console.warn('⚠ Mismatch planned vs actual!', { planned: isWin, actual: actualWin, middleRow });
    }

    /* ── 6. Visual feedback ── */
    if (actualWin) {
      [4, 5, 6].forEach(n =>
        document.getElementById('sw' + n)?.classList.add('win-glow')
      );
      window.setStatus('🏆 JACKPOT!', true);
    } else {
      window.setStatus('💀 Belum beruntung...', false);
    }

    await new Promise(r => setTimeout(r, actualWin ? 1200 : 700));

    if (isGameDone()) return;
    _done = true;
    _onResult(actualWin, _gacha.money);
  }

  return { init, spin };
})();
