/* ══════════════════════════════════════
   SFX — Shared Sound Effect Engine
   sfx.js

   Semua suara di-SINTESIS langsung pakai Web Audio API (oscillator +
   noise buffer) — TIDAK butuh file .mp3/.wav sama sekali. Tiap game
   panggil method-nya sendiri (SFX.mines.gem(), SFX.roulette.tick(), dst)
   biar kerasa beda-beda walau enginenya satu.

   Browser butuh user-gesture buat AudioContext nyala — dipanggil lazy
   di SFX._ctx() pas pertama kali ada yang mau muter suara (biasanya
   trigger pertama = klik tombol pilih game / submit token, jadi aman).

   Preferensi mute disimpan di localStorage, persist antar sesi.
══════════════════════════════════════ */
const SFX = (() => {

  const STORAGE_KEY = 'miwa_sfx_muted';
  let _ctx     = null;
  let _muted   = localStorage.getItem(STORAGE_KEY) === '1';
  let _master  = null;

  function ctx() {
    if (_ctx) return _ctx;
    try {
      _ctx = new (window.AudioContext || window.webkitAudioContext)();
      _master = _ctx.createGain();
      _master.gain.value = 0.35; // volume global, biar gak ngagetin
      _master.connect(_ctx.destination);
    } catch (e) { _ctx = null; }
    return _ctx;
  }

  function _resume() {
    const c = ctx();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
  }

  /* warmup() — panggil setelah user gesture, sebelum game mulai animasi.
     Ini force-resume AudioContext supaya tone pertama di game tidak
     kelewat akibat AudioContext masih suspended setelah jeda fetch. */
  function warmup() {
    const c = ctx();
    if (!c) return;
    if (c.state === 'suspended') {
      c.resume().catch(() => {});
    }
    /* Mainkan silent tone (volume 0) buat "unlock" audio pipeline di
       beberapa browser (terutama Safari & Chrome mobile). */
    const osc  = c.createOscillator();
    const gain = c.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + 0.001);
  }

  function isMuted() { return _muted; }

  function setMuted(val) {
    _muted = !!val;
    localStorage.setItem(STORAGE_KEY, _muted ? '1' : '0');
    document.dispatchEvent(new CustomEvent('sfxMuteChange', { detail: { muted: _muted } }));
  }

  function toggleMute() { setMuted(!_muted); return _muted; }

  /* ── Primitive: tone tunggal dengan envelope (attack-decay) ──
     freq      : Hz (atau array buat glide linear)
     dur       : detik
     type      : 'sine' | 'square' | 'sawtooth' | 'triangle'
     vol       : 0-1 (relatif ke master)
     delay     : detik, kapan mulai relatif ke "now" */
  function tone({ freq = 440, dur = 0.15, type = 'sine', vol = 1, delay = 0, glideTo = null }) {
    if (_muted) return;
    const c = ctx();
    if (!c) return;
    /* Jika masih suspended, resume dulu lalu defer sedikit supaya
       AudioContext benar-benar aktif sebelum node di-schedule */
    if (c.state === 'suspended') {
      c.resume().then(() => tone({ freq, dur, type, vol, delay: delay + 0.05, glideTo })).catch(() => {});
      return;
    }
    _resume();

    const t0 = c.currentTime + delay;
    const osc  = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Array.isArray(freq) ? freq[0] : freq, t0);
    if (glideTo !== null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), t0 + dur);
    } else if (Array.isArray(freq)) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, freq[1]), t0 + dur);
    }

    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + Math.min(0.01, dur * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);

    osc.connect(gain);
    gain.connect(_master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /* ── Primitive: white-noise burst (buat explosion/whoosh/static) ── */
  function noise({ dur = 0.2, vol = 1, delay = 0, filterFreq = null, filterType = 'lowpass' }) {
    if (_muted) return;
    const c = ctx();
    if (!c) return;
    if (c.state === 'suspended') {
      c.resume().then(() => noise({ dur, vol, delay: delay + 0.05, filterFreq, filterType })).catch(() => {});
      return;
    }
    _resume();

    const t0 = c.currentTime + delay;
    const bufferSize = Math.max(1, Math.floor(c.sampleRate * dur));
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const src  = c.createBufferSource();
    src.buffer = buffer;
    const gain = c.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);

    let node = src;
    if (filterFreq) {
      const filt = c.createBiquadFilter();
      filt.type = filterType;
      filt.frequency.value = filterFreq;
      src.connect(filt);
      node = filt;
    }
    node.connect(gain);
    gain.connect(_master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  /* ── Sequence: beberapa tone berurutan, buat arpeggio menang/kalah ── */
  function sequence(notes, gap = 0.09) {
    notes.forEach((n, i) => tone({ ...n, delay: (n.delay || 0) + i * gap }));
  }

  /* ────────────────────────────────────
     GENERIC (dipakai semua game / UI umum)
  ──────────────────────────────────── */
  const generic = {
    click()  { tone({ freq: 720, dur: 0.05, type: 'square', vol: 0.25 }); },
    select() { tone({ freq: 520, dur: 0.07, type: 'triangle', vol: 0.3 }); },
    error()  { tone({ freq: 160, dur: 0.18, type: 'sawtooth', vol: 0.3 }); },
    win() {
      sequence([
        { freq: 523, type: 'triangle', dur: 0.16, vol: 0.32 },
        { freq: 659, type: 'triangle', dur: 0.16, vol: 0.32 },
        { freq: 784, type: 'triangle', dur: 0.16, vol: 0.32 },
        { freq: 1047, type: 'triangle', dur: 0.28, vol: 0.36 },
      ], 0.1);
    },
    lose() {
      tone({ freq: [220, 90], dur: 0.45, type: 'sawtooth', vol: 0.28 });
    },
    coin() {
      sequence([
        { freq: 1318, type: 'square', dur: 0.07, vol: 0.22 },
        { freq: 1568, type: 'square', dur: 0.12, vol: 0.24 },
      ], 0.06);
    },
  };

  /* ────────────────────────────────────
     PER-GAME SIGNATURE SFX
  ──────────────────────────────────── */
  const roulette = {
    spinStart() { tone({ freq: 300, dur: 0.3, type: 'sawtooth', vol: 0.2, glideTo: 700 }); },
    tick()      { tone({ freq: 900, dur: 0.025, type: 'square', vol: 0.15 }); },
    drop()      { noise({ dur: 0.12, vol: 0.3, filterFreq: 500 }); },
    win()  { generic.win(); },
    lose() { generic.lose(); },
  };

  const coinflip = {
    flip()  { tone({ freq: [400, 1200], dur: 0.4, type: 'sine', vol: 0.25 }); },
    land()  { noise({ dur: 0.08, vol: 0.25, filterFreq: 800 }); },
    win()   { generic.coin(); },
    lose()  { generic.lose(); },
  };

  const airplane = {
    engineStart() { tone({ freq: 90, dur: 0.5, type: 'sawtooth', vol: 0.2, glideTo: 220 }); },
    ascend()      { tone({ freq: 200, dur: 0.12, type: 'sawtooth', vol: 0.07 }); },
    cashout()     { generic.coin(); },
    crash()       { noise({ dur: 0.5, vol: 0.4, filterFreq: 300 }); tone({ freq: 140, dur: 0.4, type: 'square', vol: 0.25 }); },
  };

  const horserace = {
    gallop()  { noise({ dur: 0.05, vol: 0.18, filterFreq: 1200, filterType: 'bandpass' }); },
    fanfare() { generic.win(); },
    lose()    { generic.lose(); },
  };

  const blackjack = {
    deal()      { tone({ freq: 1200, dur: 0.04, type: 'square', vol: 0.18 }); },
    bust()      { tone({ freq: [300, 80], dur: 0.35, type: 'sawtooth', vol: 0.28 }); },
    blackjack() { generic.win(); },
    win()       { generic.win(); },
    lose()      { generic.lose(); },
  };

  const plinko = {
    pin()  { tone({ freq: 700 + Math.random() * 400, dur: 0.04, type: 'triangle', vol: 0.16 }); },
    drop() { tone({ freq: 500, dur: 0.08, type: 'sine', vol: 0.2 }); },
    win()  { generic.coin(); },
    lose() { generic.lose(); },
  };

  const mines = {
    reveal()  { tone({ freq: 480, dur: 0.06, type: 'square', vol: 0.2 }); },
    gem()     { tone({ freq: 900, dur: 0.1, type: 'sine', vol: 0.28, glideTo: 1300 }); },
    bomb()    { noise({ dur: 0.5, vol: 0.45, filterFreq: 350 }); tone({ freq: 110, dur: 0.4, type: 'square', vol: 0.3 }); },
    cashout() { generic.coin(); },
  };

  const reelsgird = {
    spin()    { tone({ freq: 250, dur: 0.25, type: 'sawtooth', vol: 0.16, glideTo: 500 }); },
    reelStop(){ tone({ freq: 200, dur: 0.06, type: 'square', vol: 0.22 }); },
    win()     { generic.win(); },
    lose()    { generic.lose(); },
  };

  const wheel = {
    spinStart() { tone({ freq: 200, dur: 0.3, type: 'sawtooth', vol: 0.18, glideTo: 650 }); },
    tick()      { tone({ freq: 650, dur: 0.02, type: 'square', vol: 0.14 }); },
    win()       { generic.win(); },
    lose()      { generic.lose(); },
  };

  const hilo = {
    flip()    { tone({ freq: 1100, dur: 0.05, type: 'square', vol: 0.18 }); },
    correct() { tone({ freq: 800, dur: 0.12, type: 'sine', vol: 0.28, glideTo: 1100 }); },
    wrong()   { tone({ freq: [320, 100], dur: 0.4, type: 'sawtooth', vol: 0.28 }); },
    cashout() { generic.coin(); },
  };

  return {
    ctx, warmup, isMuted, setMuted, toggleMute,
    tone, noise, sequence,
    generic, roulette, coinflip, airplane, horserace,
    blackjack, plinko, mines, reelsgird, wheel, hilo,
  };
})();
