/* ================================================================
   THE ASSEMBLY · /api page

   1. Ask OUR server for every country (/data/delegates).
      The server gets them from the World Bank API and remembers them.
   2. Seat every country in a half-circle hall, grouped by region.
   3. When a delegate is recognized (click, search, or draw):
      - their placard rises at the podium
      - the briefing shows World Bank facts
      - our server fetches a Wikipedia summary (/data/briefing/<code>)
================================================================ */
(function () {
  'use strict';

  /* ---------- region colours + short names (World Bank region ids) ---------- */
  const REGIONS = {
    EAS: { color: '#FF4FA3', short: 'East Asia & Pacific' },
    ECS: { color: '#5BC8F5', short: 'Europe & Central Asia' },
    LCN: { color: '#FF6B2C', short: 'Latin America & Caribbean' },
    MEA: { color: '#FFD23F', short: 'Middle East & N. Africa' },
    NAC: { color: '#C8F560', short: 'North America' },
    SAS: { color: '#B98BFF', short: 'South Asia' },
    SSF: { color: '#3FE0A8', short: 'Sub-Saharan Africa' }
  };
  const regionInfo = (d) => REGIONS[d.regionId] || { color: '#F4EAD5', short: d.region };

  /* ---------- page elements ---------- */
  const $ = (id) => document.getElementById(id);
  const svg = $('hemicycle');
  const hall = $('hall');
  const tooltip = $('tooltip');
  const loading = $('loading');
  const errorBox = $('error');
  const placard = $('placard');
  const search = $('search');
  const drawBtn = $('drawBtn');
  const regionsBox = $('regions');
  const SVG_NS = 'http://www.w3.org/2000/svg';

  let delegates = [];          // the data
  const seats = new Map();     // iso2 -> <g> seat element
  let ring = null;             // pulsing ring around the selected seat
  let selected = null;
  let activeRegion = null;
  let drawing = false;
  const speakers = [];
  const briefCache = new Map();

  const flagUrl = (iso2, size = 160) => `https://flagcdn.com/w${size}/${iso2.toLowerCase()}.png`;
  const fmt = new Intl.NumberFormat('en');

  /* ---------- a little gavel sound (no audio files) ---------- */
  let audio;
  function knock() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.12].forEach((delay) => {
        const t = audio.currentTime + delay;
        const o = audio.createOscillator();
        const g = audio.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(180, t);
        o.frequency.exponentialRampToValueAtTime(60, t + 0.1);
        g.gain.setValueAtTime(0.18, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        o.connect(g).connect(audio.destination);
        o.start(t); o.stop(t + 0.14);
      });
    } catch (e) {}
  }

  /* ================================================================
     1. LOAD THE DATA
  ================================================================ */
  async function load() {
    loading.hidden = false;
    errorBox.hidden = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const res = await fetch('/data/delegates', { signal: controller.signal });
      if (!res.ok) throw new Error('Server said ' + res.status);
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) throw new Error('No delegates');
      delegates = data;
      buildHall();
      buildRegions();
      enableControls();
      loading.hidden = true;
      $('seatCount').textContent = `${delegates.length} delegations seated across ${new Set(delegates.map((d) => d.regionId)).size} regional groups.`;
      // a shared link like /api/#CO opens straight onto that delegate
      const fromLink = location.hash.slice(1).toUpperCase();
      if (fromLink && seats.has(fromLink)) recognize(fromLink, { quiet: true });
    } catch (err) {
      loading.hidden = true;
      errorBox.hidden = false;
      $('seatCount').textContent = '';
    } finally {
      clearTimeout(timer);
    }
  }
  $('retryBtn').addEventListener('click', load);

  /* ================================================================
     2. SEAT EVERYONE IN A HALF-CIRCLE
  ================================================================ */
  function seatPositions(n) {
    const CX = 500, CY = 510, R0 = 220, R1 = 470;
    const rows = Math.min(9, Math.max(3, Math.round(n / 30)));
    const radii = Array.from({ length: rows }, (_, i) => R0 + (R1 - R0) * i / (rows - 1));
    const total = radii.reduce((a, b) => a + b, 0);
    const counts = radii.map((r) => Math.floor(n * r / total));
    let left = n - counts.reduce((a, b) => a + b, 0);
    for (let i = rows - 1; left > 0; i = (i - 1 + rows) % rows, left--) counts[i]++; // spare seats to outer rows

    const rowGap = (R1 - R0) / (rows - 1);
    const seatR = Math.min(...radii.map((r, i) => (Math.PI * r / counts[i]) * 0.36), rowGap * 0.36);

    const spots = [];
    radii.forEach((r, i) => {
      for (let j = 0; j < counts[i]; j++) {
        const angle = Math.PI * (1 - (j + 0.5) / counts[i]); // left (180°) to right (0°)
        spots.push({ x: CX + r * Math.cos(angle), y: CY - r * Math.sin(angle), angle, r });
      }
    });
    // sweep left to right so each region becomes one wedge, like a voting bloc
    spots.sort((a, b) => b.angle - a.angle || a.r - b.r);
    return { spots, seatR };
  }

  function buildHall() {
    svg.innerHTML = '';
    seats.clear();
    const { spots, seatR } = seatPositions(delegates.length);

    delegates.forEach((d, i) => {
      const spot = spots[i];
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', 'seat');
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label', d.name);
      g.dataset.iso2 = d.iso2;
      g.style.setProperty('--c', regionInfo(d).color);
      g.style.setProperty('--d', (i / delegates.length * 0.9).toFixed(3) + 's');
      const c = document.createElementNS(SVG_NS, 'circle');
      c.setAttribute('cx', spot.x.toFixed(1));
      c.setAttribute('cy', spot.y.toFixed(1));
      c.setAttribute('r', seatR.toFixed(1));
      g.appendChild(c);
      svg.appendChild(g);
      seats.set(d.iso2, g);
    });

    ring = document.createElementNS(SVG_NS, 'circle');
    ring.setAttribute('class', 'ring');
    ring.setAttribute('r', (seatR * 1.4).toFixed(1));
    svg.appendChild(ring);
  }

  // clicks, keyboard and hover on seats (one listener for all of them)
  svg.addEventListener('click', (e) => {
    const seat = e.target.closest('.seat');
    if (seat && !drawing) recognize(seat.dataset.iso2);
  });
  svg.addEventListener('keydown', (e) => {
    const seat = e.target.closest('.seat');
    if (seat && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); if (!drawing) recognize(seat.dataset.iso2); }
  });
  svg.addEventListener('pointerover', (e) => {
    const seat = e.target.closest('.seat');
    if (!seat) return;
    const d = byIso2(seat.dataset.iso2);
    const box = seat.getBoundingClientRect();
    const h = hall.getBoundingClientRect();
    tooltip.textContent = d.name;
    tooltip.style.left = (box.left + box.width / 2 - h.left) + 'px';
    tooltip.style.top = (box.top - h.top) + 'px';
    tooltip.hidden = false;
  });
  svg.addEventListener('pointerout', (e) => { if (e.target.closest('.seat')) tooltip.hidden = true; });

  const byIso2 = (iso2) => delegates.find((d) => d.iso2 === iso2);

  /* ---------- region filter chips ---------- */
  function buildRegions() {
    regionsBox.innerHTML = '';
    const counts = {};
    delegates.forEach((d) => { counts[d.regionId] = (counts[d.regionId] || 0) + 1; });
    Object.keys(counts).forEach((id) => {
      const sample = delegates.find((d) => d.regionId === id);
      const info = regionInfo(sample);
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.style.setProperty('--c', info.color);
      chip.setAttribute('aria-pressed', 'false');
      chip.dataset.region = id;
      chip.innerHTML = `<i></i>${info.short} <b>${counts[id]}</b>`;
      chip.addEventListener('click', () => filterRegion(activeRegion === id ? null : id));
      regionsBox.appendChild(chip);
    });
  }

  function filterRegion(id) {
    activeRegion = id;
    regionsBox.classList.toggle('filtering', !!id);
    regionsBox.querySelectorAll('.chip').forEach((chip) => chip.setAttribute('aria-pressed', String(chip.dataset.region === id)));
    delegates.forEach((d) => seats.get(d.iso2).classList.toggle('dim', !!id && d.regionId !== id));
  }

  /* ================================================================
     3. RECOGNIZE A DELEGATE
  ================================================================ */
  function recognize(iso2, opts = {}) {
    const d = byIso2(iso2);
    if (!d) return;
    if (selected) seats.get(selected).classList.remove('selected');
    selected = iso2;
    const seat = seats.get(iso2);
    seat.classList.add('selected');
    const c = seat.querySelector('circle');
    ring.setAttribute('cx', c.getAttribute('cx'));
    ring.setAttribute('cy', c.getAttribute('cy'));
    ring.classList.remove('on'); void ring.getBoundingClientRect(); ring.classList.add('on');
    svg.appendChild(seat);  // bring to front
    svg.appendChild(ring);

    // gavel + placard
    if (!opts.quiet) knock();
    const gavel = $('gavel');
    gavel.classList.remove('bang'); void gavel.offsetWidth; gavel.classList.add('bang');
    const flag = $('placardFlag');
    flag.src = flagUrl(d.iso2);
    flag.onerror = () => placard.classList.remove('has-flag');
    placard.classList.add('has-flag');
    placard.classList.remove('empty', 'rise'); void placard.offsetWidth; placard.classList.add('rise');
    $('placardName').textContent = d.name;

    fillBriefing(d);
    addSpeaker(d);
    try { history.replaceState(null, '', '#' + d.iso2); } catch (e) {}
  }

  function fillBriefing(d) {
    $('briefEmpty').hidden = true;
    const body = $('briefBody');
    body.hidden = false;
    body.classList.remove('enter'); void body.offsetWidth; body.classList.add('enter');

    const info = regionInfo(d);
    const flag = $('briefFlag');
    flag.style.display = '';
    flag.src = flagUrl(d.iso2);
    flag.alt = 'Flag of ' + d.name;
    flag.onerror = () => { flag.style.display = 'none'; };
    $('briefName').textContent = d.name;
    const chip = $('briefRegion');
    chip.textContent = d.region;
    chip.style.setProperty('--c', info.color);
    $('statCapital').textContent = d.capital || '—';
    $('statPop').textContent = d.population ? `${fmt.format(d.population)} (${d.populationYear})` : 'Not reported';
    $('statIncome').textContent = d.income && d.income !== 'Not classified' ? d.income : '—';
    $('statCoords').textContent = coords(d.lat, d.lon);

    loadNotes(d);
  }

  function coords(lat, lon) {
    const a = parseFloat(lat), b = parseFloat(lon);
    if (isNaN(a) || isNaN(b)) return '—';
    return `${Math.abs(a).toFixed(1)}°${a >= 0 ? 'N' : 'S'}, ${Math.abs(b).toFixed(1)}°${b >= 0 ? 'E' : 'W'}`;
  }

  async function loadNotes(d) {
    const notes = $('notes');
    if (briefCache.has(d.iso2)) { renderNotes(briefCache.get(d.iso2)); return; }
    notes.innerHTML = '<p class="muted">Fetching briefing notes from Wikipedia…</p>';
    try {
      const res = await fetch('/data/briefing/' + encodeURIComponent(d.iso2));
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'failed');
      briefCache.set(d.iso2, data);
      if (selected === d.iso2) renderNotes(data);
    } catch (e) {
      if (selected === d.iso2) notes.innerHTML = '<p class="muted">The briefing notes didn\'t arrive this time. The delegate will have to improvise! Try recognizing them again in a moment.</p>';
    }
  }

  function renderNotes(data) {
    const notes = $('notes');
    notes.innerHTML = '';
    if (data.image) {
      const img = document.createElement('img');
      img.src = data.image;
      img.alt = '';
      img.onerror = () => img.remove();
      notes.appendChild(img);
    }
    const p = document.createElement('p');
    p.textContent = data.extract || 'No summary available for this delegation.';
    notes.appendChild(p);
    if (data.url) {
      const a = document.createElement('a');
      a.href = data.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'Read the full file on Wikipedia ↗';
      notes.appendChild(a);
    }
  }

  function addSpeaker(d) {
    const i = speakers.indexOf(d.iso2);
    if (i !== -1) speakers.splice(i, 1);
    speakers.unshift(d.iso2);
    speakers.length = Math.min(speakers.length, 6);
    const list = $('speakers');
    list.innerHTML = '';
    speakers.forEach((code) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = byIso2(code).name;
      b.addEventListener('click', () => recognize(code));
      li.appendChild(b);
      list.appendChild(li);
    });
  }

  /* ---------- search: "call on a delegate" ---------- */
  $('searchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = search.value.trim().toLowerCase();
    if (!q) return;
    const match =
      delegates.find((d) => d.name.toLowerCase() === q || d.iso2.toLowerCase() === q || d.code.toLowerCase() === q) ||
      delegates.find((d) => d.name.toLowerCase().startsWith(q)) ||
      delegates.find((d) => d.name.toLowerCase().includes(q));
    if (match) {
      if (activeRegion && match.regionId !== activeRegion) filterRegion(null);
      recognize(match.iso2);
      search.value = '';
    } else {
      search.classList.remove('shake'); void search.offsetWidth; search.classList.add('shake');
      search.value = '';
      search.placeholder = `No delegation called "${q}". Try another name.`;
    }
  });

  /* ---------- draw: random allocation, like a MUN country draw ---------- */
  drawBtn.addEventListener('click', () => {
    if (drawing) return;
    const pool = delegates.filter((d) => !activeRegion || d.regionId === activeRegion);
    if (!pool.length) return;
    drawing = true;
    drawBtn.disabled = true;
    const hops = 18;
    let prev = null;
    let step = 0;
    const hop = () => {
      if (prev) seats.get(prev).classList.remove('spot');
      if (step === hops) {
        drawing = false;
        drawBtn.disabled = false;
        recognize(prev);
        return;
      }
      prev = pool[Math.floor(Math.random() * pool.length)].iso2;
      seats.get(prev).classList.add('spot');
      tone(400 + step * 25);
      step++;
      setTimeout(hop, 40 + step * step * 1.1); // slows down like a roulette wheel
    };
    hop();
  });

  function tone(freq) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const t = audio.currentTime;
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.03, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      o.connect(g).connect(audio.destination);
      o.start(t); o.stop(t + 0.07);
    } catch (e) {}
  }

  function enableControls() {
    search.disabled = false;
    drawBtn.disabled = false;
    document.querySelector('#searchForm button').disabled = false;
    const list = $('countryList');
    list.innerHTML = '';
    delegates.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach((d) => {
      const o = document.createElement('option');
      o.value = d.name;
      list.appendChild(o);
    });
  }

  placard.classList.add('empty');
  load();
})();
