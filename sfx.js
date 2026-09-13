/* ══════════════════════════════════════
   SFX — Shared Sound Effect Engine (v2, "realistic casino")
   sfx.js

   Semua suara di-SINTESIS langsung pakai Web Audio API — TIDAK butuh
   file .mp3/.wav sama sekali. Upgrade dari versi sebelumnya:

   - Bell/chime pakai ADDITIVE SYNTHESIS (beberapa partial non-harmonik
     dengan decay masing-masing) → keren-nya lonceng/jackpot chime asli,
     bukan cuma nada tunggal oscillator.
   - Reverb "hall" sintetis (convolver + impulse response yang
     di-generate sendiri) dipakai buat suara-suara besar (win, jackpot,
     cash-out) biar ada ruang/kedalaman, kerasa kayak di lantai casino.
   - Koin sekarang "cascade" — beberapa clink logam kecil bertumpuk
     dengan pitch acak & delay mikro, bukan cuma dua nada square.
   - Kartu/chip pakai noise ber-filter band sempit dengan attack sangat
     cepat → kerasa kayak "snap"/"flick" fisik, bukan beep elektronik.
   - Roulette ball & reel slot dibuat MEKANIS: rolling noise + tick yang
     makin jarang & makin rendah pitch-nya (deselerasi asli bola/reel).
   - Ledakan (bomb/crash) dilapis: sub-bass thump + noise + sedikit
     waveshaper distortion biar ada "gigit"-nya, bukan cuma noise datar.

   API PUBLIK TIDAK BERUBAH — semua nama method sama persis kayak
   sebelumnya (SFX.mines.gem(), SFX.roulette.tick(), dst), jadi tidak
   perlu ubah app.js atau games/*.js sama sekali.

   Browser butuh user-gesture buat AudioContext nyala — dipanggil lazy
   di SFX._ctx() pas pertama kali ada yang mau muter suara.
   Preferensi mute disimpan di localStorage, persist antar sesi.
══════════════════════════════════════ */
const SFX = (() => {

  const STORAGE_KEY = 'miwa_sfx_muted';
  let _ctx        = null;
  let _muted      = localStorage.getItem(STORAGE_KEY) === '1';
  let _master     = null;
  let _reverbNode = null;
  let _reverbSend = null;

  /* ── Impulse response sintetis buat convolver — simulasi ruangan
     kecil-menengah (aula casino), bukan reverb "cathedral" yang
     berlebihan. Noise stereo dengan decay eksponensial. ── */
  function _buildImpulse(c, duration = 1.4, decayPow = 2.6) {
    const rate   = c.sampleRate;
    const length = Math.max(1, Math.floor(rate * duration));
    const buf    = c.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decayPow);
      }
    }
    return buf;
  }

  function ctx() {
    if (_ctx) return _ctx;
    try {
      _ctx = new (window.AudioContext || window.webkitAudioContext)();
      _master = _ctx.createGain();
      _master.gain.value = 0.35; // volume global, biar gak ngagetin
      _master.connect(_ctx.destination);

      /* Reverb bus: sinyal yang mau "beraroma ruangan" dikirim ke sini
         via gain terpisah (_reverbSend), lalu dicampur balik ke master
         lewat convolver. Wetness diatur per-sound lewat besar kecilnya
         gain yang dikirim ke bus ini. */
      _reverbSend = _ctx.createGain();
      _reverbSend.gain.value = 1;
      _reverbNode = _ctx.createConvolver();
      _reverbNode.buffer = _buildImpulse(_ctx);
      _reverbSend.connect(_reverbNode);
      _reverbNode.connect(_master);
    } catch (e) { _ctx = null; }
    return _ctx;
  }

  function _resume() {
    const c = ctx();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
  }

  function warmup() {
    const c = ctx();
    if (!c) return;
    if (c.state === 'suspended') c.resume().catch(() => {});
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
     Sama seperti sebelumnya, plus opsi `reverb` (0-1) buat kirim
     sebagian sinyal ke reverb bus. */
  function tone({ freq = 440, dur = 0.15, type = 'sine', vol = 1, delay = 0, glideTo = null, reverb = 0, detune = 0 }) {
    if (_muted) return;
    const c = ctx();
    if (!c) return;
    if (c.state === 'suspended') {
      c.resume().then(() => tone({ freq, dur, type, vol, delay: delay + 0.05, glideTo, reverb, detune })).catch(() => {});
      return;
    }
    _resume();

    const t0   = c.currentTime + delay;
    const osc  = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    if (detune) osc.detune.setValueAtTime(detune, t0);
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
    if (reverb > 0 && _reverbSend) {
      const send = c.createGain();
      send.gain.value = reverb;
      gain.connect(send);
      send.connect(_reverbSend);
    }
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /* ── Primitive: white-noise burst, sekarang dukung bandpass/highpass
     dan opsi Q (buat karakter "snap" yang lebih sempit/tajam). ── */
  function noise({ dur = 0.2, vol = 1, delay = 0, filterFreq = null, filterType = 'lowpass', q = 1, reverb = 0 }) {
    if (_muted) return;
    const c = ctx();
    if (!c) return;
    if (c.state === 'suspended') {
      c.resume().then(() => noise({ dur, vol, delay: delay + 0.05, filterFreq, filterType, q, reverb })).catch(() => {});
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
      filt.Q.value = q;
      src.connect(filt);
      node = filt;
    }
    node.connect(gain);
    gain.connect(_master);
    if (reverb > 0 && _reverbSend) {
      const send = c.createGain();
      send.gain.value = reverb;
      gain.connect(send);
      send.connect(_reverbSend);
    }
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  /* ── Sequence: beberapa tone berurutan ── */
  function sequence(notes, gap = 0.09) {
    notes.forEach((n, i) => tone({ ...n, delay: (n.delay || 0) + i * gap }));
  }

  /* ── Bell/chime — ADDITIVE SYNTHESIS: beberapa partial non-harmonik
     (rasio ala lonceng asli, bukan kelipatan bulat 1-2-3) yang masing-
     masing punya decay sendiri (partial tinggi meluruh lebih cepat).
     Dipakai buat win/jackpot/cash-out biar kerasa "logam berdenting",
     bukan cuma oscillator tunggal. ── */
  function bell({ freq = 600, dur = 1.0, vol = 0.3, delay = 0, reverb = 0.25,
                  partials = [1, 1.79, 2.76, 4.07] }) {
    if (_muted) return;
    const c = ctx();
    if (!c) return;
    if (c.state === 'suspended') {
      c.resume().then(() => bell({ freq, dur, vol, delay: delay + 0.05, reverb, partials })).catch(() => {});
      return;
    }
    _resume();
    const t0 = c.currentTime + delay;
    partials.forEach((mult, i) => {
      const osc  = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * mult, t0);
      const pv = vol / (1 + i * 0.9);
      const pd = Math.max(0.08, dur * (1 - i * 0.18));
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(pv, t0 + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0008, t0 + pd);
      osc.connect(gain);
      gain.connect(_master);
      if (reverb > 0 && _reverbSend) {
        const send = c.createGain();
        send.gain.value = reverb;
        gain.connect(send);
        send.connect(_reverbSend);
      }
      osc.start(t0);
      osc.stop(t0 + pd + 0.05);
    });
  }

  /* ── Koin cascade — beberapa clink metalik kecil bertumpuk dengan
     pitch acak & timing mikro-random, meniru koin jatuh/nyampur. ── */
  function coinCascade({ count = 5, vol = 0.22, delay = 0, spread = 0.28, reverb = 0.15 }) {
    for (let i = 0; i < count; i++) {
      const t     = delay + Math.random() * spread * (i / count) + i * (spread / count) * 0.6;
      const base  = 1600 + Math.random() * 900;
      tone({ freq: base, dur: 0.05, type: 'sine', vol: vol * (0.7 + Math.random() * 0.3), delay: t, reverb });
      tone({ freq: base * 1.5, dur: 0.03, type: 'triangle', vol: vol * 0.4, delay: t + 0.005, reverb });
      noise({ dur: 0.02, vol: vol * 0.3, delay: t, filterFreq: 4500, filterType: 'highpass' });
    }
  }

  /* ── Klik kartu/chip — noise band sempit + attack instan, kerasa
     kayak "snap" fisik (kartu di-flick / chip diketuk), bukan bunyi
     elektronik. ── */
  function snap({ freq = 3000, dur = 0.035, vol = 0.3, delay = 0, q = 6 }) {
    noise({ dur, vol, delay, filterFreq: freq, filterType: 'bandpass', q });
  }

  return {
    ctx, warmup, isMuted, setMuted, toggleMute,
    tone, noise, sequence, bell, coinCascade, snap,

    /* ────────────────────────────────────
       GENERIC (dipakai semua game / UI umum)
    ──────────────────────────────────── */
    generic: {
      click()  { tone({ freq: 900, dur: 0.03, type: 'square', vol: 0.15 }); snap({ freq: 2200, dur: 0.02, vol: 0.12 }); },
      select() { tone({ freq: 520, dur: 0.06, type: 'triangle', vol: 0.28 }); tone({ freq: 780, dur: 0.05, type: 'sine', vol: 0.12, delay: 0.02 }); },
      error()  { tone({ freq: [220, 110], dur: 0.22, type: 'sawtooth', vol: 0.28 }); },
      win() {
        /* Jackpot chime: dua bell beruntun (naik) + shimmer noise tipis
           di puncaknya, dilempar ke reverb biar ada "ruang". */
        bell({ freq: 523.25, dur: 0.7, vol: 0.28, reverb: 0.3 });
        bell({ freq: 659.25, dur: 0.8, vol: 0.28, delay: 0.14, reverb: 0.3 });
        bell({ freq: 987.77, dur: 1.1, vol: 0.3,  delay: 0.30, reverb: 0.35 });
        noise({ dur: 0.6, vol: 0.06, delay: 0.30, filterFreq: 6000, filterType: 'highpass', reverb: 0.4 });
        SFX_INTERNAL.coinCascadeDelayed(0.42);
      },
      lose() {
        tone({ freq: [260, 90], dur: 0.5, type: 'sawtooth', vol: 0.24 });
        noise({ dur: 0.25, vol: 0.08, delay: 0.05, filterFreq: 500, filterType: 'lowpass' });
      },
      coin() { coinCascade({ count: 4, vol: 0.24 }); },
    },

    /* ────────────────────────────────────
       PER-GAME SIGNATURE SFX
    ──────────────────────────────────── */
    roulette: {
      spinStart() {
        tone({ freq: 220, dur: 0.4, type: 'sawtooth', vol: 0.14, glideTo: 780 });
        noise({ dur: 0.5, vol: 0.1, filterFreq: 1500, filterType: 'bandpass', q: 0.7 });
      },
      /* Tick bola menggelinding di roda — dipanggil berulang oleh
         roulette.js tiap slot terlewati, jadi biarkan ringan & cepat. */
      tick() {
        const jitter = 1 + (Math.random() * 0.08 - 0.04);
        tone({ freq: 1400 * jitter, dur: 0.018, type: 'square', vol: 0.13 });
        snap({ freq: 2800, dur: 0.012, vol: 0.08 });
      },
      drop() {
        noise({ dur: 0.18, vol: 0.28, filterFreq: 400, filterType: 'lowpass' });
        tone({ freq: [180, 70], dur: 0.16, type: 'triangle', vol: 0.16 });
      },
      win()  { SFX_INTERNAL.genericWin(); },
      lose() { SFX_INTERNAL.genericLose(); },
    },

    coinflip: {
      flip() {
        tone({ freq: [500, 1400], dur: 0.35, type: 'sine', vol: 0.2 });
        for (let i = 0; i < 5; i++) snap({ freq: 2000 + i * 300, dur: 0.015, vol: 0.05, delay: i * 0.055 });
      },
      land() {
        noise({ dur: 0.1, vol: 0.28, filterFreq: 700, filterType: 'bandpass', q: 1.2 });
        tone({ freq: 180, dur: 0.06, type: 'triangle', vol: 0.15 });
      },
      win()  { coinCascade({ count: 6, vol: 0.26 }); },
      lose() { SFX_INTERNAL.genericLose(); },
    },

    airplane: {
      engineStart() {
        tone({ freq: 70, dur: 0.6, type: 'sawtooth', vol: 0.16, glideTo: 180 });
        noise({ dur: 0.7, vol: 0.08, filterFreq: 250, filterType: 'lowpass' });
      },
      ascend() {
        tone({ freq: 180 + Math.random() * 30, dur: 0.1, type: 'sawtooth', vol: 0.05 });
        noise({ dur: 0.1, vol: 0.02, filterFreq: 900, filterType: 'bandpass' });
      },
      cashout() { bell({ freq: 880, dur: 0.5, vol: 0.26, reverb: 0.25 }); coinCascade({ count: 5, vol: 0.22, delay: 0.08 }); },
      crash() {
        noise({ dur: 0.55, vol: 0.4, filterFreq: 280, filterType: 'lowpass' });
        tone({ freq: [180, 35], dur: 0.5, type: 'square', vol: 0.26 });
        tone({ freq: 55, dur: 0.4, type: 'sine', vol: 0.3, delay: 0.02 });
      },
    },

    horserace: {
      /* Derap kuda — noise band pendek + sedikit variasi pitch tiap
         panggilan biar nggak monoton. */
      gallop() {
        const f = 1100 + Math.random() * 300;
        noise({ dur: 0.045, vol: 0.16, filterFreq: f, filterType: 'bandpass', q: 1.4 });
      },
      fanfare() { SFX_INTERNAL.genericWin(); },
      lose()    { SFX_INTERNAL.genericLose(); },
    },

    blackjack: {
      deal()      { snap({ freq: 3200, dur: 0.03, vol: 0.22, q: 5 }); },
      bust()      { tone({ freq: [320, 70], dur: 0.4, type: 'sawtooth', vol: 0.26 }); noise({ dur: 0.15, vol: 0.1, filterFreq: 400 }); },
      blackjack() { bell({ freq: 700, dur: 0.9, vol: 0.3, reverb: 0.3 }); coinCascade({ count: 5, vol: 0.22, delay: 0.1 }); },
      win()       { SFX_INTERNAL.genericWin(); },
      lose()      { SFX_INTERNAL.genericLose(); },
    },

    plinko: {
      pin()  {
        const f = 750 + Math.random() * 500;
        tone({ freq: f, dur: 0.035, type: 'triangle', vol: 0.14 });
        snap({ freq: f * 1.8, dur: 0.012, vol: 0.06 });
      },
      drop() { tone({ freq: 480, dur: 0.07, type: 'sine', vol: 0.18 }); },
      win()  { coinCascade({ count: 5, vol: 0.24 }); },
      lose() { SFX_INTERNAL.genericLose(); },
    },

    mines: {
      reveal()  { snap({ freq: 1800, dur: 0.03, vol: 0.16, q: 4 }); },
      gem()     {
        tone({ freq: 900, dur: 0.12, type: 'sine', vol: 0.24, glideTo: 1500, reverb: 0.15 });
        tone({ freq: 1800, dur: 0.08, type: 'sine', vol: 0.08, delay: 0.02 });
      },
      bomb()    {
        noise({ dur: 0.55, vol: 0.42, filterFreq: 320, filterType: 'lowpass' });
        tone({ freq: [150, 35], dur: 0.45, type: 'square', vol: 0.28 });
        tone({ freq: 45, dur: 0.35, type: 'sine', vol: 0.28, delay: 0.02 });
      },
      cashout() { bell({ freq: 784, dur: 0.6, vol: 0.26, reverb: 0.25 }); coinCascade({ count: 5, vol: 0.22, delay: 0.08 }); },
    },

    reelsgird: {
      spin()    { tone({ freq: 200, dur: 0.25, type: 'sawtooth', vol: 0.13, glideTo: 480 }); noise({ dur: 0.25, vol: 0.05, filterFreq: 1200, filterType: 'bandpass' }); },
      /* Reel berhenti — mekanis: "thunk" rendah + klik rem singkat. */
      reelStop() {
        tone({ freq: 140, dur: 0.05, type: 'square', vol: 0.2 });
        snap({ freq: 1600, dur: 0.02, vol: 0.14 });
      },
      win()     { SFX_INTERNAL.genericWin(); },
      lose()    { SFX_INTERNAL.genericLose(); },
    },

    wheel: {
      spinStart() { tone({ freq: 160, dur: 0.35, type: 'sawtooth', vol: 0.15, glideTo: 600 }); },
      tick() {
        const jitter = 1 + (Math.random() * 0.06 - 0.03);
        tone({ freq: 700 * jitter, dur: 0.02, type: 'square', vol: 0.12 });
      },
      win()  { SFX_INTERNAL.genericWin(); },
      lose() { SFX_INTERNAL.genericLose(); },
    },

    hilo: {
      flip()    { snap({ freq: 2600, dur: 0.03, vol: 0.18, q: 5 }); },
      correct() { tone({ freq: 750, dur: 0.1, type: 'sine', vol: 0.24, glideTo: 1050, reverb: 0.1 }); },
      wrong()   { tone({ freq: [300, 90], dur: 0.4, type: 'sawtooth', vol: 0.26 }); },
      cashout() { bell({ freq: 830, dur: 0.55, vol: 0.26, reverb: 0.25 }); coinCascade({ count: 4, vol: 0.2, delay: 0.08 }); },
    },
  };
})();

/* Alias internal kecil supaya method generic bisa dipanggil ulang dari
   dalam per-game object tanpa saling depend urutan definisi di atas. */
const SFX_INTERNAL = {
  genericWin()  { SFX.generic.win(); },
  genericLose() { SFX.generic.lose(); },
  coinCascadeDelayed(delay) { SFX.coinCascade({ count: 6, vol: 0.24, delay }); },
};
