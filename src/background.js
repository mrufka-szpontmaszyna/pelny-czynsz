// Pełny czynsz — pobieranie danych ogłoszeń (w tle, z pamięcią podręczną).
'use strict';

const TTL_MS = 6 * 60 * 60 * 1000; // 6 godzin
const MAX_PARALLEL = 4;
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
  const stored = (await chrome.storage.local.get('ad:' + key))['ad:' + key];
  if (stored && Date.now() - stored.t < TTL_MS) {
    memCache.set(key, stored);
    return stored.data;
  }
  if (inflight.has(key)) return inflight.get(key);
  const p = runQueued(() => (ref.site === 'otodom' ? fetchOtodom(ref.url) : fetchOlx(ref))).then(async data => {
    const entry = { t: Date.now(), data };
    memCache.set(key, entry);
    try { await chrome.storage.local.set({ ['ad:' + key]: entry }); } catch (e) { /* pełna pamięć — trudno */ }
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
  return {
    site: 'otodom',
    title: ad.title,
    price: num(t.Price) ?? num(ch.price),
    adminRent: num(t.Rent) ?? num(ch.rent),
    deposit: num(t.Deposit) ?? num(ch.deposit),
    description: ad.description || '',
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
  return {
    site: 'olx',
    title: d.title,
    price,
    adminRent: isFinite(rent) ? rent : null,
    deposit: null,
    description: d.description || '',
  };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'fetchAd') {
    getAd(msg.ref).then(
      data => sendResponse({ ok: true, data }),
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
      const keys = Object.keys(all).filter(k => k.startsWith('ad:'));
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
  const old = Object.keys(all).filter(k => k.startsWith('ad:') && Date.now() - (all[k]?.t || 0) > TTL_MS);
  if (old.length) await chrome.storage.local.remove(old);
}
