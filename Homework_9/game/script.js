(function () {
  'use strict';

  const CONFIG = {
    LIGHT_MS: 600,
    GAP_MS: 250,
    PRE_SHOW_DELAY_MS: 700,
    ROUND_PAUSE_MS: 900,
    PRESS_FLASH_MS: 200,
    MIN_LIGHT_MS: 250,
    SPEEDUP_EVERY: 5,
    SPEEDUP_STEP_MS: 60,
    REVEAL_MS: 800,
    MAX_ROUNDS: Infinity,
    PAD_COUNT: 4,
    RESUME_DELAY_MS: 450
  };

  const PHASE = Object.freeze({ IDLE: 'idle', SHOWING: 'showing', INPUT: 'input', PAUSED: 'paused', OVER: 'over' });

  const PADS = [
    { index: 0, id: 'pad-0', color: 'green', key: '1' },
    { index: 1, id: 'pad-1', color: 'red', key: '2' },
    { index: 2, id: 'pad-2', color: 'yellow', key: '3' },
    { index: 3, id: 'pad-3', color: 'blue', key: '4' }
  ];

  const STATUS_TEXT = {
    idle: 'Press Start (or Enter) to play.',
    showing: 'Watch the pattern…',
    input: 'Your turn: repeat the pattern (keys 1–4).',
    paused: 'Paused. Press P or Esc to resume.',
    over: 'Game over.'
  };

  const state = {
    phase: PHASE.IDLE,
    sequence: [],
    inputIndex: 0,
    round: 0,
    score: 0,
    gameId: 0,
    pausedFrom: null,
    pauseReason: null
  };

  let timers = [];
  let playbackPad = null;
  const flashTimers = [null, null, null, null];
  const els = {};
  const listeners = {};
  let rng = Math.random;

  // ---- events ----
  function on(name, handler) {
    (listeners[name] = listeners[name] || []).push(handler);
  }
  function emit(name, payload) {
    (listeners[name] || []).slice().forEach(function (h) {
      try { h(payload); } catch (err) { console.error(err); }
    });
  }

  // ---- pure helpers ----
  function randomPad() {
    return Math.min(CONFIG.PAD_COUNT - 1, Math.max(0, Math.floor(rng() * CONFIG.PAD_COUNT)));
  }
  function extendSequence(seq) {
    return seq.concat(randomPad());
  }
  function checkInput(seq, inputIndex, padIndex) {
    if (seq[inputIndex] !== padIndex) return 'wrong';
    return inputIndex === seq.length - 1 ? 'complete' : 'correct';
  }
  function getLightMs(round) {
    const steps = Math.floor((round - 1) / CONFIG.SPEEDUP_EVERY);
    return Math.max(CONFIG.MIN_LIGHT_MS, CONFIG.LIGHT_MS - steps * CONFIG.SPEEDUP_STEP_MS);
  }

  // ---- DOM helpers ----
  function cacheElements() {
    const ids = ['app', 'title', 'hud', 'round-label', 'round-value', 'score-label', 'score-value',
      'status', 'board', 'pad-0', 'pad-1', 'pad-2', 'pad-3', 'controls', 'start-btn',
      'restart-btn', 'gameover-panel', 'gameover-message', 'final-score'];
    ids.forEach(function (id) {
      const el = document.getElementById(id);
      if (!el) console.error('Pattern Memory: missing element #' + id);
      els[id] = el;
    });
  }
  function lightPad(index) {
    els['pad-' + index].classList.add('lit');
    emit('light', index);
  }
  function unlightPad(index) {
    els['pad-' + index].classList.remove('lit');
    emit('unlight', index);
  }
  function flashPad(index) {
    if (flashTimers[index] !== null) clearTimeout(flashTimers[index]);
    lightPad(index);
    const gid = state.gameId;
    flashTimers[index] = setTimeout(function () {
      flashTimers[index] = null;
      if (gid !== state.gameId) return;
      unlightPad(index);
    }, CONFIG.PRESS_FLASH_MS);
  }
  function renderHud() {
    els['round-value'].textContent = String(state.round);
    els['score-value'].textContent = String(state.score);
  }
  function setStatus(text) {
    els.status.textContent = text;
  }
  function showGameOver() {
    els['gameover-message'].textContent = 'Game over! You reached round ' + state.round + '.';
    els['final-score'].textContent = 'Final score: ' + state.score;
    els['gameover-panel'].hidden = false;
  }
  function hideGameOver() {
    els['gameover-panel'].hidden = true;
  }
  function setPhase(phase) {
    state.phase = phase;
    els.app.setAttribute('data-state', phase);
    const locked = phase !== PHASE.INPUT;
    els.board.classList.toggle('locked', locked);
    PADS.forEach(function (p) {
      els[p.id].setAttribute('aria-disabled', locked ? 'true' : 'false');
    });
    els['start-btn'].hidden = phase !== PHASE.IDLE;
    els['restart-btn'].hidden = phase !== PHASE.OVER;
    els['gameover-panel'].hidden = phase !== PHASE.OVER;
    setStatus(STATUS_TEXT[phase]);
    emit('phase', phase);
  }

  // ---- timers ----
  function isPlaying() {
    return state.phase === PHASE.SHOWING || state.phase === PHASE.INPUT;
  }
  function arm(entry, delay) {
    entry.due = performance.now() + delay;
    entry.tid = setTimeout(function () {
      const i = timers.indexOf(entry);
      if (i >= 0) timers.splice(i, 1);
      if (entry.gid !== state.gameId) return;
      entry.fn();
    }, delay);
  }
  function schedule(fn, ms, tag) {
    const entry = { tid: null, fn: fn, gid: state.gameId, due: 0, ms: ms, tag: tag || 'normal' };
    timers.push(entry);
    arm(entry, ms);
    return entry.tid;
  }
  function clearTimers() {
    timers.forEach(function (e) { if (e.tid !== null) clearTimeout(e.tid); });
    timers = [];
    playbackPad = null;
    for (let i = 0; i < flashTimers.length; i++) {
      if (flashTimers[i] !== null) {
        clearTimeout(flashTimers[i]);
        flashTimers[i] = null;
      }
    }
    for (let i = 0; i < CONFIG.PAD_COUNT; i++) {
      els['pad-' + i].classList.remove('lit');
    }
  }
  function freezeTimers() {
    const now = performance.now();
    timers = timers.filter(function (e) {
      if (e.tid !== null) clearTimeout(e.tid);
      e.tid = null;
      e.remaining = Math.max(0, e.due - now);
      return e.tag !== 'relight';
    });
  }
  function thawTimers(extraMs) {
    timers.slice().forEach(function (e) {
      if (e.tid !== null) return; // already armed (e.g. the relight just scheduled by resumeGame)
      arm(e, extraMs + (e.tag === 'hold' ? e.ms : e.remaining));
    });
  }

  // ---- flow ----
  function startGame() {
    if (state.phase !== PHASE.IDLE && state.phase !== PHASE.OVER && state.phase !== PHASE.PAUSED) return;
    clearTimers();
    state.gameId++;
    state.pausedFrom = null;
    state.pauseReason = null;
    playbackPad = null;
    state.sequence = [];
    state.inputIndex = 0;
    state.round = 0;
    state.score = 0;
    hideGameOver();
    renderHud();
    emit('start');
    els.board.focus();
    nextRound();
  }
  function nextRound() {
    state.sequence = extendSequence(state.sequence);
    state.round = state.sequence.length;
    state.inputIndex = 0;
    renderHud();
    emit('round', state.round);
    playSequence();
  }
  function playSequence() {
    setPhase(PHASE.SHOWING);
    const seq = state.sequence;
    const lightMs = getLightMs(state.round);
    function step(i) {
      lightPad(seq[i]);
      playbackPad = seq[i];
      schedule(function () {
        playbackPad = null;
        unlightPad(seq[i]);
        if (i + 1 < seq.length) {
          schedule(function () { step(i + 1); }, CONFIG.GAP_MS);
        } else {
          enterInput();
        }
      }, lightMs, 'hold');
    }
    schedule(function () { step(0); }, CONFIG.PRE_SHOW_DELAY_MS);
  }
  function enterInput() {
    state.inputIndex = 0;
    setPhase(PHASE.INPUT);
  }
  function handlePadInput(index) {
    if (state.phase !== PHASE.INPUT) {
      emit('blockedInput', index);
      return;
    }
    if (!Number.isInteger(index) || index < 0 || index >= CONFIG.PAD_COUNT) return;
    flashPad(index);
    emit('press', index);
    const result = checkInput(state.sequence, state.inputIndex, index);
    if (result === 'correct') {
      state.inputIndex++;
    } else if (result === 'complete') {
      roundComplete();
    } else {
      endGame(index);
    }
  }
  function roundComplete() {
    setPhase(PHASE.SHOWING);
    state.score++;
    renderHud();
    setStatus('Correct! Get ready…');
    emit('roundComplete', state.score);
    schedule(nextRound, CONFIG.ROUND_PAUSE_MS);
  }
  function endGame(wrongIndex) {
    const expected = state.sequence[state.inputIndex];
    clearTimers();
    playbackPad = null;
    setPhase(PHASE.OVER);
    showGameOver();
    lightPad(expected);
    schedule(function () { unlightPad(expected); }, CONFIG.REVEAL_MS);
    emit('gameOver', { round: state.round, score: state.score, expected: expected, got: wrongIndex });
    els['restart-btn'].focus();
  }

  function pauseGame(reason) {
    if (!isPlaying()) return false;
    reason = reason || 'user';
    state.pausedFrom = state.phase;
    state.pauseReason = reason;
    freezeTimers();
    for (let i = 0; i < flashTimers.length; i++) {
      if (flashTimers[i] !== null) {
        clearTimeout(flashTimers[i]);
        flashTimers[i] = null;
        unlightPad(i);
      }
    }
    if (playbackPad !== null && els['pad-' + playbackPad].classList.contains('lit')) unlightPad(playbackPad);
    setPhase(PHASE.PAUSED);
    emit('pause', { from: state.pausedFrom, reason: reason });
    return true;
  }
  function resumeGame() {
    if (state.phase !== PHASE.PAUSED) return false;
    const to = state.pausedFrom || PHASE.SHOWING;
    state.pausedFrom = null;
    state.pauseReason = null;
    setPhase(to);
    if (to === PHASE.SHOWING && playbackPad !== null) {
      const pad = playbackPad;
      schedule(function () { lightPad(pad); }, CONFIG.RESUME_DELAY_MS, 'relight');
    }
    thawTimers(CONFIG.RESUME_DELAY_MS);
    emit('resume', { to: to });
    els.board.focus();
    return true;
  }
  function quitGame() {
    if (state.phase !== PHASE.PAUSED && !isPlaying()) return false;
    clearTimers();
    state.gameId++;
    state.pausedFrom = null;
    state.pauseReason = null;
    playbackPad = null;
    hideGameOver();
    setPhase(PHASE.IDLE);
    emit('quit');
    return true;
  }

  // ---- handlers ----
  function onBoardPointerDown(e) {
    const pad = e.target.closest ? e.target.closest('.pad') : null;
    if (!pad) return;
    if (typeof e.button === 'number' && e.button !== 0) return; // primary button / touch / pen only
    if (e.pointerType === 'mouse' && e.ctrlKey) return; // macOS secondary click
    e.preventDefault();
    handlePadInput(Number(pad.dataset.pad));
  }
  function onKeyDown(e) {
    if (e.repeat) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    let index = -1;
    const m = /^(?:Digit|Numpad)([1-4])$/.exec(e.code || '');
    if (e.key >= '1' && e.key <= '4' && e.key.length === 1) index = Number(e.key) - 1;
    else if (m) index = Number(m[1]) - 1;
    if (index >= 0) {
      handlePadInput(index);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      if (state.phase === PHASE.IDLE || state.phase === PHASE.OVER) {
        e.preventDefault();
        startGame();
      }
    }
  }
  function onStartClick() { startGame(); }
  function onRestartClick() { startGame(); }

  function init() {
    cacheElements();
    if (window.PointerEvent) {
      els.board.addEventListener('pointerdown', onBoardPointerDown);
    } else {
      els.board.addEventListener('mousedown', onBoardPointerDown);
      els.board.addEventListener('touchstart', onBoardPointerDown, { passive: false });
    }
    els.board.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    document.addEventListener('keydown', onKeyDown);
    els['start-btn'].addEventListener('click', onStartClick);
    els['restart-btn'].addEventListener('click', onRestartClick);
    setPhase(PHASE.IDLE);
    renderHud();
  }

  window.PatternMemory = {
    on: on,
    getState: function () {
      return Object.assign({}, state, { sequence: state.sequence.slice() });
    },
    setRandom: function (fn) { rng = fn; },
    CONFIG: CONFIG,
    PHASE: PHASE,
    pause: function (reason) { return pauseGame(reason); },
    resume: function () { return resumeGame(); },
    togglePause: function () {
      if (isPlaying()) return pauseGame('user');
      if (state.phase === PHASE.PAUSED) return resumeGame();
      return false;
    },
    restart: function () { startGame(); },
    quit: function () { return quitGame(); },
    isPaused: function () { return state.phase === PHASE.PAUSED; }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/* ===== Stage 3: Sensory feedback ===== */
(function () {
  'use strict';
  const PM = window.PatternMemory;
  if (!PM || typeof PM.on !== 'function') return;

  const FX_CONFIG = Object.freeze({
    MAX_PARTICLES: 60,
    MAX_VOICES: 6,
    MASTER_GAIN: 0.5,
    PAD_FREQ: [392.00, 329.63, 261.63, 196.00],
    PAD_TINT: ['#3DFFB0', '#FF6B85', '#FFD84A', '#5CB8FF'],
    PRESETS: {
      press: { count: 8, size: [4, 10], dx: 40, rise: [50, 110], dur: [550, 900] },
      start: { count: 14, size: [5, 14], dx: null, rise: [120, 260], dur: [800, 1300] },
      round: { count: 16, size: [4, 12], dx: 90, rise: [90, 200], dur: [700, 1100] },
      sink: { count: 10, size: [4, 9], dx: 30, rise: [-90, -40], dur: [900, 1300], sink: true }
    }
  });

  const fxEls = { pads: [] };
  let warned = false;
  function warnOnce(err) {
    if (warned) return;
    warned = true;
    console.warn('Pattern Memory FX:', err);
  }
  function safe(fn) {
    return function () {
      try { return fn.apply(this, arguments); } catch (err) { warnOnce(err); }
    };
  }

  // ---- helpers ----
  const retimers = new WeakMap();
  function retrigger(el, cls, ms) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    let m = retimers.get(el);
    if (!m) { m = {}; retimers.set(el, m); }
    if (m[cls]) clearTimeout(m[cls]);
    m[cls] = setTimeout(function () { el.classList.remove(cls); m[cls] = 0; }, ms);
  }
  function centerOf(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, bottom: r.bottom };
  }
  function prefersReducedMotion() {
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { return false; }
  }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function cssVar(el, name, fallback) {
    try {
      const v = getComputedStyle(el).getPropertyValue(name).trim();
      return v || fallback;
    } catch (e) { return fallback; }
  }

  // ---- Particles ----
  const Particles = {
    count: function () {
      return fxEls.fxLayer ? fxEls.fxLayer.querySelectorAll('.bubble, .ripple').length : 0;
    },
    canSpawn: function () {
      return !!fxEls.fxLayer && !document.hidden && !prefersReducedMotion();
    },
    add: function (el, life) {
      fxEls.fxLayer.appendChild(el);
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, life + 100);
    },
    burst: function (presetName, x, y, tintOverride) {
      if (!this.canSpawn()) return 0;
      const p = FX_CONFIG.PRESETS[presetName];
      const n = Math.min(p.count, FX_CONFIG.MAX_PARTICLES - this.count());
      for (let i = 0; i < n; i++) {
        const el = document.createElement('span');
        el.className = p.sink ? 'bubble sink' : 'bubble';
        const dx = p.dx === null ? (fxEls.board ? fxEls.board.getBoundingClientRect().width / 2 : 100) : p.dx;
        const dur = rand(p.dur[0], p.dur[1]);
        const delay = rand(0, 100);
        let tint = tintOverride;
        if (!tint) {
          if (presetName === 'start') tint = cssVar(document.documentElement, '--bubble', '#9FD8FF');
          else if (presetName === 'round') tint = i % 2 ? cssVar(document.documentElement, '--bubble', '#9FD8FF') : cssVar(document.documentElement, '--accent', '#3FE0D0');
          else if (presetName === 'sink') tint = cssVar(document.documentElement, '--danger', '#FF8A8A');
          else tint = '#9FD8FF';
        }
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        el.style.setProperty('--size', rand(p.size[0], p.size[1]).toFixed(1) + 'px');
        el.style.setProperty('--dx', rand(-dx, dx).toFixed(1) + 'px');
        el.style.setProperty('--rise', rand(p.rise[0], p.rise[1]).toFixed(1) + 'px');
        el.style.setProperty('--dur', Math.round(dur) + 'ms');
        el.style.setProperty('--delay', Math.round(delay) + 'ms');
        el.style.setProperty('--tint', tint);
        this.add(el, dur + delay);
      }
      return n;
    },
    ripple: function (x, y, size, tint, dur) {
      if (!this.canSpawn()) return 0;
      if (this.count() >= FX_CONFIG.MAX_PARTICLES) return 0;
      const el = document.createElement('span');
      el.className = 'ripple';
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.style.width = size + 'px';
      el.style.height = size + 'px';
      el.style.setProperty('--tint', tint);
      el.style.setProperty('--dur', dur + 'ms');
      this.add(el, dur);
      return 1;
    }
  };

  // ---- Audio ----
  const AudioFx = (function () {
    let ctx = null, master = null, status = 'uninitialized';
    let resumePending = false, wasRunning = false, muted = false;
    const log = [];
    const muteListeners = [];
    const padVoices = [null, null, null, null];
    const active = [];

    function logIt(name, pad, played, reason) {
      log.push({ name: name, pad: pad, played: played, reason: reason, t: performance.now() });
      if (log.length > 200) log.shift();
    }
    function syncStatus() {
      if (!ctx) return;
      status = ctx.state === 'running' ? 'running' : ctx.state === 'closed' ? 'closed' : 'suspended';
    }
    function buildGraph() {
      master = ctx.createGain();
      master.gain.value = muted ? 0 : FX_CONFIG.MASTER_GAIN;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 4;
      master.connect(comp);
      comp.connect(ctx.destination);
    }
    function unlock() {
      if (status === 'unavailable' || status === 'closed') return;
      if (!ctx) {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) { status = 'unavailable'; return; }
        try {
          ctx = new Ctor();
          buildGraph();
          ctx.onstatechange = safe(syncStatus);
          syncStatus();
        } catch (err) {
          ctx = null; master = null; status = 'unavailable';
          return;
        }
      }
      if (ctx.state === 'suspended' && !resumePending && typeof ctx.resume === 'function') {
        resumePending = true;
        const done = function () { resumePending = false; syncStatus(); };
        let p;
        try { p = ctx.resume(); } catch (err) { done(); return; }
        if (p && typeof p.then === 'function') p.then(done, done); else done();
      }
    }
    function gate() {
      if (muted) return 'muted';
      if (status === 'unavailable' || status === 'closed') return 'unavailable';
      if (!ctx) return 'locked';
      if (ctx.state === 'running' || resumePending) return null;
      return 'locked';
    }
    function removeActive(e) {
      const i = active.indexOf(e);
      if (i >= 0) active.splice(i, 1);
    }
    function release(e, rel) {
      if (!e || e.released) return;
      e.released = true;
      removeActive(e);
      const now = ctx.currentTime;
      e.gains.forEach(function (g) {
        try {
          g.gain.cancelScheduledValues(now);
          g.gain.setValueAtTime(g.gain.value, now);
          g.gain.linearRampToValueAtTime(0.0001, now + rel);
        } catch (err) { warnOnce(err); }
      });
      e.oscs.forEach(function (o) { try { o.stop(now + rel + 0.02); } catch (err) { /* already stopped */ } });
    }
    function track(e) {
      e.released = false;
      active.push(e);
      while (active.length > FX_CONFIG.MAX_VOICES) release(active[0], 0.03);
      const last = e.oscs[e.oscs.length - 1];
      last.onended = function () {
        removeActive(e);
        e.nodes.forEach(function (n) { try { n.disconnect(); } catch (err) { /* ignore */ } });
      };
      return e;
    }
    function osc(type, freq, dest, t) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      o.connect(dest);
      return o;
    }
    function request(name, pad, fn) {
      const reason = gate();
      if (reason) { logIt(name, pad, false, reason); return false; }
      try {
        fn();
        logIt(name, pad, true, null);
        return true;
      } catch (err) {
        warnOnce(err);
        logIt(name, pad, false, 'unavailable');
        return false;
      }
    }

    function padOn(i, maxSec) {
      return request('pad', i, function () {
        if (padVoices[i]) release(padVoices[i], 0.03);
        const t = ctx.currentTime;
        const g = ctx.createGain();
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = 2400; f.Q.value = 0.7;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.30, t + 0.01);
        g.gain.linearRampToValueAtTime(0.20, t + 0.09);
        const o2g = ctx.createGain();
        o2g.gain.value = 0.15;
        const base = FX_CONFIG.PAD_FREQ[i];
        const o1 = osc('triangle', base, g, t);
        const o2 = osc('sine', base * 2, o2g, t);
        o2g.connect(g); g.connect(f); f.connect(master);
        const hard = t + (maxSec || 1.5);
        o1.start(t); o2.start(t);
        o1.stop(hard); o2.stop(hard);
        const e = track({ gains: [g], oscs: [o1, o2], nodes: [o1, o2, o2g, g, f] });
        padVoices[i] = e;
      });
    }
    function padOff(i) {
      try {
        const e = padVoices[i];
        if (!e || !ctx) return;
        padVoices[i] = null;
        release(e, 0.12);
      } catch (err) { warnOnce(err); }
    }
    function stopAll() {
      try {
        if (!ctx) return;
        active.slice().forEach(function (e) { release(e, 0.03); });
        for (let i = 0; i < padVoices.length; i++) padVoices[i] = null;
      } catch (err) { warnOnce(err); }
    }
    function ping() {
      const t = ctx.currentTime;
      const gains = [], oscs = [], nodes = [];
      [[0, 0.35], [0.22, 0.35 * 0.35]].forEach(function (pr) {
        const t0 = t + pr[0];
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(pr[1], t0 + 0.005);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.45);
        const o = osc('sine', 1046.5, g, t0);
        o.frequency.exponentialRampToValueAtTime(784, t0 + 0.25);
        g.connect(master);
        o.start(t0); o.stop(t0 + 0.5);
        gains.push(g); oscs.push(o); nodes.push(o, g);
      });
      track({ gains: gains, oscs: oscs, nodes: nodes });
    }
    function chime(delay) {
      const t = ctx.currentTime + (delay || 0);
      const gains = [], oscs = [], nodes = [];
      [523.25, 659.25, 783.99, 1046.50].forEach(function (f, k) {
        const t0 = t + k * 0.09;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(0.22, t0 + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.308);
        const o = osc('sine', f, g, t0);
        g.connect(master);
        o.start(t0); o.stop(t0 + 0.32);
        gains.push(g); oscs.push(o); nodes.push(o, g);
      });
      track({ gains: gains, oscs: oscs, nodes: nodes });
    }
    function buzz() {
      const t = ctx.currentTime;
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 900;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.01);
      g.gain.setValueAtTime(0.22, t + 0.26);
      g.gain.linearRampToValueAtTime(0.0001, t + 0.46);
      const sqg = ctx.createGain();
      sqg.gain.value = 0.5;
      const o1 = osc('sawtooth', 110, g, t);
      const o2 = osc('square', 116.5, sqg, t);
      sqg.connect(g);
      [o1, o2].forEach(function (o) {
        o.frequency.linearRampToValueAtTime(82, t + 0.4);
        o.start(t); o.stop(t + 0.48);
      });
      g.connect(f); f.connect(master);
      track({ gains: [g], oscs: [o1, o2], nodes: [o1, o2, sqg, g, f] });
    }
    function play(name, opts) {
      return request(name, null, function () {
        if (name === 'start') ping();
        else if (name === 'chime') chime(opts && opts.delay);
        else if (name === 'buzz') buzz();
      });
    }
    function setMuted(v) {
      muted = !!v;
      try {
        if (ctx && master) master.gain.setTargetAtTime(muted ? 0 : FX_CONFIG.MASTER_GAIN, ctx.currentTime, 0.015);
      } catch (err) { warnOnce(err); }
      muteListeners.slice().forEach(function (fn) {
        try { fn(muted); } catch (err) { warnOnce(err); }
      });
    }
    function onHidden() {
      stopAll();
      if (ctx) {
        wasRunning = ctx.state === 'running';
        try { const p = ctx.suspend(); if (p && p.catch) p.catch(function () {}); } catch (err) { /* ignore */ }
      }
    }
    function onVisible() {
      if (ctx && wasRunning) {
        try { const p = ctx.resume(); if (p && p.catch) p.catch(function () {}); } catch (err) { /* ignore */ }
      }
    }
    return {
      unlock: unlock, play: play, padOn: padOn, padOff: padOff, stopAll: stopAll,
      setMuted: setMuted, isMuted: function () { return muted; },
      onMuteChange: function (fn) { if (typeof fn === 'function') muteListeners.push(fn); },
      getStatus: function () { return ctx || status === 'unavailable' ? status : 'uninitialized'; },
      log: log, onHidden: onHidden, onVisible: onVisible
    };
  })();

  // ---- wiring ----
  function wire() {
    fxEls.app = document.getElementById('app');
    fxEls.board = document.getElementById('board');
    fxEls.scoreValue = document.getElementById('score-value');
    fxEls.roundValue = document.getElementById('round-value');
    fxEls.muteBtn = document.getElementById('mute-btn');
    fxEls.fxLayer = document.getElementById('fx-layer');
    for (let i = 0; i < 4; i++) fxEls.pads[i] = document.getElementById('pad-' + i);
    if (!fxEls.fxLayer && document.body) {
      fxEls.fxLayer = document.createElement('div');
      fxEls.fxLayer.id = 'fx-layer';
      fxEls.fxLayer.setAttribute('aria-hidden', 'true');
      document.body.appendChild(fxEls.fxLayer);
    }
    if (!fxEls.board || !fxEls.muteBtn) warnOnce('missing board or #mute-btn');

    const padTints = fxEls.pads.map(function (p, i) {
      return p ? cssVar(p, '--pad-glow', FX_CONFIG.PAD_TINT[i]) : FX_CONFIG.PAD_TINT[i];
    });
    const accent = cssVar(document.documentElement, '--accent', '#3FE0D0');

    function clearFx() {
      fxEls.pads.forEach(function (p) { if (p) p.classList.remove('fx-wrong', 'fx-wrong-in'); });
      if (fxEls.board) fxEls.board.classList.remove('fx-shake', 'fx-round');
      if (fxEls.fxLayer) fxEls.fxLayer.classList.remove('fx-glow-ok', 'fx-glow-bad');
    }

    PM.on('start', safe(function () {
      clearFx();
      retrigger(fxEls.board, 'fx-start', 630);
      if (fxEls.board) {
        const b = centerOf(fxEls.board);
        Particles.burst('start', b.x, b.bottom - 10);
        Particles.ripple(b.x, b.y, b.w, accent, 700);
      }
      AudioFx.unlock();
      AudioFx.stopAll();
      AudioFx.play('start');
    }));
    PM.on('round', safe(function () { retrigger(fxEls.roundValue, 'fx-bump', 350); }));
    PM.on('light', safe(function (i) {
      if (PM.getState().phase !== 'showing') return;
      const p = fxEls.pads[i];
      if (p) {
        const c = centerOf(p);
        Particles.ripple(c.x, c.y, c.w, padTints[i], 500);
      }
      AudioFx.padOn(i);
    }));
    PM.on('unlight', safe(function (i) { AudioFx.padOff(i); }));
    PM.on('press', safe(function (i) {
      const s = PM.getState();
      const correct = s.sequence[s.inputIndex] === i;
      const p = fxEls.pads[i];
      retrigger(p, 'fx-press', 210);
      if (p) {
        const c = centerOf(p);
        Particles.burst('press', c.x, c.y, padTints[i]);
        Particles.ripple(c.x, c.y, c.w, padTints[i], 500);
      }
      if (correct) AudioFx.padOn(i, 0.4);
    }));
    PM.on('roundComplete', safe(function () {
      retrigger(fxEls.board, 'fx-round', 680);
      retrigger(fxEls.scoreValue, 'fx-bump', 350);
      retrigger(fxEls.fxLayer, 'fx-glow-ok', 630);
      if (fxEls.board) {
        const b = centerOf(fxEls.board);
        Particles.burst('round', b.x, b.y);
      }
      AudioFx.play('chime', { delay: 0.12 });
    }));
    PM.on('gameOver', safe(function (d) {
      const p = fxEls.pads[d.got];
      retrigger(fxEls.board, 'fx-shake', 480);
      if (p) {
        p.classList.add('fx-wrong');
        retrigger(p, 'fx-wrong-in', 280);
        const c = centerOf(p);
        Particles.burst('sink', c.x, c.y);
      }
      retrigger(fxEls.fxLayer, 'fx-glow-bad', 730);
      AudioFx.stopAll();
      AudioFx.play('buzz');
    }));
    PM.on('phase', safe(function (ph) {
      if (ph === 'over' || ph === 'idle' || ph === 'paused') AudioFx.stopAll();
    }));
    PM.on('blockedInput', safe(function (i) { retrigger(fxEls.pads[i], 'fx-nope', 190); }));

    // Mute UI
    function syncMuteUi(m) {
      if (fxEls.muteBtn) fxEls.muteBtn.setAttribute('aria-pressed', m ? 'true' : 'false');
    }
    function toggleMute() {
      AudioFx.setMuted(!AudioFx.isMuted());
      retrigger(fxEls.muteBtn, 'fx-pop', 220);
    }
    AudioFx.onMuteChange(syncMuteUi);
    syncMuteUi(AudioFx.isMuted());
    // Saved mute preference is restored by the Stage 4 IIFE (PM.storage)

    if (fxEls.muteBtn) {
      fxEls.muteBtn.addEventListener('click', safe(toggleMute));
      fxEls.muteBtn.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
      });
    }
    document.addEventListener('keydown', safe(function (e) {
      if (!(e.key === 'm' || e.key === 'M' || e.code === 'KeyM')) return;
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t && t.closest && t.closest('input, textarea, select, [contenteditable]')) return;
      toggleMute();
    }));

    const gesture = safe(function () { AudioFx.unlock(); });
    ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click'].forEach(function (n) {
      window.addEventListener(n, gesture, { capture: true, passive: true });
    });
    document.addEventListener('visibilitychange', safe(function () {
      if (document.hidden) AudioFx.onHidden(); else AudioFx.onVisible();
    }));

    PM.audio = {
      isMuted: AudioFx.isMuted,
      setMuted: AudioFx.setMuted,
      toggleMute: toggleMute,
      onMuteChange: AudioFx.onMuteChange,
      getStatus: AudioFx.getStatus,
      stopAll: AudioFx.stopAll,
      log: AudioFx.log
    };
    PM.fx = {
      particleCount: function () { return Particles.count(); },
      reducedMotion: prefersReducedMotion
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', safe(wire));
  } else {
    safe(wire)();
  }
})();

