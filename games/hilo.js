/* ══════════════════════════════════════
   GAME: HI-LO — Card Streak Guessing Game
   games/hilo.js
   Expose: HiLo.init(gacha, onResult)

   RULES:
   - Deck 52 kartu standar, dikocok sekali per game, kartu ditarik
     berurutan (tidak dikembalikan ke deck).
   - 1 kartu "sekarang" ditampilkan. Pemain menebak kartu berikutnya
     LEBIH TINGGI atau LEBIH RENDAH (seri/sama nilai = kalah).
   - Tiap tebakan benar menaikkan multiplier (kumulatif, dihitung dari
     probabilitas asli kartu yang tersisa di deck — kartu ekstrem
     (misal nilai kecil lalu nebak LO) kasih multiplier kecil,
     tebakan "berani" di kartu tengah kasih multiplier lebih besar).
   - Pemain bisa CASHOUT kapan saja setelah minimal 1 tebakan benar.
   - Tombol arah yang MUSTAHIL (misal nebak HI saat kartu sekarang King)
     otomatis dinonaktifkan.

   Mekanisme predetermined result (sama pola dengan mines.js):
   - _gacha.result cuma nentuin KATEGORI:
       'win'  -> dijamin benar sampai streak target (3-5), baru
                 risiko asli (55% benar) berlaku
       'lose' -> dijamin benar cuma 0-2 streak, lalu risiko asli
                 turun jadi 20% benar
   - Kartu AKTUAL yang ditarik tetap diambil acak dari sub-set deck
     yang sesuai (memenuhi arah / tidak memenuhi arah), jadi kartu
     yang muncul tetap kerasa random ke user.
══════════════════════════════════════ */

