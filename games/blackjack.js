/* ══════════════════════════════════════
   GAME: BLACKJACK
   Expose: Blackjack.init(gacha, onResult)

   RULES:
   - Deck 52 kartu standar
   - Player vs Dealer
   - Target: nilai hand mendekati 21 tanpa bust
   - Ace = 11 atau 1 (otomatis)
   - Dealer hit sampai ≥ 17
   - Blackjack (21 dari 2 kartu) = menang langsung
   - Bust (>21) = kalah langsung
   - Push (seri) = bet dikembalikan → dihitung lose di sistem
══════════════════════════════════════ */

const Blackjack = (() => {

  /* ── State ── */
  let _gacha    = null;
  let _onResult = null;
  let _done     = false;

  let _deck         = [];
  let _playerHand   = [];
  let _dealerHand   = [];
  let _phase        = 'idle'; // idle | player | dealer | done
  let _isWin        = false;
  let _animLock     = false;  // cegah double-click saat animasi

  /* ── Kartu ── */
  const SUITS  = ['♠','♥','♦','♣'];
  const RANKS  = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  const RED_SUITS = new Set(['♥','♦']);

  function _buildDeck() {
    const d = [];
    for (const s of SUITS)
      for (const r of RANKS)
        d.push({ suit: s, rank: r });
    // Fisher-Yates shuffle
    for (let i = d.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [d[i], d[j]] = [d[j], d[i]];
    }
    return d;
  }

  function _cardValue(rank) {
    if (['J','Q','K'].includes(rank)) return 10;
    if (rank === 'A') return 11;
    return parseInt(rank);
  }

  function _handValue(hand) {
    let val  = 0;
    let aces = 0;
    for (const c of hand) {
      val += _cardValue(c.rank);
      if (c.rank === 'A') aces++;
    }
    while (val > 21 && aces > 0) { val -= 10; aces--; }
    return val;
  }

  function _isBust(hand)       { return _handValue(hand) > 21; }
  function _isBlackjack(hand)  { return hand.length === 2 && _handValue(hand) === 21; }

  /* ── Render kartu HTML ── */
  function _cardHTML(card, hidden = false) {
    if (hidden) {
      return `<div class="bj-card bj-card-back">
        <div class="bj-card-inner">🂠</div>
      </div>`;
    }
    const isRed  = RED_SUITS.has(card.suit);
    const FACE   = { 'J': '🤴', 'Q': '👸', 'K': '🤴', 'A': '★' };
    const faceEl = FACE[card.rank]
      ? `<div class="bj-card-face">${FACE[card.rank]}</div>`
      : `<div class="bj-card-suit">${card.suit}</div>`;
    return `<div class="bj-card ${isRed ? 'bj-card-red' : 'bj-card-black'} bj-card-deal">
      <div class="bj-card-rank-top">${card.rank}</div>
      ${faceEl}
      <div class="bj-card-rank-bot">${card.rank}</div>
    </div>`;
  }

  /* ── Update tampilan hand ── */
  function _renderHands(hideDealer2 = true) {
    const dEl = document.getElementById('bjDealerCards');
    const pEl = document.getElementById('bjPlayerCards');
    const dVal = document.getElementById('bjDealerVal');
    const pVal = document.getElementById('bjPlayerVal');
    if (!dEl || !pEl) return;

    dEl.innerHTML = _dealerHand.map((c, i) =>
      (i === 1 && hideDealer2) ? _cardHTML(c, true) : _cardHTML(c)
    ).join('');

    pEl.innerHTML = _playerHand.map(c => _cardHTML(c)).join('');

    const pv = _handValue(_playerHand);
    if (pVal) {
      pVal.textContent = pv;
      pVal.className = 'bj-hand-val' + (pv > 21 ? ' bust' : pv === 21 ? ' bj' : '');
    }

    if (dVal) {
      if (hideDealer2) {
        const firstVal = _cardValue(_dealerHand[0]?.rank ?? '2');
        dVal.textContent = firstVal + '+?';
        dVal.className = 'bj-hand-val';
      } else {
        const dv = _handValue(_dealerHand);
        dVal.textContent = dv;
        dVal.className = 'bj-hand-val' + (dv > 21 ? ' bust' : dv === 21 ? ' bj' : '');
      }
    }
  }

  /* ── Set tombol aktif/nonaktif ── */
  function _setButtons(hitEnabled, standEnabled, doubleEnabled) {
    const hit    = document.getElementById('bjHitBtn');
    const stand  = document.getElementById('bjStandBtn');
    const dbl    = document.getElementById('bjDoubleBtn');
    if (hit)   hit.disabled   = !hitEnabled;
    if (stand) stand.disabled = !standEnabled;
    if (dbl)   dbl.disabled   = !doubleEnabled;
  }

  /* ── Status text ── */
  function _setStatus(msg, color = '') {
    const el = document.getElementById('bjStatus');
    if (!el) return;
    el.textContent  = msg;
    el.style.color  = color || 'var(--text-secondary)';
  }

  /* ── Render HTML utama ── */
  function _render() {
    const old = document.getElementById('gameArea');
    if (old) old.remove();
    const infoCard = document.getElementById('gachaInfoCard');

    const area = document.createElement('div');
    area.id        = 'gameArea';
    area.className = 'game-area slide-in';

    area.innerHTML = `
      <div class="bj-card-wrap" id="bjWrap">

        <div class="bj-section-label">🃏 BLACKJACK</div>

        <!-- Dealer -->
        <div class="bj-side dealer">
          <div class="bj-side-label">
            DEALER
            <span class="bj-hand-val" id="bjDealerVal">—</span>
          </div>
          <div class="bj-cards" id="bjDealerCards"></div>
        </div>

        <!-- Divider -->
        <div class="bj-divider">
          <div class="bj-divider-line"></div>
          <div class="bj-divider-chip">VS</div>
          <div class="bj-divider-line"></div>
        </div>

        <!-- Player -->
        <div class="bj-side player">
          <div class="bj-side-label">
            KAMU
            <span class="bj-hand-val" id="bjPlayerVal">—</span>
          </div>
          <div class="bj-cards" id="bjPlayerCards"></div>
        </div>

        <!-- Status -->
        <div class="bj-status" id="bjStatus">Dealing kartu...</div>

        <!-- Actions -->
        <div class="bj-actions" id="bjActions">
          <button class="bj-btn bj-btn-hit"    id="bjHitBtn"    onclick="Blackjack.hit()"    disabled>HIT</button>
          <button class="bj-btn bj-btn-stand"  id="bjStandBtn"  onclick="Blackjack.stand()"  disabled>STAND</button>
          <button class="bj-btn bj-btn-double" id="bjDoubleBtn" onclick="Blackjack.double()" disabled>DOUBLE</button>
        </div>

        <!-- Info -->
        <div class="bj-info-row">
          <div class="bj-info-item">
            <span class="bj-info-label">Taruhan</span>
            <span class="bj-info-val gold">${Number(_gacha.money).toLocaleString('id-ID')} Rp</span>
          </div>
          <div class="bj-info-item">
            <span class="bj-info-label">Menang = 2×</span>
            <span class="bj-info-val">Blackjack = 2×</span>
          </div>
        </div>

        <!-- Rules -->
        <div class="bj-rules">
          <div class="bj-rules-title">📖 Rules</div>
          <div class="bj-rules-body">
            <span>HIT — ambil kartu</span>
            <span>STAND — cukup, giliran dealer</span>
            <span>DOUBLE — bet 2×, dapat 1 kartu lagi</span>
            <span>Dealer wajib HIT sampai ≥ 17</span>
            <span>Bust (&gt;21) = kalah</span>
          </div>
        </div>

      </div>
    `;

    if (infoCard) infoCard.replaceWith(area);
    else document.querySelector('.glass-card').insertAdjacentElement('afterend', area);
  }

  /* ── Deal awal ── */
  async function _dealInitial() {
    window.setTokenSlotMode('hidden'); // Sembunyikan tombol back begitu dealing dimulai
    _deck       = _buildDeck();
    _playerHand = [];
    _dealerHand = [];

    // Deal: player, dealer, player, dealer (pakai interval biar berasa)
    const order = [
      { target: _playerHand },
      { target: _dealerHand },
      { target: _playerHand },
      { target: _dealerHand },
    ];

    for (const o of order) {
      o.target.push(_deck.pop());
      SFX.blackjack.deal();
      _renderHands(true);
      await _delay(280);
    }

    const pv = _handValue(_playerHand);
    const playerBJ = _isBlackjack(_playerHand);

    if (playerBJ) {
      _setStatus('🃏 BLACKJACK! Menang!', 'var(--win-green)');
      SFX.blackjack.blackjack();
      _renderHands(false);
      await _delay(1200);
      _finish(true);
      return;
    }

    _phase = 'player';
    _setStatus('Giliran kamu — HIT, STAND, atau DOUBLE?');
    _setButtons(true, true, true);
  }

  /* ── Hit ── */
  async function hit() {
    if (_phase !== 'player' || _animLock || _done) return;
    _animLock = true;
    _setButtons(false, false, false);

    _playerHand.push(_deck.pop());
    SFX.blackjack.deal();
    _renderHands(true);
    await _delay(250);

    const pv = _handValue(_playerHand);
    if (_isBust(_playerHand)) {
      _setStatus(`💥 Bust! Total ${pv}`, 'var(--lose-red)');
      SFX.blackjack.bust();
      _renderHands(false);
      await _delay(1000);
      _finish(false);
      return;
    }

    if (pv === 21) {
      _setStatus('21! Langsung stand.', 'var(--gold)');
      _animLock = false;
      await _delay(300);
      stand();
      return;
    }

    _animLock = false;
    _setStatus(`Total kamu: ${pv} — lanjut?`);
    _setButtons(true, true, false);
  }

  /* ── Stand ── */
  async function stand() {
    if (_phase !== 'player' || _done) return;
    _phase    = 'dealer';
    _animLock = true;
    _setButtons(false, false, false);
    _setStatus('Giliran dealer...');

    // Buka kartu dealer
    _renderHands(false);
    await _delay(600);

    // Dealer hit sampai ≥ 17
    while (_handValue(_dealerHand) < 17) {
      _dealerHand.push(_deck.pop());
      SFX.blackjack.deal();
      _renderHands(false);
      _setStatus(`Dealer: ${_handValue(_dealerHand)}`);
      await _delay(600);
    }

    const pv = _handValue(_playerHand);
    const dv = _handValue(_dealerHand);

    let playerWins;
    if (_isBust(_dealerHand)) {
      _setStatus(`Dealer bust ${dv}! Kamu menang!`, 'var(--win-green)');
      playerWins = true;
    } else if (pv > dv) {
      _setStatus(`${pv} vs ${dv} — Kamu menang!`, 'var(--win-green)');
      playerWins = true;
    } else if (dv > pv) {
      _setStatus(`${pv} vs ${dv} — Dealer menang`, 'var(--lose-red)');
      playerWins = false;
    } else {
      _setStatus(`${pv} vs ${dv} — Seri! Bet kembali 🤝`, 'var(--gold)');
      playerWins = true; // seri = menang (bet dikembalikan = tidak rugi)
    }

    await _delay(1200);
    _finish(playerWins);
  }

  /* ── Double ── */
  async function double() {
    if (_phase !== 'player' || _animLock || _done) return;
    _animLock = true;
    _setButtons(false, false, false);
    _setStatus('DOUBLE — dapat 1 kartu lagi!');

    _playerHand.push(_deck.pop());
    SFX.blackjack.deal();
    _renderHands(true);
    await _delay(400);

    const pv = _handValue(_playerHand);
    if (_isBust(_playerHand)) {
      _setStatus(`💥 Bust! Total ${pv}`, 'var(--lose-red)');
      SFX.blackjack.bust();
      _renderHands(false);
      await _delay(1000);
      _finish(false);
      return;
    }

    _setStatus(`Total: ${pv} — Dealer giliran.`);
    await _delay(400);
    _animLock = false;
    stand();
  }

  /* ── Finish ── */
  function _finish(playerWins) {
    if (_done) return;
    _done   = true;
    _phase  = 'done';
    window.setStatus(playerWins ? '🏆 MENANG!' : '💀 Kalah...', playerWins);
    playerWins ? SFX.blackjack.win() : SFX.blackjack.lose();

    // Highlight hasil
    const wrap = document.getElementById('bjWrap');
    if (wrap) {
      wrap.classList.add(playerWins ? 'bj-result-win' : 'bj-result-lose');
    }

    setTimeout(() => { _onResult(playerWins, _gacha.money); }, 1400);
  }

  function _delay(ms) { return new Promise(r => setTimeout(r, ms)); }

  /* ── Public: Init ── */
  function init(gacha, onResult) {
    _gacha    = gacha;
    _onResult = onResult;
    _done     = false;
    _animLock = false;
    _phase    = 'idle';
    _isWin    = gacha.result === 'win';

    _render();
    setTimeout(_dealInitial, 400);
  }

  return { init, hit, stand, double };

})();
