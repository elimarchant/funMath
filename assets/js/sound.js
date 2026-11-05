// Tiny shared sound engine for FunMath games. No audio files needed:
// every sound is synthesised with the Web Audio API.
(function () {
  let ctx = null;
  let muted = false;
  try { muted = localStorage.getItem('funmath.muted') === '1'; } catch (e) {}

  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, start, dur, type, vol, glideTo) {
    const c = ac(); if (!c) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || 'sine';
    const t0 = c.currentTime + start;
    o.frequency.setValueAtTime(freq, t0);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(c.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  // filtered noise burst, used for the "crowd cheer"
  function noise(start, dur, vol, f0, f1) {
    const c = ac(); if (!c) return;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const filt = c.createBiquadFilter();
    filt.type = 'bandpass';
    const t0 = c.currentTime + start;
    filt.frequency.setValueAtTime(f0, t0);
    filt.frequency.linearRampToValueAtTime(f1, t0 + dur);
    filt.Q.value = 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + dur * 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt).connect(g).connect(c.destination);
    src.start(t0);
  }

  const sounds = {
    // happy "yay!": rising arpeggio + sparkle + cheering crowd
    yay() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.35, 'triangle', 0.22));
      tone(1568, 0.4, 0.6, 'sine', 0.18);
      tone(2093, 0.5, 0.5, 'sine', 0.1);
      noise(0.25, 1.1, 0.35, 1200, 2600);
      // little vocal-ish "yaaay" glide
      tone(420, 0.3, 0.7, 'sawtooth', 0.07, 760);
    },
    // sad "ohhh": sliding-down wah wah
    ohhh() {
      tone(392, 0, 0.45, 'sawtooth', 0.14, 330);
      tone(349, 0.45, 0.45, 'sawtooth', 0.14, 294);
      tone(311, 0.9, 0.9, 'sawtooth', 0.14, 160);
      tone(196, 0.9, 0.9, 'sine', 0.12, 90);
    },
    pop() { tone(660, 0, 0.08, 'square', 0.06, 880); },
    drop() { tone(300, 0, 0.09, 'sine', 0.14, 200); },
    hint() { tone(880, 0, 0.12, 'sine', 0.14); tone(1320, 0.1, 0.18, 'sine', 0.12); },
    whoosh() { noise(0, 0.25, 0.12, 600, 2400); },
  };

  window.FunSound = {
    play(name) {
      if (muted || !sounds[name]) return;
      try { sounds[name](); } catch (e) {}
    },
    isMuted() { return muted; },
    setMuted(m) {
      muted = !!m;
      try { localStorage.setItem('funmath.muted', muted ? '1' : '0'); } catch (e) {}
    },
  };
})();
