/* ============ RABAB-O-MATIC : machine logic ============
   1. Insert the coin (drag it into the slot, or press it).
   2. Type a code on the keypad (or your keyboard): A1, A2, B1, B2, C1.
   3. The spiral turns, the snack falls into the tray.
   4. Take the snack from the tray -> you go to that page.
========================================================== */
(function () {
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
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let powered = false;
  let buffer = '';
  let busy = false;

  /* ---------- tiny storage helpers (can fail in some browsers) ---------- */
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
  const sfx = {
    key: () => tone(880, 0.05),
    error: () => { tone(160, 0.14, 'sawtooth', 0.04); tone(120, 0.18, 'sawtooth', 0.04, 0.15); },
    coin: () => { tone(1320, 0.08, 'triangle', 0.06); tone(1760, 0.12, 'triangle', 0.05, 0.08); },
    whirr: () => { for (let i = 0; i < 8; i++) tone(220 + (i % 2) * 30, 0.08, 'sawtooth', 0.02, i * 0.1); },
    thud: () => tone(70, 0.25, 'sine', 0.12),
    power: () => [330, 440, 660].forEach((f, i) => tone(f, 0.1, 'square', 0.03, i * 0.1))
  };

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
  function powerOn(withShow = true) {
    powered = true;
    machine.classList.add('on');
    coinSpot.classList.add('gone');
    store.set('rabab-credit', '1');
    if (withShow) {
      machine.classList.add('booting');
      sfx.power();
      setLED('BOOTING...', '');
      setTimeout(() => { machine.classList.remove('booting'); readyMessage(); }, 1100);
      setTimeout(dropChange, 700);
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
      // missed: coin slides back
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
    // where the coin is now vs. where the slot is
    const current = new DOMMatrixReadOnly(getComputedStyle(coin).transform === 'none' ? undefined : getComputedStyle(coin).transform);
    const baseX = c.left - current.m41, baseY = c.top - current.m42;
    const tx = s.left + s.width / 2 - (baseX + c.width / 2);
    const ty = s.top + s.height / 2 - (baseY + c.height / 2);
    coin.style.animation = 'none';
    const anim = coin.animate([
      { transform: `translate(${current.m41}px, ${current.m42}px)` },
      { transform: `translate(${tx}px, ${ty}px) rotateY(0deg) scale(.7)`, offset: .7 },
      { transform: `translate(${tx}px, ${ty}px) rotateY(88deg) scale(.55)`, opacity: 1, offset: .85 },
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

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toUpperCase();
    let mapped = null;
    if (['A', 'B', 'C', '1', '2', '3'].includes(k)) mapped = k;
    else if (k === 'ENTER') mapped = 'OK';
    else if (k === 'BACKSPACE' || k === 'ESCAPE' || k === 'DELETE') mapped = 'CLR';
    if (!mapped) return;
    if (k === 'ENTER' && document.activeElement && document.activeElement.matches('a, .key')) return;
    e.preventDefault();
    const btn = document.querySelector(`.key[data-k="${mapped}"]`);
    if (btn) { btn.classList.add('pressed'); setTimeout(() => btn.classList.remove('pressed'), 120); }
    press(mapped);
  });

  function press(k) {
    sfx.key();
    if (busy) return;
    if (!powered) { ledError('INSERT COIN', 'MY FACE IS THE COIN'); return; }

    if (k === 'CLR') { buffer = ''; readyMessage(); return; }
    if (k === 'OK') { buffer.length === 2 ? vend() : ledError('CODE?', 'LETTER + NUMBER'); return; }

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
    const rest = snack.classList.contains('bar') ? 'rotate(-6deg) scale(.8)' : 'rotate(78deg) scale(.7)';
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
      { transform: 'translateY(4px) ' + rest, offset: .7 },
      { transform: 'translateY(0) ' + rest }
    ], { duration: 420, easing: 'ease-out' });
  }

  function clearTray() {
    tray.classList.remove('has-item');
    trayItem.innerHTML = '';
    trayItem.setAttribute('href', '#');
  }

  /* ---------- taking the item = navigating ---------- */
  trayItem.addEventListener('click', (e) => {
    if (!tray.classList.contains('has-item')) { e.preventDefault(); return; }
    if (trayItem.dataset.external) {
      setLED('ENJOY THE', 'THROWBACK ↗');
      return; // opens Homework 7 in a new tab
    }
    e.preventDefault();
    const href = trayItem.getAttribute('href');
    const r = trayItem.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const wipe = document.createElement('div');
    wipe.className = 'wipe';
    wipe.style.background = trayItem.dataset.bg || '#1A0F2E';
    document.body.appendChild(wipe);
    tone(520, 0.08, 'triangle', 0.04); tone(780, 0.1, 'triangle', 0.04, 0.08);
    const radius = Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy));
    const a = wipe.animate([
      { clipPath: `circle(0px at ${cx}px ${cy}px)` },
      { clipPath: `circle(${radius}px at ${cx}px ${cy}px)` }
    ], { duration: reduceMotion ? 1 : 600, easing: 'cubic-bezier(.7,0,.3,1)', fill: 'forwards' });
    a.onfinish = () => { window.location.href = href; };
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

  /* ---------- returning visitors ---------- */
  if (store.get('rabab-credit')) powerOn(false);

  // back-button from a page: remove any leftover wipe
  window.addEventListener('pageshow', () => {
    document.querySelectorAll('.wipe').forEach((w) => w.remove());
    if (powered) { clearTray(); readyMessage(); }
  });
})();
