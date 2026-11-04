// 4Rent — pobieranie danych ogłoszeń (w tle, z pamięcią podręczną).
'use strict';

const TTL_MS = 6 * 60 * 60 * 1000; // 6 godzin
const MAX_PARALLEL = 4;
const MAX_RENT = 40000; // „najem” powyżej tej kwoty to na pewno sprzedaż
const NOT_RENTAL = 'NOT_RENTAL';
const AD_PREFIX = 'ad2:'; // v2: dane z lokalizacją (dojazd)
const memCache = new Map();
const inflight = new Map();
let active = 0;
const queue = [];

function runQueued(fn) {
  return new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    pump();
  });
}
function pump() {
  while (active < MAX_PARALLEL && queue.length) {
    const { fn, resolve, reject } = queue.shift();
    active++;
    fn().then(resolve, reject).finally(() => { active--; pump(); });
  }
}

function cleanUrl(u) {
  try {
    const x = new URL(u);
    return x.origin + x.pathname;
  } catch (e) {
    return u;
  }
}

function keyOf(ref) {
  return ref.site + ':' + (ref.id || cleanUrl(ref.url));
}

async function getAd(ref) {
  const key = keyOf(ref);
  const m = memCache.get(key);
  if (m && Date.now() - m.t < TTL_MS) return m.data;
  const stored = (await chrome.storage.local.get(AD_PREFIX + key))[AD_PREFIX + key];
  if (stored && Date.now() - stored.t < TTL_MS) {
    memCache.set(key, stored);
    return stored.data;
  }
  if (inflight.has(key)) return inflight.get(key);
  const p = runQueued(() => (ref.site === 'otodom' ? fetchOtodom(ref.url) : fetchOlx(ref))).then(async data => {
    const entry = { t: Date.now(), data };
    memCache.set(key, entry);
    try { await chrome.storage.local.set({ [AD_PREFIX + key]: entry }); } catch (e) { /* pełna pamięć — trudno */ }
    return data;
  }).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function fetchText(url) {
  const r = await fetch(url, { credentials: 'include' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.text();
}

async function fetchOtodom(url) {
  const html = await fetchText(cleanUrl(url));
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('Brak danych ogłoszenia');
  const ad = JSON.parse(m[1]).props?.pageProps?.ad;
  if (!ad) throw new Error('To nie jest pojedyncze ogłoszenie');
  const t = ad.target || {};
  const ch = Object.fromEntries((ad.characteristics || []).map(c => [c.key, c.value]));
  const num = v => (v == null || v === '' ? null : parseFloat(v));
  const price = num(t.Price) ?? num(ch.price);
  // tylko wynajem — ogłoszenia sprzedaży wtyczka pomija
  if ((t.OfferType && t.OfferType !== 'wynajem') || price > MAX_RENT) throw new Error(NOT_RENTAL);
  const loc = ad.location || {};
  const co = loc.coordinates || {};
  const cityName = ((loc.reverseGeocoding && loc.reverseGeocoding.locations) || []).filter(x => x.locationLevel === 'city_or_village').map(x => x.name)[0] || null;
  return {
    site: 'otodom',
    title: ad.title,
    price,
    adminRent: num(t.Rent) ?? num(ch.rent),
    deposit: num(t.Deposit) ?? num(ch.deposit),
    description: ad.description || '',
    // lokalizacja do liczenia dojazdu; radius 0 = dokładny punkt, >0 = przybliżony (w metrach)
    location: co.latitude ? {
      lat: co.latitude, lon: co.longitude,
      radiusM: num(loc.mapDetails && loc.mapDetails.radius) || 0,
      street: (loc.address && loc.address.street && loc.address.street.name) || null,
      city: cityName,
    } : null,
  };
}

async function fetchOlx(ref) {
  let id = ref.id;
  if (!id) {
    const html = await fetchText(cleanUrl(ref.url));
    const m = html.match(/"sku"\s*:\s*"(\d+)"/) || html.match(/ID:\s*(?:<[^>]*>\s*)*(\d{6,})/);
    if (!m) throw new Error('Nie znaleziono numeru ogłoszenia');
    id = m[1];
  }
  const r = await fetch('https://www.olx.pl/api/v1/offers/' + id + '/', { credentials: 'include' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const d = (await r.json()).data;
  const param = k => (d.params || []).find(p => p.key === k);
  const price = param('price')?.value?.value ?? null;
  const rentRaw = param('rent')?.value?.key ?? param('rent')?.value?.label ?? null;
  const rent = rentRaw != null ? parseFloat(String(rentRaw).replace(/[^\d.,]/g, '').replace(',', '.')) : null;
  if (price > MAX_RENT) throw new Error(NOT_RENTAL);
  const map = d.map || {};
  return {
    site: 'olx',
    title: d.title,
    price,
    adminRent: isFinite(rent) ? rent : null,
    deposit: null,
    description: d.description || '',
    // OLX zwykle podaje tylko okolicę (radius w km); ulicę próbujemy wyczytać z tytułu/opisu
    location: map.lat ? {
      lat: map.lat, lon: map.lon,
      radiusM: map.show_detailed ? 0 : 1500, // OLX bez dokładnego adresu: tylko okolica
      areaOnly: !map.show_detailed,
      street: streetFromText(d.title) || streetFromText(d.description),
      city: (d.location && d.location.city && d.location.city.name) || null,
    } : null,
  };
}

// „ul. Śliczna 16”, „ulica Kunickiego” → „Śliczna 16”
function streetFromText(s) {
  if (!s) return null;
  const t = String(s).replace(/<[^>]+>/g, ' ');
  const m = t.match(/(?<!\p{L})(?:ul\.|ulica|ulicy|al\.|aleja|alei|pl\.|plac|placu|os\.|osiedle)\s*((?:\p{Lu}[\p{L}.-]*\s*){1,3})(\d+[a-zA-Z]?)?/u);
  return m ? (m[1].trim() + (m[2] ? ' ' + m[2] : '')).trim() : null;
}

// ---------- Dojazd komunikacją (Transitous / MOTIS) ----------
// Transitous: darmowy planer dla projektów open-source, https://transitous.org/api/
// User-Agent z kontaktem ustawia reguła declarativeNetRequest (rules.json).
const TRANSITOUS = 'https://api.transitous.org/api';
const ROUTE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function cached(key, ttl, fn) {
  const hit = (await chrome.storage.local.get(key))[key];
  if (hit && Date.now() - hit.t < ttl) return hit.v;
  const v = await fn();
  try { await chrome.storage.local.set({ [key]: { t: Date.now(), v } }); } catch (e) { /* pełna pamięć */ }
  return v;
}

function distM(a, b) {
  const R = 6371000, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function geocode(text, near) {
  const key = 'gc:' + text.toLowerCase();
  return cached(key, 30 * 24 * 3600 * 1000, async () => {
    let url = TRANSITOUS + '/v1/geocode?language=pl&text=' + encodeURIComponent(text);
    if (near) url += '&place=' + near.lat + ',' + near.lon;
    const r = await fetch(url);
    if (!r.ok) throw new Error('geokodowanie: HTTP ' + r.status);
    return (await r.json()).filter(x => x.type !== 'STOP').slice(0, 8).map(x => ({ lat: x.lat, lon: x.lon, name: x.name, type: x.type }));
  });
}

// Najbliższy dzień roboczy (od jutra) o podanej godzinie, czas warszawski, w formacie ISO z przesunięciem
function nextWeekdayAt(hhmm) {
  const [h, m] = String(hhmm || '09:00').split(':').map(x => parseInt(x, 10) || 0);
  const pad = n => String(n).padStart(2, '0');
  for (let i = 1; i <= 7; i++) {
    const d = new Date(Date.now() + i * 86400000);
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(d);
    const g = t => parts.find(p => p.type === t).value;
    if (g('weekday') === 'Sat' || g('weekday') === 'Sun') continue;
    const date = `${g('year')}-${g('month')}-${g('day')}`;
    const off = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Warsaw', timeZoneName: 'shortOffset' })
      .formatToParts(new Date(`${date}T12:00:00Z`)).find(p => p.type === 'timeZoneName').value; // „GMT+1”
    const om = off.match(/GMT([+-])(\d+)(?::(\d+))?/) || [null, '+', '1', '00'];
    return `${date}T${pad(h)}:${pad(m)}:00${om[1]}${pad(om[2])}:${om[3] || '00'}`;
  }
}

const cleanStop = s => String(s || '').replace(/\s+\d{3,6}$/, '').trim();

function summarize(it) {
  const legs = it.legs || [];
  const ride = legs.filter(l => l.mode !== 'WALK' && l.mode !== 'BIKE' && l.mode !== 'CAR');
  const walkMin = Math.round(legs.filter(l => l.mode === 'WALK').reduce((s, l) => s + l.duration, 0) / 60);
  return {
    durationMin: Math.round(it.duration / 60),
    transfers: Math.max(0, ride.length - 1),
    walkMin,
    depart: it.startTime,
    arrive: it.endTime,
    walkToFirstMin: legs[0] && legs[0].mode === 'WALK' ? Math.round(legs[0].duration / 60) : 0,
    walkFromLastMin: legs.length && legs[legs.length - 1].mode === 'WALK' ? Math.round(legs[legs.length - 1].duration / 60) : 0,
    rides: ride.map(l => ({
      mode: l.mode, line: l.routeShortName || '', headsign: cleanStop(l.headsign),
      from: cleanStop(l.from && l.from.name), to: cleanStop(l.to && l.to.name),
      minutes: Math.round(l.duration / 60), depart: l.startTime,
    })),
  };
}

// „Najłatwiejsza” trasa: mało przesiadek i chodzenia; przy remisie — odjazd jak najpóźniej
function pickEasiest(itins, deadline) {
  const ok = itins.filter(it => !deadline || new Date(it.endTime) <= deadline);
  const pool = ok.length ? ok : itins;
  const score = it => {
    const s = summarize(it);
    return s.durationMin + 12 * s.transfers + 0.5 * s.walkMin;
  };
  return pool.slice().sort((a, b) => score(a) - score(b) || new Date(b.startTime) - new Date(a.startTime))[0];
}

async function resolveOrigin(loc) {
  const point = { lat: loc.lat, lon: loc.lon };
  if (loc.radiusM > 150 && loc.street) {
    try {
      const street = loc.street.replace(/^(ul\.|al\.|pl\.|os\.)\s*/i, '');
      const res = await geocode(street + ', ' + (loc.city || 'Wrocław'), point);
      const best = res.map(r => ({ ...r, d: distM(point, r) })).filter(r => r.d <= Math.max(loc.radiusM * 2, 1500)).sort((a, b) => a.d - b.d)[0];
      if (best) return { lat: best.lat, lon: best.lon, precision: 'street', label: loc.street };
    } catch (e) { /* zostaje punkt przybliżony */ }
  }
  return { ...point, precision: loc.radiusM > 150 ? 'approx' : 'exact', radiusM: loc.radiusM, areaOnly: !!loc.areaOnly, label: loc.street || null };
}

async function getRoute(loc, dest) {
  const origin = await resolveOrigin(loc);
  const time = dest.time || '09:00';
  const key = `rt:${origin.lat.toFixed(3)},${origin.lon.toFixed(3)}>${(+dest.lat).toFixed(4)},${(+dest.lon).toFixed(4)}@${time}`;
  const route = await cached(key, ROUTE_TTL_MS, async () => {
    const iso = nextWeekdayAt(time);
    const url = `${TRANSITOUS}/v5/plan?fromPlace=${origin.lat},${origin.lon}&toPlace=${dest.lat},${dest.lon}` +
      `&time=${encodeURIComponent(iso)}&arriveBy=true&numItineraries=6`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('planer tras: HTTP ' + r.status);
    const p = await r.json();
    const itins = p.itineraries || [];
    const walkOnly = (p.direct || []).find(d => (d.legs || []).every(l => l.mode === 'WALK'));
    if (!itins.length) {
      if (walkOnly) return { walkOnlyMin: Math.round(walkOnly.duration / 60) };
      return { none: true };
    }
    const best = pickEasiest(itins, new Date(iso));
    const bestS = summarize(best);
    // druga opcja: najszybsza, jeśli wyraźnie szybsza od „najłatwiejszej”
    const fastest = itins.slice().sort((a, b) => a.duration - b.duration)[0];
    const fastS = summarize(fastest);
    return {
      best: bestS,
      fastest: fastS.durationMin + 8 <= bestS.durationMin ? fastS : null,
      walkOnlyMin: walkOnly ? Math.round(walkOnly.duration / 60) : null,
    };
  });
  return { ...route, origin, time };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'fetchAd') {
    getAd(msg.ref).then(
      data => sendResponse({ ok: true, data }),
      err => sendResponse({ ok: false, error: String(err && err.message || err) })
    );
    return true;
  }
  if (msg && msg.type === 'route') {
    getRoute(msg.location, msg.dest).then(
      route => sendResponse({ ok: true, route }),
      err => sendResponse({ ok: false, error: String(err && err.message || err) })
    );
    return true;
  }
  if (msg && msg.type === 'geocode') {
    geocode(msg.text).then(
      results => sendResponse({ ok: true, results }),
      err => sendResponse({ ok: false, error: String(err && err.message || err) })
    );
    return true;
  }
  if (msg && msg.type === 'openOptions') {
    chrome.runtime.openOptionsPage();
  }
  if (msg && msg.type === 'clearCache') {
    memCache.clear();
    chrome.storage.local.get(null).then(all => {
      const keys = Object.keys(all).filter(k => /^(ad\d?|rt|gc):/.test(k));
      return chrome.storage.local.remove(keys).then(() => sendResponse({ ok: true, removed: keys.length }));
    });
    return true;
  }
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

// Sprzątanie starych wpisów przy starcie
chrome.runtime.onStartup.addListener(prune);
chrome.runtime.onInstalled.addListener(prune);
async function prune() {
  const all = await chrome.storage.local.get(null);
  const old = Object.keys(all).filter(k =>
    (/^ad\d?:/.test(k) && (k.indexOf(AD_PREFIX) !== 0 || Date.now() - (all[k]?.t || 0) > TTL_MS)) ||
    (/^rt:/.test(k) && Date.now() - (all[k]?.t || 0) > ROUTE_TTL_MS));
  if (old.length) await chrome.storage.local.remove(old);
}
