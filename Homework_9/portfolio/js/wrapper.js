/* ============ Snack wrapper pages ============
   - On load: the tear strip rips off and the contents slide out.
   - To go back: toss the wrapper in the bin (click the bin, press Esc,
     or drag the wrapper's tear area onto the bin). It crumples into a ball,
     flies into the bin, and you're back at the machine.
============================================== */
(function () {
  const body = document.body;
  const wrapper = document.getElementById('wrapper');
  const bin = document.getElementById('bin');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let leaving = false;

  // stagger the contents
  document.querySelectorAll('.contents > *').forEach((el, i) => el.style.setProperty('--i', i));
  document.querySelectorAll('.dv').forEach((el, j) => el.style.setProperty('--j', j));

  // rip it open (then remove the strip so it can't widen the page)
  setTimeout(() => body.classList.add('opened'), reduceMotion ? 0 : 450);
  const tear = document.getElementById('tear');
  if (tear) tear.addEventListener('animationend', () => { tear.style.display = 'none'; });

  // flip cards on tap (touch screens have no hover)
  document.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('click', () => card.classList.toggle('flipped'));
  });

  // bubbles for the soda page
  const bubbles = document.querySelector('.bubbles');
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

  function crunch() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const len = ctx.sampleRate * 0.35;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2) * (Math.random() > 0.7 ? 1 : 0.2);
      const src = ctx.createBufferSource();
      const g = ctx.createGain();
      g.gain.value = 0.12;
      src.buffer = buf;
      src.connect(g).connect(ctx.destination);
      src.start();
    } catch (e) {}
  }

  function toss() {
    if (leaving) return;
    leaving = true;
    crunch();
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
      { transform: 'rotate(10deg) scale(.55, .4)', borderRadius: '30%', filter: 'drop-shadow(0 10px 10px rgba(0,0,0,.4)) contrast(1.3) brightness(.85)', offset: .35 },
      { transform: `translate(${dx * .5}px, ${dy * .5 - 160}px) rotate(220deg) scale(.12)`, borderRadius: '50%', offset: .7 },
      { transform: `translate(${dx}px, ${dy}px) rotate(400deg) scale(.04)`, borderRadius: '50%', opacity: .9 }
    ], { duration: reduceMotion ? 1 : 1000, easing: 'cubic-bezier(.45,0,.55,1)', fill: 'forwards' });

    bin.classList.add('gulp');
    anim.onfinish = () => {
      bin.classList.remove('gulp'); void bin.offsetWidth; bin.classList.add('gulp');
      setTimeout(() => { window.location.href = 'index.html'; }, reduceMotion ? 0 : 300);
    };
  }

  bin.addEventListener('click', toss);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toss(); });

  // drag the whole wrapper toward the bin (desktop nicety)
  let drag = null;
  wrapper.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.target.closest('a, button, .card')) return;
    drag = { x: e.clientX, y: e.clientY, active: false };
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag || leaving) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.active && Math.hypot(dx, dy) < 12) return;
    drag.active = true;
    body.style.userSelect = 'none';
    wrapper.style.animation = 'none';
    wrapper.style.transform = `translate(${dx}px, ${dy}px) rotate(${-1 + dx / 60}deg)`;
    const b = bin.getBoundingClientRect();
    bin.classList.toggle('gulp', Math.hypot(e.clientX - (b.left + b.width / 2), e.clientY - (b.top + b.height / 2)) < 120);
  });
  window.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const wasActive = drag.active;
    drag = null;
    body.style.userSelect = '';
    if (!wasActive) return;
    const b = bin.getBoundingClientRect();
    const near = Math.hypot(e.clientX - (b.left + b.width / 2), e.clientY - (b.top + b.height / 2)) < 120;
    bin.classList.remove('gulp');
    if (near) { wrapper.style.transform = ''; toss(); }
    else {
      wrapper.animate([{ transform: wrapper.style.transform }, { transform: 'rotate(-1deg)' }], { duration: 400, easing: 'cubic-bezier(.3,1.5,.6,1)' });
      wrapper.style.transform = 'rotate(-1deg)';
    }
  });

  // back/forward cache: undo a half-finished toss
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) { leaving = false; wrapper.getAnimations().forEach((a) => a.cancel()); }
  });
})();
