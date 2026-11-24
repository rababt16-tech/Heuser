/* /embedded page · Homework 10
   1. A live copy of the ESP32's dashboard (same data, same city buttons).
   2. An optional "try to embed Wokwi" button. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);

  /* ---------- 1. dashboard preview ---------- */
  const CITIES = [
    { name: 'Karachi',   lat: 24.8607, lon: 67.0011 },
    { name: 'Lahore',    lat: 31.5204, lon: 74.3587 },
    { name: 'Islamabad', lat: 33.6844, lon: 73.0479 }
  ];
  // the exact same request the ESP32 sends: 3 cities in 1 request
  const URL = 'https://api.open-meteo.com/v1/forecast' +
    '?latitude=' + CITIES.map((c) => c.lat).join(',') +
    '&longitude=' + CITIES.map((c) => c.lon).join(',') +
    '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day' +
    '&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset&forecast_days=1&timezone=Asia%2FKarachi';

  // WMO weather codes, same table as weatherText() in the sketch
  function sky(code) {
    const t = {
      0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Fog',
      51: 'Drizzle', 53: 'Drizzle', 55: 'Drizzle', 56: 'Freezing drizzle', 57: 'Freezing drizzle',
      61: 'Rain', 63: 'Rain', 65: 'Rain', 66: 'Freezing rain', 67: 'Freezing rain',
      71: 'Snow', 73: 'Snow', 75: 'Snow', 77: 'Snow', 80: 'Rain showers', 81: 'Rain showers', 82: 'Rain showers',
      85: 'Snow showers', 86: 'Snow showers', 95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with hail'
    };
    return t[code] || 'Unknown';
  }

  let data = null;
  let active = 0;
  const reading = $('reading');

  function show(i) {
    active = i;
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', Number(b.dataset.city) === i));
    if (!data) return;
    const cur = data[i].current;
    const day = data[i].daily;
    reading.classList.remove('swap'); void reading.offsetWidth; reading.classList.add('swap');
    $('temp').textContent = cur.temperature_2m.toFixed(1) + '°C';
    $('sky').textContent = sky(cur.weather_code) + (cur.is_day ? ' · day' : ' · night');
    $('feels').textContent = cur.apparent_temperature.toFixed(1) + '°C';
    $('hum').textContent = Math.round(cur.relative_humidity_2m) + '%';
    $('wind').textContent = Math.round(cur.wind_speed_10m) + ' km/h';
    $('range').textContent = Math.round(day.temperature_2m_max[0]) + '° / ' + Math.round(day.temperature_2m_min[0]) + '°';
    $('rise').textContent = day.sunrise[0].slice(11, 16);
    $('set').textContent = day.sunset[0].slice(11, 16);
  }

  async function load() {
    $('previewError').hidden = true;
    reading.classList.add('loading');
    $('sky').textContent = 'Connecting to Open-Meteo…';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const started = performance.now();
      const res = await fetch(URL, { signal: controller.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      if (!Array.isArray(json) || json.length !== CITIES.length) throw new Error('unexpected answer');
      data = json;
      reading.classList.remove('loading');
      $('foot').textContent = `1 request · 3 cities · ${Math.round(performance.now() - started)} ms · observed ${json[0].current.time.slice(11, 16)} PKT`;
      show(active);
    } catch (e) {
      reading.classList.remove('loading');
      $('previewError').hidden = false;
    } finally {
      clearTimeout(timer);
    }
  }

  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => show(Number(b.dataset.city))));
  $('retry').addEventListener('click', load);

  // Pakistan time, ticking every second (the ESP32 gets this from NTP)
  const clockFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Karachi', weekday: 'short', day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
  const tick = () => { $('clock').textContent = clockFmt.format(new Date()).replace(',', ' ·') + ' PKT'; };
  tick();
  setInterval(tick, 1000);

  load();
  setInterval(load, 10 * 60 * 1000); // refresh every 10 minutes, like the ESP32

  /* ---------- 2. optional Wokwi embed ---------- */
  const link = $('wokwiLink');
  $('embedBtn').addEventListener('click', () => {
    const frame = $('embedFrame');
    if (!link.href.includes('/projects/') || link.href.includes('YOUR-PROJECT-ID')) {
      frame.hidden = false;
      frame.innerHTML = '<p style="padding:20px;margin:0">Add the Wokwi share link to the big button first.</p>';
      return;
    }
    frame.hidden = false;
    frame.innerHTML = '';
    const iframe = document.createElement('iframe');
    iframe.src = link.href;
    iframe.title = 'Wokwi simulation';
    iframe.loading = 'lazy';
    iframe.allow = 'clipboard-write';
    frame.appendChild(iframe);
    $('embedBtn').hidden = true;
  });
})();