const HiLo = (() => {

  const HOUSE_EDGE = 0.04;
  const MULT_CAP    = 10;   // HARUS sama dengan MAX_GAME_MULTIPLIER.hilo di app.js & gacha-update.js

  const SUITS = ['♠','♥','♦','♣'];
  const RED_SUITS = new Set(['♥','♦']);
  /* value 1-13 dipakai buat compare; A = paling rendah (beda dari blackjack) */
  const RANK_ORDER = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

  /* ── State ── */
  let _gacha       = null;
  let _onResult    = null;
  let _bet         = 0;
  let _done        = false;
  let _busy        = false;
  let _isWinPath   = true;
  let _safeTarget  = 0;
  let _streak      = 0;
  let _cumProb     = 1;     // produk probabilitas asli tiap tebakan benar
  let _deck        = [];
  let _current     = null;  // kartu yang sedang ditampilkan

  /* ────────────────────────────────────
     DECK HELPERS
  ──────────────────────────────────── */
  function _buildDeck() {
    const d = [];
    for (const s of SUITS) {
      RANK_ORDER.forEach((r, i) => d.push({ suit: s, rank: r, value: i + 1 }));
    }
    for (let i = d.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [d[i], d[j]] = [d[j], d[i]];
    }
    return d;
  }

  function _multiplierFromCumProb() {
    if (_cumProb >= 1) return 1;
    return Math.min(MULT_CAP, (1 / _cumProb) * (1 - HOUSE_EDGE));
  }

  /* ── Render kartu HTML (reuse style .bj-card dari blackjack.js) ── */
  function _cardHTML(card, hidden = false) {
    if (hidden || !card) {
      return `<div class="bj-card bj-card-back"><div class="bj-card-inner">🂠</div></div>`;
    }
    const isRed = RED_SUITS.has(card.suit);
    const FACE  = { 'J': '🤴', 'Q': '👸', 'K': '🤴', 'A': '★' };
    const faceEl = FACE[card.rank]
      ? `<div class="bj-card-face">${FACE[card.rank]}</div>`
      : `<div class="bj-card-suit">${card.suit}</div>`;
    return `<div class="bj-card ${isRed ? 'bj-card-red' : 'bj-card-black'} bj-card-deal hilo-card">
      <div class="bj-card-rank-top">${card.rank}</div>
      ${faceEl}
      <div class="bj-card-rank-bot">${card.rank}</div>
    </div>`;
  }

  /* ────────────────────────────────────
     RENDER UTAMA
  ──────────────────────────────────── */
  function _render() {
    const area = document.createElement('div');
    area.id        = 'gameArea';
    area.className = 'game-area slide-in';
    area.innerHTML = `
      <div class="hilo-card-wrap" id="hiloWrap">
        <div class="slot-section-label">🔮 Hi-Lo</div>

        <div class="hilo-multi" id="hiloMulti">1.00x</div>
        <div class="hilo-hud" id="hiloHud">Bet: ${_bet} bet — tebak kartu berikutnya</div>

        <div class="hilo-table">
          <div class="hilo-slot">
            <div class="hilo-slot-label">SEKARANG</div>
            <div id="hiloCurrentCard">${_cardHTML(_current)}</div>
          </div>
          <div class="hilo-vs">VS</div>
          <div class="hilo-slot">
            <div class="hilo-slot-label">BERIKUTNYA</div>
            <div id="hiloNextCard">${_cardHTML(null, true)}</div>
          </div>
        </div>

        <div class="hilo-actions">
          <button class="hilo-btn hilo-btn-lo" id="hiloLoBtn" onclick="HiLo.guess('lo')">⬇ LEBIH RENDAH</button>
          <button class="hilo-btn hilo-btn-hi" id="hiloHiBtn" onclick="HiLo.guess('hi')">⬆ LEBIH TINGGI</button>
        </div>

        <button class="mines-cashout-btn" id="hiloCashoutBtn" onclick="HiLo.cashout()" disabled>
          💰 CASHOUT
        </button>
      </div>
    `;

    const infoCard  = document.getElementById('gachaInfoCard');
    const existGame = document.getElementById('gameArea');
    if (infoCard)       infoCard.replaceWith(area);
    else if (existGame) existGame.replaceWith(area);
    else document.querySelector('.glass-card').insertAdjacentElement('afterend', area);

    _updateButtonAvailability();
  }

  /* Nonaktifkan arah yang mustahil (kartu sekarang King -> HI mustahil, Ace -> LO mustahil) */
  function _updateButtonAvailability() {
    const hiBtn = document.getElementById('hiloHiBtn');
    const loBtn = document.getElementById('hiloLoBtn');
    if (!hiBtn || !loBtn || !_current) return;
    const hasHigher = _deck.some(c => c.value > _current.value);
    const hasLower  = _deck.some(c => c.value < _current.value);
    hiBtn.disabled = _busy || _done || !hasHigher;
    loBtn.disabled = _busy || _done || !hasLower;
  }

  /* ────────────────────────────────────
     GUESS
  ──────────────────────────────────── */
  async function guess(direction) {
    if (_done || _busy || !_current) return;
    const hiBtn = document.getElementById('hiloHiBtn');
    const loBtn = document.getElementById('hiloLoBtn');
    if ((direction === 'hi' && hiBtn?.disabled) || (direction === 'lo' && loBtn?.disabled)) return;

    _busy = true;
    if (hiBtn) hiBtn.disabled = true;
    if (loBtn) loBtn.disabled = true;
    window.setStatus('🔮 Membuka kartu...', true);

    const satisfying    = _deck.filter(c => direction === 'hi' ? c.value > _current.value : c.value < _current.value);
    const notSatisfying = _deck.filter(c => !(direction === 'hi' ? c.value > _current.value : c.value < _current.value));
    const trueProb = satisfying.length / _deck.length;

    /* Tentukan apakah tebakan ini "dipaksa benar" berdasarkan predetermined path */
    let forcedCorrect;
    if (_streak < _safeTarget) forcedCorrect = true;
    else forcedCorrect = Math.random() < (_isWinPath ? 0.55 : 0.20);

    /* Kalau pool yang dibutuhkan kosong (mustahil secara matematis), paksa hasil sesuai pool yang ada */
    let pool = forcedCorrect ? satisfying : notSatisfying;
    if (pool.length === 0) pool = forcedCorrect ? notSatisfying : satisfying;

    const pickedIdx  = Math.floor(Math.random() * pool.length);
    const nextCard   = pool[pickedIdx];
    _deck.splice(_deck.indexOf(nextCard), 1);

    const isCorrect = direction === 'hi' ? nextCard.value > _current.value : nextCard.value < _current.value;

    const nextEl = document.getElementById('hiloNextCard');
    if (nextEl) nextEl.innerHTML = _cardHTML(nextCard);
    SFX.hilo.flip();
    await new Promise(r => setTimeout(r, 500));

    if (!isCorrect) {
      window.setStatus('💀 Kalah...', false);
      SFX.hilo.wrong();
      const hud = document.getElementById('hiloHud');
      if (hud) hud.textContent = `${nextCard.rank}${nextCard.suit} — tebakan salah. Game over.`;
      document.getElementById('hiloWrap')?.classList.add('hilo-result-lose');
      await new Promise(r => setTimeout(r, 1000));
      _finish(false, 0);
      return;
    }

    _cumProb *= trueProb;
    _streak++;
    _current = nextCard;

    /* Pindahkan kartu baru ke slot "sekarang", kosongkan slot "berikutnya" */
    const curEl = document.getElementById('hiloCurrentCard');
    if (curEl)  curEl.innerHTML  = _cardHTML(_current);
    if (nextEl) nextEl.innerHTML = _cardHTML(null, true);

    const mult = _multiplierFromCumProb();
    const multE = document.getElementById('hiloMulti');
    const hud   = document.getElementById('hiloHud');
    const cashoutBtn = document.getElementById('hiloCashoutBtn');
    if (multE) multE.textContent = mult.toFixed(2) + 'x';
    if (hud)   hud.textContent   = `✅ Benar! Streak ${_streak}`;
    if (cashoutBtn) cashoutBtn.disabled = false;

    window.setStatus(`✅ Benar! Multiplier ${mult.toFixed(2)}x`, true);
    SFX.hilo.correct();

    /* Auto-cashout kalau sudah kena cap atau deck mau habis */
    if (mult >= MULT_CAP || _deck.length <= 2) {
      await new Promise(r => setTimeout(r, 500));
      await cashout();
      return;
    }

    _busy = false;
    _updateButtonAvailability();
  }

  /* ────────────────────────────────────
     CASHOUT
  ──────────────────────────────────── */
  async function cashout() {
    if (_done || _streak <= 0) return;
    _busy = true;
    _done = true;

    document.getElementById('hiloHiBtn')?.setAttribute('disabled', 'true');
    document.getElementById('hiloLoBtn')?.setAttribute('disabled', 'true');
    document.getElementById('hiloCashoutBtn')?.setAttribute('disabled', 'true');

    const mult  = _multiplierFromCumProb();
    const winRp = Math.floor(_bet * mult) * 1000;

    const hud = document.getElementById('hiloHud');
    if (hud) hud.textContent = `🏆 Cashout di ${mult.toFixed(2)}x!`;
    document.getElementById('hiloWrap')?.classList.add('hilo-result-win');

    window.setStatus(`🏆 MENANG ${mult.toFixed(2)}x!`, true);
    SFX.hilo.cashout();
    await new Promise(r => setTimeout(r, 1200));
    _onResult(true, winRp);
  }

  /* ────────────────────────────────────
     FINISH (kalah)
  ──────────────────────────────────── */
  function _finish(won, winRp) {
    if (_done && won === false && winRp === 0 && _streak === 0) { /* no-op guard */ }
    _done = true;
    _onResult(won, winRp);
  }

  /* ────────────────────────────────────
     PUBLIC: INIT
  ──────────────────────────────────── */
  function init(gacha, onResult) {
    _gacha      = gacha;
    _onResult   = onResult;
    _bet        = gacha.betAmount || 0;
    _done       = false;
    _busy       = false;
    _streak     = 0;
    _cumProb    = 1;
    _isWinPath  = gacha.result === 'win';

    _deck = _buildDeck();
    _current = _deck.pop();

    /* Ambang streak benar terjamin, sama pola dengan mines.js _safeTarget */
    _safeTarget = _isWinPath
      ? 3 + Math.floor(Math.random() * 3) // 3-5 saat WIN
      : 0 + Math.floor(Math.random() * 3); // 0-2 saat LOSE

    _render();
  }

  return { init, guess, cashout };
})();
