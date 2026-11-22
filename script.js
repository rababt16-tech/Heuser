/* ================================================================
   RABAB-O-MATIC · script.js

   The whole site is one HTML file with 5 views:
     (no #hash)      -> the vending machine
     #about          -> A1 · Rabab Bites
     #work           -> A2 · Project Crunch
     #achievements   -> B1 · Trophy Mix
     #aspirations    -> B2 · Future Fizz
   Each snack in the machine is an <a href="#..."> to one of those views.

   How a visitor moves around:
   1. Drag the coin (my face) into the slot, or press it.
   2. Type a code on the keypad (or keyboard): A1, A2, B1, B2, C1.
   3. The spiral turns, the snack drops into the tray.
   4. Tap the tray -> the snack's page opens and tears itself open.
   5. Toss the wrapper in the bin -> back to the machine.
================================================================ */
(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const PACKS = ['about', 'work', 'achievements', 'aspirations'];

  /* ---------- placeholder if me.jpg is missing ---------- */
  const PLACEHOLDER = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="#F4EAD5"/>' +
    '<circle cx="200" cy="160" r="78" fill="#3A1F5C"/><path d="M60 400c0-90 62-150 140-150s140 60 140 150z" fill="#3A1F5C"/></svg>');
  document.querySelectorAll('img.me').forEach((img) => {
    const fallback = () => { if (img.src !== PLACEHOLDER) img.src = PLACEHOLDER; };
    img.addEventListener('error', fallback);
    if (img.complete && img.naturalWidth === 0) fallback();
  });

  /* ---------- storage helper (can fail in some browsers) ---------- */
  const store = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  };

  /* ---------- sound: little synth beeps, no audio files ---------- */
  let audio;
  function tone(freq, dur = 0.07, type = 'square', vol = 0.035, delay = 0) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const t = audio.currentTime + delay;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(audio.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch (e) { /* no sound, no problem */ }
  }
  function crunch() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const len = audio.sampleRate * 0.35;
      const buf = audio.createBuffer(1, len, audio.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2) * (Math.random() > 0.7 ? 1 : 0.2);
      const src = audio.createBufferSource();
      const g = audio.createGain();
      g.gain.value = 0.12;
      src.buffer = buf;
      src.connect(g).connect(audio.destination);
      src.start();
    } catch (e) {}
  }
  const sfx = {
    key: () => tone(880, 0.05),
    error: () => { tone(160, 0.14, 'sawtooth', 0.04); tone(120, 0.18, 'sawtooth', 0.04, 0.15); },
    coin: () => { tone(1320, 0.08, 'triangle', 0.06); tone(1760, 0.12, 'triangle', 0.05, 0.08); },
    whirr: () => { for (let i = 0; i < 8; i++) tone(220 + (i % 2) * 30, 0.08, 'sawtooth', 0.02, i * 0.1); },
    thud: () => tone(70, 0.25, 'sine', 0.12),
    power: () => [330, 440, 660].forEach((f, i) => tone(f, 0.1, 'square', 0.03, i * 0.1)),
    open: () => { tone(520, 0.08, 'triangle', 0.04); tone(780, 0.1, 'triangle', 0.04, 0.08); }
  };

  /* ================================================================
     PART 1: THE VENDING MACHINE
  ================================================================ */
  const machine = document.getElementById('machine');
  const glass = document.getElementById('glass');
  const coin = document.getElementById('coin');
  const coinSpot = document.getElementById('coinSpot');
  const slotEl = document.getElementById('slot');
  const coinReturn = document.getElementById('coinReturn');
  const led = document.getElementById('led');
  const led1 = document.getElementById('led1');
  const led2 = document.getElementById('led2');
  const tray = document.getElementById('tray');
  const trayItem = document.getElementById('trayItem');

  let powered = false;
  let buffer = '';
  let busy = false;

  /* ---------- LED display ---------- */
  function setLED(top, bottom = '', scroll = false) {
    led1.textContent = top;
    led2.textContent = bottom;
    led2.classList.toggle('still', !scroll && bottom.length <= 14);
  }
  function ledError(top, bottom) {
    setLED(top, bottom);
    led.classList.remove('err'); void led.offsetWidth; led.classList.add('err');
    sfx.error();
  }
  function readyMessage() {
    setLED('CREDIT: 1', 'ENTER A CODE · A1 A2 B1 B2 C1 · ', true);
  }

  /* ---------- power on ---------- */
  function powerOn(withShow) {
    powered = true;
    machine.classList.add('on');
    coinSpot.classList.add('gone');
    store.set('rabab-credit', '1');
    if (withShow) {
      machine.classList.add('booting');
      sfx.power();
      setLED('BOOTING...', '');
      setTimeout(() => { machine.classList.remove('booting'); readyMessage(); }, 1100);
      setTimeout(() => dropChange(false), 700);
    } else {
      readyMessage();
      dropChange(true);
    }
  }

  // the coin comes back as "change": this machine is free, it just wanted to meet you
  function dropChange(instant) {
    if (coinReturn.querySelector('.mini')) return;
    const mini = document.createElement('div');
    mini.className = 'mini';
    const img = coin.querySelector('img').cloneNode();
    img.alt = '';
    mini.appendChild(img);
    coinReturn.appendChild(mini);
    if (!instant && !reduceMotion) {
      mini.animate([{ transform: 'translateY(-40px)' }, { transform: 'translateY(0)' }, { transform: 'translateY(-6px)' }, { transform: 'translateY(0)' }],
        { duration: 500, easing: 'ease-in' });
      tone(1500, 0.06, 'triangle', 0.04, 0.35);
    }
  }

  /* ---------- coin: drag into the slot, or press ---------- */
  let drag = null;

  coin.addEventListener('pointerdown', (e) => {
    if (powered) return;
    coin.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, moved: false };
    coin.classList.add('dragging');
  });

  coin.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
    coin.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 8}deg) scale(1.05)`;
    slotEl.classList.toggle('hot', overSlot());
  });

  function endDrag() {
    if (!drag) return;
    // decide BEFORE removing .dragging (the bobbing CSS animation would override the drag position)
    const wasDrag = drag.moved;
    const hit = overSlot();
    drag = null;
    slotEl.classList.remove('hot');
    if (!wasDrag || hit) {
      insertCoin();
    } else {
      // missed: the coin slides back
      const from = coin.style.transform;
      coin.style.transform = '';
      coin.classList.remove('dragging');
      coin.animate([{ transform: from }, { transform: 'translate(0,0)' }],
        { duration: 350, easing: 'cubic-bezier(.3,1.5,.6,1)' });
    }
  }
  coin.addEventListener('pointerup', endDrag);
  coin.addEventListener('pointercancel', endDrag);

  coin.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); insertCoin(); }
  });

  function overSlot() {
    const c = coin.getBoundingClientRect();
    const s = slotEl.getBoundingClientRect();
    const cx = c.left + c.width / 2, cy = c.top + c.height / 2;
    return cx > s.left - 30 && cx < s.right + 30 && cy > s.top - 30 && cy < s.bottom + 30;
  }

  function insertCoin() {
    if (powered) return;
    const c = coin.getBoundingClientRect();
    const s = slotEl.getBoundingClientRect();
    const t = getComputedStyle(coin).transform;
    const current = new DOMMatrixReadOnly(t === 'none' ? undefined : t);
    const baseX = c.left - current.m41, baseY = c.top - current.m42;
    const tx = s.left + s.width / 2 - (baseX + c.width / 2);
    const ty = s.top + s.height / 2 - (baseY + c.height / 2);
    coin.style.animation = 'none';
    const anim = coin.animate([
      { transform: `translate(${current.m41}px, ${current.m42}px)` },
      { transform: `translate(${tx}px, ${ty}px) rotateY(0deg) scale(.7)`, offset: 0.7 },
      { transform: `translate(${tx}px, ${ty}px) rotateY(88deg) scale(.55)`, opacity: 1, offset: 0.85 },
      { transform: `translate(${tx}px, ${ty + 20}px) rotateY(90deg) scale(.4)`, opacity: 0 }
    ], { duration: reduceMotion ? 1 : 750, easing: 'ease-in-out', fill: 'forwards' });
    sfx.coin();
    anim.onfinish = () => powerOn(true);
  }

  /* ---------- keypad ---------- */
  document.getElementById('keypad').addEventListener('click', (e) => {
    const btn = e.target.closest('.key');
    if (btn) press(btn.dataset.k);
  });

  function keypadFromKeyboard(e) {
    const k = e.key.toUpperCase();
    let mapped = null;
    if (['A', 'B', 'C', '1', '2', '3'].includes(k)) mapped = k;
    else if (k === 'ENTER') mapped = 'OK';
    else if (k === 'BACKSPACE' || k === 'ESCAPE' || k === 'DELETE') mapped = 'CLR';
    if (!mapped) return;
    if (k === 'ENTER' && document.activeElement && document.activeElement.matches('a, button')) return;
    e.preventDefault();
    const btn = document.querySelector(`.key[data-k="${mapped}"]`);
    if (btn) { btn.classList.add('pressed'); setTimeout(() => btn.classList.remove('pressed'), 120); }
    press(mapped);
  }

  function press(k) {
    sfx.key();
    if (busy) return;
    if (!powered) { ledError('INSERT COIN', 'MY FACE IS THE COIN'); return; }

    if (k === 'CLR') { buffer = ''; readyMessage(); return; }
    if (k === 'OK') { if (buffer.length === 2) vend(); else ledError('CODE?', 'LETTER + NUMBER'); return; }

    if (/[ABC]/.test(k)) {
      buffer = k;
      setLED('CODE: ' + k + '_', 'NOW A NUMBER');
    } else {
      if (buffer.length !== 1) { buffer = ''; ledError('LETTER FIRST', 'e.g. A then 1'); return; }
      buffer += k;
      setLED('CODE: ' + buffer, '');
      setTimeout(vend, 280);
    }
  }

  /* ---------- vending ---------- */
  function vend() {
    const code = buffer;
    buffer = '';
    if (!code) return;
    const slot = glass.querySelector(`.slot[data-code="${code}"]`);
    if (!slot) { ledError('NO ' + code, 'TRY A1 · B2 · C1'); return; }
    if (slot.dataset.soldout) {
      ledError(code + ' SOLD OUT', 'FREE TIME: GONE SINCE 2025');
      flashPrice(slot);
      return;
    }
    dispense(slot, code);
  }

  function flashPrice(slot) {
    const p = slot.querySelector('.price');
    p.classList.remove('flash'); void p.offsetWidth; p.classList.add('flash');
  }

  function dispense(slot, code) {
    busy = true;
    const snack = slot.querySelector('.snack');
    const coil = slot.querySelector('.coil');
    const label = snack.querySelector('.snack-flavor').textContent.toUpperCase();
    setLED('VENDING ' + code, label);
    clearTray();

    // clone the snack inside the glass so it can fall freely
    const g = glass.getBoundingClientRect();
    const r = snack.getBoundingClientRect();
    const clone = snack.cloneNode(true);
    clone.removeAttribute('href');
    clone.classList.add('falling');
    Object.assign(clone.style, {
      left: (r.left - g.left - glass.clientLeft) + 'px',
      top: (r.top - g.top - glass.clientTop) + 'px',
      width: r.width + 'px',
      height: r.height + 'px'
    });
    glass.appendChild(clone);
    snack.style.visibility = 'hidden';

    coil.classList.remove('spin'); void coil.offsetWidth; coil.classList.add('spin');
    sfx.whirr();

    const fallDist = glass.clientHeight - (r.top - g.top) + 30;
    const spin = Math.random() > 0.5 ? 1 : -1;

    // step 1: the spiral pushes it forward to the edge
    const push = clone.animate([
      { transform: 'translateY(0) scale(1) rotate(0)' },
      { transform: `translateY(-2px) scale(1.14) rotate(${-4 * spin}deg)` }
    ], { duration: reduceMotion ? 1 : 900, easing: 'ease-in-out', fill: 'forwards' });

    push.onfinish = () => {
      // step 2: gravity
      const fall = clone.animate([
        { transform: `translateY(-2px) scale(1.14) rotate(${-4 * spin}deg)` },
        { transform: `translateY(${fallDist}px) scale(1.14) rotate(${28 * spin}deg)` }
      ], { duration: reduceMotion ? 1 : 520, easing: 'cubic-bezier(.55,0,1,.45)', fill: 'forwards' });

      fall.onfinish = () => {
        clone.remove();
        sfx.thud();
        machine.classList.remove('shake'); void machine.offsetWidth; machine.classList.add('shake');
        fillTray(snack);
        setLED('TAKE ITEM', '▾ TAP THE TRAY ▾');
        busy = false;
        // restock the shelf
        setTimeout(() => {
          snack.style.visibility = '';
          if (!reduceMotion) snack.animate([
            { transform: 'translateY(-16px) scale(.8)', opacity: 0 },
            { transform: 'none', opacity: 1 }
          ], { duration: 500, easing: 'ease-out' });
        }, 900);
      };
    };
  }

  function fillTray(snack) {
    const mini = document.createElement('span');
    mini.className = snack.className;
    mini.setAttribute('style', snack.getAttribute('style'));
    mini.style.visibility = '';
    mini.innerHTML = snack.innerHTML;
    const rest = snack.classList.contains('candybar') ? 'rotate(-6deg) scale(.8)' : 'rotate(78deg) scale(.7)';
    trayItem.style.transform = rest;
    trayItem.innerHTML = '';
    trayItem.appendChild(mini);
    trayItem.href = snack.getAttribute('href');
    trayItem.dataset.bg = snack.dataset.bg || '';
    if (snack.dataset.external) {
      trayItem.target = '_blank';
      trayItem.rel = 'noopener';
      trayItem.dataset.external = 'true';
    } else {
      trayItem.removeAttribute('target');
      delete trayItem.dataset.external;
    }
    trayItem.setAttribute('aria-label', 'Take your item: ' + snack.querySelector('.snack-flavor').textContent);
    tray.classList.add('has-item');
    if (!reduceMotion) trayItem.animate([
      { transform: 'translateY(-60px) ' + rest.replace(/rotate\([^)]*\)/, 'rotate(40deg)') },
      { transform: 'translateY(4px) ' + rest, offset: 0.7 },
      { transform: 'translateY(0) ' + rest }
    ], { duration: 420, easing: 'ease-out' });
  }

  function clearTray() {
    tray.classList.remove('has-item');
    trayItem.innerHTML = '';
    trayItem.setAttribute('href', '#');
  }

  /* ---------- taking the item from the tray ---------- */
  trayItem.addEventListener('click', (e) => {
    if (!tray.classList.contains('has-item')) { e.preventDefault(); return; }
    if (trayItem.dataset.external) {
      setLED('ENJOY THE', 'THROWBACK ↗');
      return; // Homework 7 opens in a new tab
    }
    e.preventDefault();
    const target = trayItem.getAttribute('href');
    const r = trayItem.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const wipe = document.createElement('div');
    wipe.className = 'pack-wipe';
    wipe.style.background = trayItem.dataset.bg || '#1A0F2E';
    document.body.appendChild(wipe);
    sfx.open();
    const radius = Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy));
    const a = wipe.animate([
      { clipPath: `circle(0px at ${cx}px ${cy}px)` },
      { clipPath: `circle(${radius}px at ${cx}px ${cy}px)` }
    ], { duration: reduceMotion ? 1 : 600, easing: 'cubic-bezier(.7,0,.3,1)', fill: 'forwards' });
    a.onfinish = () => { location.hash = target; };
  });

  /* ---------- clicking a snack through the glass ---------- */
  glass.addEventListener('click', (e) => {
    const snack = e.target.closest('.snack');
    const slot = e.target.closest('.slot');
    if (!slot) return;
    e.preventDefault();
    if (!powered) { ledError('INSERT COIN', 'MY FACE IS THE COIN'); return; }
    ledError('USE KEYPAD', 'CODE ' + slot.dataset.code + ' · GLASS IS GLASS');
    flashPrice(slot);
    if (snack) snack.animate([{ transform: 'none' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'none' }], 240);
  });

  /* ================================================================
     PART 2: THE SNACK PAGES
  ================================================================ */
  let leaving = false;

  // stagger the contents of every pack
  document.querySelectorAll('.pack').forEach((pack) => {
    pack.querySelectorAll('.contents > *').forEach((el, i) => el.style.setProperty('--i', i));
    pack.querySelectorAll('.dv').forEach((el, j) => el.style.setProperty('--j', j));
    pack.querySelector('.bin').addEventListener('click', () => toss(pack));
    enableWrapperDrag(pack);
  });

  // flip cards on tap (touch screens have no hover)
  document.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('click', () => card.classList.toggle('flipped'));
  });

  // bubbles for the soda can
  const bubbles = document.querySelector('#aspirations .bubbles');
  if (bubbles && !reduceMotion) {
    for (let i = 0; i < 26; i++) {
      const b = document.createElement('span');
      const size = 8 + Math.random() * 34;
      b.style.width = b.style.height = size + 'px';
      b.style.left = Math.random() * 100 + 'vw';
      b.style.setProperty('--drift', (Math.random() * 80 - 40) + 'px');
      b.style.animationDuration = 7 + Math.random() * 10 + 's';
      b.style.animationDelay = -Math.random() * 15 + 's';
      bubbles.appendChild(b);
    }
  }

  function openPack(pack) {
    const wrapper = pack.querySelector('.wrapper');
    const tear = pack.querySelector('.tear');
    // reset anything left over from last time
    wrapper.getAnimations().forEach((a) => a.cancel());
    wrapper.style.animation = '';
    wrapper.style.transform = '';
    wrapper.style.transformOrigin = '';
    tear.style.display = '';
    pack.querySelectorAll('.card.flipped').forEach((c) => c.classList.remove('flipped'));
    pack.classList.remove('opened');
    // rip it open, then remove the strip so it can't widen the page
    setTimeout(() => pack.classList.add('opened'), reduceMotion ? 0 : 450);
    tear.onanimationend = () => { tear.style.display = 'none'; };
  }

  function toss(pack) {
    if (leaving) return;
    leaving = true;
    crunch();
    const wrapper = pack.querySelector('.wrapper');
    const bin = pack.querySelector('.bin');
    const w = wrapper.getBoundingClientRect();
    const b = bin.getBoundingClientRect();
    // only animate the part of the wrapper that's on screen
    const visTop = Math.max(w.top, 0), visBottom = Math.min(w.bottom, innerHeight);
    const cx = w.left + w.width / 2, cy = (visTop + visBottom) / 2;
    const dx = b.left + b.width / 2 - cx;
    const dy = b.top + 20 - cy;
    wrapper.style.transformOrigin = `50% ${cy - w.top}px`;
    wrapper.style.animation = 'none';

    const anim = wrapper.animate([
      { transform: 'rotate(-1deg)', borderRadius: '0', filter: 'drop-shadow(0 26px 40px rgba(0,0,0,.45))' },
      { transform: 'rotate(10deg) scale(.55, .4)', borderRadius: '30%', filter: 'drop-shadow(0 10px 10px rgba(0,0,0,.4)) contrast(1.3) brightness(.85)', offset: 0.35 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 160}px) rotate(220deg) scale(.12)`, borderRadius: '50%', offset: 0.7 },
      { transform: `translate(${dx}px, ${dy}px) rotate(400deg) scale(.04)`, borderRadius: '50%', opacity: 0.9 }
    ], { duration: reduceMotion ? 1 : 1000, easing: 'cubic-bezier(.45,0,.55,1)', fill: 'forwards' });

    bin.classList.add('gulp');
    anim.onfinish = () => {
      bin.classList.remove('gulp'); void bin.offsetWidth; bin.classList.add('gulp');
      setTimeout(() => {
        bin.classList.remove('gulp');
        // back to the machine (removes the #hash)
        history.pushState('', document.title, location.pathname + location.search);
        route();
      }, reduceMotion ? 0 : 300);
    };
  }

  // drag the whole wrapper onto the bin (mouse only)
  function enableWrapperDrag(pack) {
    const wrapper = pack.querySelector('.wrapper');
    const bin = pack.querySelector('.bin');
    let d = null;
    const nearBin = (e) => {
      const b = bin.getBoundingClientRect();
      return Math.hypot(e.clientX - (b.left + b.width / 2), e.clientY - (b.top + b.height / 2)) < 120;
    };
    wrapper.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.target.closest('a, button, .card')) return;
      d = { x: e.clientX, y: e.clientY, active: false };
    });
    window.addEventListener('pointermove', (e) => {
      if (!d || leaving) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (!d.active && Math.hypot(dx, dy) < 12) return;
      d.active = true;
      document.body.style.userSelect = 'none';
      wrapper.style.animation = 'none';
      wrapper.style.transform = `translate(${dx}px, ${dy}px) rotate(${-1 + dx / 60}deg)`;
      bin.classList.toggle('gulp', nearBin(e));
    });
    window.addEventListener('pointerup', (e) => {
      if (!d) return;
      const wasActive = d.active;
      d = null;
      document.body.style.userSelect = '';
      if (!wasActive) return;
      bin.classList.remove('gulp');
      if (nearBin(e)) { wrapper.style.transform = ''; toss(pack); }
      else {
        wrapper.animate([{ transform: wrapper.style.transform }, { transform: 'rotate(-1deg)' }], { duration: 400, easing: 'cubic-bezier(.3,1.5,.6,1)' });
        wrapper.style.transform = 'rotate(-1deg)';
      }
    });
  }

  /* ================================================================
     PART 3: SWITCHING VIEWS (the #hash in the URL decides)
  ================================================================ */
  let current = null;
  function route() {
    const name = location.hash.replace('#', '');
    if (name === current) return; // hashchange + popstate can both fire
    current = name;
    const isPack = PACKS.includes(name);
    leaving = false;

    document.querySelectorAll('.pack').forEach((p) => {
      const on = p.id === name;
      p.hidden = !on;
      p.classList.toggle('active', on);
      if (!on) p.classList.remove('opened');
    });
    document.body.classList.toggle('in-pack', isPack);
    window.scrollTo(0, 0);

    if (isPack) {
      openPack(document.getElementById(name));
      document.title = document.getElementById(name).getAttribute('aria-label') + ' · RABAB-O-MATIC';
    } else {
      document.title = "RABAB-O-MATIC · Rabab's Portfolio";
      if (powered) { clearTray(); readyMessage(); }
    }

    // fade out the colour wipe that covered the switch
    document.querySelectorAll('.pack-wipe').forEach((wipe) => {
      const f = wipe.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reduceMotion ? 1 : 350, fill: 'forwards' });
      f.onfinish = () => wipe.remove();
    });
  }

  window.addEventListener('hashchange', route);
  window.addEventListener('popstate', route);

  /* ---------- keyboard ---------- */
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.body.classList.contains('in-pack')) {
      if (e.key === 'Escape') toss(document.querySelector('.pack.active'));
      return;
    }
    keypadFromKeyboard(e);
  });

  /* ---------- start ---------- */
  if (store.get('rabab-credit')) powerOn(false);
  route();
})();