/* ===== Stage 4: State & storage ===== */
(function () {
  'use strict';
  const PM = window.PatternMemory;
  if (!PM || typeof PM.on !== 'function' || !PM.audio) return;

  const STORAGE_KEY = 'patternMemory.abyssalGlow';
  const SCHEMA_VERSION = 1;
  const MAX_INT = 1000000;
  const INT_FIELDS = ['highScore', 'bestRound', 'gamesPlayed'];
  const KNOWN = ['highScore', 'bestRound', 'gamesPlayed', 'lastScore', 'muted'];

  let warned = false;
  function warnOnce(err) {
    if (warned) return;
    warned = true;
    console.warn('Pattern Memory storage:', err);
  }
  function safe(fn) {
    return function () {
      try { return fn.apply(this, arguments); } catch (err) { warnOnce(err); }
    };
  }

  // ---- Store: the only code that touches browser storage ----
  const Store = (function () {
    let backend = 'local';
    let data = defaults();
    let lastLoadStatus = 'empty';
    let fellBack = false;
    const listeners = [];
    let noteEl = null;

    function defaults() {
      return { v: SCHEMA_VERSION, highScore: 0, bestRound: 0, gamesPlayed: 0, lastScore: null, muted: false };
    }
    function validInt(x) {
      return typeof x === 'number' && Number.isFinite(x) && Number.isInteger(x) && x >= 0 && x <= MAX_INT;
    }
    function getLocal() {
      try {
        const ls = window.localStorage;
        return ls === null || ls === undefined ? null : ls;
      } catch (err) {
        return null;
      }
    }
    function load(raw) {
      if (raw === null || raw === undefined || raw === '') return { data: defaults(), status: 'empty' };
      let obj;
      try { obj = JSON.parse(raw); } catch (err) { return { data: defaults(), status: 'corrupt' }; }
      if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return { data: defaults(), status: 'corrupt' };
      let status = 'ok';
      if (obj.v !== SCHEMA_VERSION) {
        if (obj.v === undefined && KNOWN.some(function (k) { return k in obj; })) status = 'migrated';
        else if (typeof obj.v === 'number' && obj.v > SCHEMA_VERSION) return { data: defaults(), status: 'future' };
        else return { data: defaults(), status: 'corrupt' };
      }
      const d = defaults();
      let replaced = false;
      INT_FIELDS.forEach(function (k) {
        if (validInt(obj[k])) d[k] = obj[k]; else replaced = true;
      });
      if (obj.lastScore === null) d.lastScore = null;
      else if (validInt(obj.lastScore)) d.lastScore = obj.lastScore;
      else replaced = true;
      if (obj.muted === true || obj.muted === false) d.muted = obj.muted; else replaced = true;
      const hs = Math.max(d.highScore, d.lastScore === null ? 0 : d.lastScore);
      const br = Math.max(d.bestRound, hs);
      if (hs !== d.highScore || br !== d.bestRound) replaced = true;
      d.highScore = hs;
      d.bestRound = br;
      if (replaced && status === 'ok') status = 'repaired';
      return { data: d, status: status };
    }
    function showNote() {
      noteEl = noteEl || document.getElementById('storage-note');
      if (noteEl) noteEl.hidden = false;
    }
    function fallback(err, reason) {
      backend = 'memory';
      if (!reason) {
        const full = err && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
          err.code === 22 || err.code === 1014);
        reason = full ? 'full' : 'blocked';
      }
      if (!fellBack) {
        fellBack = true;
        console.warn('Pattern Memory: progress will not be saved (' + reason + ')');
        showNote();
      }
    }
    function notify() {
      const copy = Object.assign({}, data);
      listeners.slice().forEach(function (fn) { safe(fn)(copy); });
    }
    function write() {
      if (backend !== 'local') return;
      data.savedAt = new Date().toISOString();
      try {
        const ls = getLocal();
        if (!ls) throw new Error('storage unavailable');
        ls.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch (err) {
        fallback(err);
      }
    }
    function mergeStored() {
      if (backend !== 'local') return;
      try {
        const ls = getLocal();
        if (!ls) return;
        const r = load(ls.getItem(STORAGE_KEY));
        if (r.status === 'empty' || r.status === 'corrupt' || r.status === 'future') return;
        INT_FIELDS.forEach(function (k) { data[k] = Math.max(data[k], r.data[k]); });
      } catch (err) { /* the write decides */ }
    }
    function save(patch, skipMerge) {
      Object.assign(data, patch || {});
      if (!skipMerge) mergeStored();
      INT_FIELDS.forEach(function (k) { data[k] = Math.min(MAX_INT, Math.max(0, data[k])); });
      if (typeof data.lastScore === 'number') data.lastScore = Math.min(MAX_INT, Math.max(0, data.lastScore));
      write();
      notify();
    }
    function init() {
      const ls = getLocal();
      let raw = null;
      if (!ls) {
        fallback(null, 'blocked');
      } else {
        try { raw = ls.getItem(STORAGE_KEY); } catch (err) { fallback(err, 'blocked'); }
      }
      const r = backend === 'local' ? load(raw) : { data: defaults(), status: 'empty' };
      data = r.data;
      lastLoadStatus = r.status;
      if (backend === 'local' && (r.status === 'corrupt' || r.status === 'repaired' || r.status === 'migrated')) {
        save({}, true);
      }
    }
    function reset() {
      const muted = data.muted;
      data = defaults();
      data.muted = muted;
      if (backend === 'local') {
        try {
          const ls = getLocal();
          if (!ls) throw new Error('storage unavailable');
          ls.removeItem(STORAGE_KEY);
        } catch (err) { fallback(err); }
      }
      save({}, true);
    }
    function onExternal(newValue) {
      if (newValue === null || newValue === undefined) {
        const muted = data.muted;
        data = defaults();
        data.muted = muted;
      } else {
        const r = load(newValue);
        if (r.status === 'future' || r.status === 'corrupt' || r.status === 'empty') return;
        INT_FIELDS.forEach(function (k) { r.data[k] = Math.max(r.data[k], data[k]); });
        data = r.data;
      }
      notify();
    }
    function refresh() {
      if (backend !== 'local') return;
      try {
        const ls = getLocal();
        if (ls) onExternal(ls.getItem(STORAGE_KEY));
      } catch (err) { /* keep what we have */ }
    }
    return {
      init: init, save: save, reset: reset, onExternal: onExternal, refresh: refresh,
      get: function () { return Object.assign({}, data); },
      muted: function () { return data.muted; },
      backend: function () { return backend; },
      status: function () { return lastLoadStatus; },
      onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); }
    };
  })();

  // ---- UI ----
  const E = {};
  let bestAtStart = 0;
  let confirmOpen = false;
  let pauseOpen = false;

  function $(id) { return document.getElementById(id); }
  function phase() { return PM.getState().phase; }
  function bump(el) {
    if (!el) return;
    el.classList.remove('fx-bump');
    void el.offsetWidth;
    el.classList.add('fx-bump');
    setTimeout(function () { el.classList.remove('fx-bump'); }, 350);
  }
  function renderRecords() {
    const d = Store.get();
    const p = phase();
    if (E.bestValue) E.bestValue.textContent = String(d.highScore);
    if (E.bestRound) E.bestRound.textContent = 'round ' + d.bestRound;
    if (E.records) E.records.textContent = 'Games played: ' + d.gamesPlayed + ' · Last score: ' + (d.lastScore === null ? '—' : d.lastScore);
    if (E.resetBtn) E.resetBtn.hidden = !(p === 'idle' || p === 'over');
    if (E.pauseBtn) E.pauseBtn.hidden = !(p === 'showing' || p === 'input');
    if (p === 'over' && E.goBest) E.goBest.textContent = 'Best: ' + d.highScore + ' · Best round: ' + d.bestRound;
  }
  function setInert(on) {
    if (E.app) {
      try { E.app.inert = !!on; } catch (err) { /* ignore */ }
    }
  }
  function openPause(info) {
    const s = PM.getState();
    E.pauseInfo.textContent = 'Round ' + s.round + ' · Score ' + s.score +
      (info && info.reason === 'hidden' ? ' · paused while you were away' : '');
    E.pauseOverlay.hidden = false;
    pauseOpen = true;
    setInert(true);
    E.resumeBtn.focus();
  }
  function closePause(focusEl) {
    if (!pauseOpen) return;
    pauseOpen = false;
    E.pauseOverlay.hidden = true;
    setInert(false);
    if (focusEl) focusEl.focus();
  }
  function openConfirm() {
    const p = phase();
    if (confirmOpen || !(p === 'idle' || p === 'over')) return;
    confirmOpen = true;
    E.confirmPanel.hidden = false;
    setInert(true);
    E.confirmNo.focus();
  }
  function closeConfirm() {
    if (!confirmOpen) return;
    confirmOpen = false;
    E.confirmPanel.hidden = true;
    setInert(false);
    if (E.resetBtn && !E.resetBtn.hidden) E.resetBtn.focus();
  }
  function trapTab(e, root) {
    const btns = Array.prototype.slice.call(root.querySelectorAll('button')).filter(function (b) { return !b.disabled; });
    if (!btns.length) return;
    const first = btns[0], last = btns[btns.length - 1];
    const a = document.activeElement;
    if (btns.indexOf(a) < 0) { e.preventDefault(); first.focus(); return; }
    if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
  }
  function isTypingTarget(t) {
    return !!(t && t.closest && t.closest('input, textarea, select, [contenteditable]'));
  }

  function boot() {
    ['app', 'best-value', 'best-round', 'records-line', 'reset-btn', 'pause-btn', 'gameover-best', 'new-high',
      'pause-overlay', 'pause-info', 'resume-btn', 'pause-restart-btn', 'pause-quit-btn', 'confirm-panel',
      'confirm-no', 'confirm-yes', 'status', 'start-btn'].forEach(function (id) {
      const k = id.replace(/-(\w)/g, function (m, c) { return c.toUpperCase(); });
      E[k] = $(id);
      if (!E[k]) warnOnce('missing element #' + id);
    });
    E.records = E.recordsLine;
    E.goBest = E.gameoverBest;
    if (!E.app || !E.pauseOverlay || !E.confirmPanel) return;

    Store.init();
    bestAtStart = Store.get().highScore;

    // Restore the saved sound preference, then start listening for changes (loading never writes).
    if (Store.muted() !== PM.audio.isMuted()) PM.audio.setMuted(Store.muted());
    PM.audio.onMuteChange(safe(function (m) {
      if (m !== Store.muted()) Store.save({ muted: m });
    }));
    Store.onChange(renderRecords);
    renderRecords();

    PM.on('start', safe(function () {
      bestAtStart = Store.get().highScore;
      Store.save({ gamesPlayed: Store.get().gamesPlayed + 1 });
      E.newHigh.hidden = true;
      E.bestValue.classList.remove('is-record');
      closePause();
      renderRecords();
    }));
    PM.on('round', safe(function (n) {
      if (n > Store.get().bestRound) Store.save({ bestRound: n });
    }));
    PM.on('roundComplete', safe(function (score) {
      if (score > Store.get().highScore) {
        Store.save({ highScore: score });
        bump(E.bestValue);
      }
      if (score > bestAtStart) E.bestValue.classList.add('is-record');
    }));
    PM.on('gameOver', safe(function (d) {
      const cur = Store.get();
      Store.save({
        lastScore: d.score,
        highScore: Math.max(cur.highScore, d.score),
        bestRound: Math.max(cur.bestRound, d.round)
      });
      const n = Store.get();
      E.goBest.textContent = 'Best: ' + n.highScore + ' · Best round: ' + n.bestRound;
      E.newHigh.hidden = !(d.score > bestAtStart && d.score > 0);
    }));
    PM.on('phase', safe(function (p) {
      E.pauseBtn.hidden = !(p === 'showing' || p === 'input');
      E.resetBtn.hidden = !(p === 'idle' || p === 'over');
      if (p !== 'paused') closePause();
    }));
    PM.on('pause', safe(openPause));
    PM.on('resume', safe(function () { closePause(); }));
    PM.on('quit', safe(function () { closePause(); if (E.startBtn && !E.startBtn.hidden) E.startBtn.focus(); }));

    E.pauseBtn.addEventListener('click', safe(function () { PM.pause('user'); }));
    E.resumeBtn.addEventListener('click', safe(function () { PM.resume(); }));
    E.pauseRestartBtn.addEventListener('click', safe(function () { PM.restart(); }));
    E.pauseQuitBtn.addEventListener('click', safe(function () { PM.quit(); }));
    E.resetBtn.addEventListener('click', safe(openConfirm));
    E.confirmNo.addEventListener('click', safe(closeConfirm));
    E.confirmPanel.addEventListener('click', safe(function (e) { if (e.target === E.confirmPanel) closeConfirm(); }));
    E.confirmYes.addEventListener('click', safe(function () {
      Store.reset();
      bestAtStart = 0;
      E.bestValue.classList.remove('is-record');
      closeConfirm();
      E.status.textContent = 'Saved data cleared.';
    }));
    [E.pauseBtn, E.resetBtn].forEach(function (b) {
      b.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
      });
    });

    // Modal key guard (capture): keeps the core and mute handlers from reacting under an overlay.
    window.addEventListener('keydown', safe(function (e) {
      if ((pauseOpen || confirmOpen) && e.repeat && (e.key === 'Enter' || e.key === ' ')) e.preventDefault();
      if (confirmOpen) {
        if (e.key === 'Escape') { e.preventDefault(); closeConfirm(); e.stopPropagation(); return; }
        if (e.key === 'Tab') { trapTab(e, E.confirmPanel); return; }
        e.stopPropagation();
        return;
      }
      if (pauseOpen) {
        if (e.key === 'Tab') { trapTab(e, E.pauseOverlay); return; }
        if (e.key === 'Escape' || e.key === 'p' || e.key === 'P' || e.code === 'KeyP' ||
            e.key === 'm' || e.key === 'M' || e.code === 'KeyM') return;
        e.stopPropagation();
      }
    }), true);

    // Pause when the page is hidden or frozen; never auto-resume.
    function pauseIfAway() {
      if (phase() === 'showing' || phase() === 'input') PM.pause('hidden');
    }
    document.addEventListener('visibilitychange', safe(function () { if (document.hidden) pauseIfAway(); }));
    window.addEventListener('pagehide', safe(pauseIfAway));
    window.addEventListener('freeze', safe(pauseIfAway));
    document.addEventListener('freeze', safe(pauseIfAway));
    window.addEventListener('pageshow', safe(function (e) {
      if (!e.persisted) return;
      Store.refresh();
      if (Store.muted() !== PM.audio.isMuted()) PM.audio.setMuted(Store.muted());
      renderRecords();
    }));
    document.addEventListener('keydown', safe(function (e) {
      const isP = e.key === 'p' || e.key === 'P' || e.code === 'KeyP';
      if (!(isP || e.key === 'Escape')) return;
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target) || confirmOpen) return;
      if (PM.togglePause()) e.preventDefault();
    }));

    window.addEventListener('storage', safe(function (e) {
      if (e.key !== null && e.key !== STORAGE_KEY) return;
      Store.onExternal(e.key === null ? null : e.newValue);
      if (Store.muted() !== PM.audio.isMuted()) PM.audio.setMuted(Store.muted());
    }));

    PM.storage = {
      KEY: STORAGE_KEY,
      VERSION: SCHEMA_VERSION,
      get: Store.get,
      backend: Store.backend,
      lastLoadStatus: Store.status,
      reset: function () { Store.reset(); bestAtStart = 0; },
      onChange: Store.onChange
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', safe(boot));
  } else {
    safe(boot)();
  }
})();
