// Narzędzie deweloperskie: podgląd wtyczki bez instalowania jej w Chrome.
// Serwuje kopię prawdziwej strony Otodom/OLX z wstrzykniętym kodem wtyczki.
// Uruchom: deno run -A tools/devserver.js, potem otwórz
//   http://localhost:8765/page?url=<adres listy albo ogłoszenia na otodom.pl / olx.pl>
const root = new URL('..', import.meta.url);
const read = p => Deno.readTextFileSync(new URL(p, root));
const PORT = 8765;

// Zamiennik API Chrome (storage w pamięci, wiadomości do „tła” w tej samej stronie)
const SHIM = `
var __mem = {}, __listeners = [], __syncListeners = [], __sync = {};
var __store = {
  get: async k => { if (k == null) return { ...__mem }; if (typeof k === 'string') return k in __mem ? { [k]: __mem[k] } : {}; return {}; },
  set: async o => { Object.assign(__mem, o); },
  remove: async k => { [].concat(k).forEach(x => delete __mem[x]); },
};
var chrome = {
  runtime: {
    onMessage: { addListener: f => __listeners.push(f) },
    onStartup: { addListener() {} }, onInstalled: { addListener() {} },
    openOptionsPage() { console.log('[harness] otwórz ustawienia'); },
    sendMessage: msg => new Promise(res => { let r; for (const f of __listeners) r = f(msg, {}, res); if (r !== true) res(undefined); }),
  },
  action: { onClicked: { addListener() {} } },
  storage: {
    local: __store,
    sync: {
      get: async () => ({ settings: __sync }),
      set: async o => { const old = __sync; __sync = o.settings; __syncListeners.forEach(f => f({ settings: { oldValue: old, newValue: __sync } }, 'sync')); },
    },
    onChanged: { addListener: f => __syncListeners.push(f) },
  },
};
window.__pcChrome = chrome;
var __proxyFetch = (u, o) => window.fetch('http://localhost:${PORT}/proxy?url=' + encodeURIComponent(u));
var __realUrl = new URL(window.__pcRealUrl);
var __fakeLocation = { hostname: __realUrl.hostname, href: __realUrl.href, pathname: __realUrl.pathname, origin: __realUrl.origin };
`;

function harness() {
  return '(function(){\n' + SHIM +
    '(function(fetch){\n' + read('src/background.js') + '\n})(__proxyFetch);\n' +
    read('src/parser.js') + '\n' + read('src/styles.js') + '\n' +
    '(function(location){\n' + read('src/content.js') + '\n})(__fakeLocation);\n' +
    'var __st=document.createElement("style");__st.textContent=' + JSON.stringify(read('src/content.css')) + ';document.head.append(__st);\n})();';
}

async function curl(url) {
  // Transitous wymaga User-Agenta z nazwą aplikacji i kontaktem (to samo robi rules.json we wtyczce)
  const ua = url.includes('api.transitous.org')
    ? '4Rent-dev/1.3 (testy; +https://github.com/mrufka-szpontmaszyna/pelny-czynsz)'
    : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
  const out = await new Deno.Command('curl', {
    args: ['-sL', '--compressed', '-A', ua, '-H', 'Accept-Language: pl-PL,pl;q=0.9', '-w', '\n%{http_code}', url],
  }).output();
  const txt = new TextDecoder().decode(out.stdout);
  const i = txt.lastIndexOf('\n');
  return { status: +txt.slice(i + 1) || 502, body: txt.slice(0, i) };
}

const allowed = u => /^https:\/\/([a-z0-9-]+\.)*(otodom|olx)\.pl\//.test(u) || u.startsWith('https://api.transitous.org/api/');
const headers = { 'access-control-allow-origin': '*', 'cache-control': 'no-store' };

Deno.serve({ port: PORT }, async req => {
  const url = new URL(req.url);
  if (url.pathname === '/harness.js') {
    return new Response(harness(), { headers: { ...headers, 'content-type': 'text/javascript; charset=utf-8' } });
  }
  if (url.pathname === '/options') {
    const html = read('options.html').replace('<script src="src/parser.js"></script>', '<script>' + SHIM.replace(/var __realUrl[\s\S]*$/, '') + '</script><script src="/src/parser.js"></script>').replace('src="options.js"', 'src="/options.js"');
    return new Response(html, { headers: { ...headers, 'content-type': 'text/html; charset=utf-8' } });
  }
  if (url.pathname === '/src/parser.js' || url.pathname === '/options.js') {
    return new Response(read(url.pathname.slice(1)), { headers: { ...headers, 'content-type': 'text/javascript; charset=utf-8' } });
  }
  if (url.pathname === '/proxy') {
    const target = url.searchParams.get('url') || '';
    if (!allowed(target)) return new Response('zły adres', { status: 400, headers });
    const r = await curl(target);
    return new Response(r.body, { status: r.status, headers: { ...headers, 'content-type': target.includes('/api/') ? 'application/json' : 'text/html; charset=utf-8' } });
  }
  if (url.pathname === '/page') {
    const target = url.searchParams.get('url') || '';
    if (!allowed(target)) return new Response('Podaj ?url=https://www.otodom.pl/... albo https://www.olx.pl/...', { status: 400, headers });
    const r = await curl(target);
    let html = r.body
      .replace(/<script\b(?![^>]*type="application\/(?:ld\+)?json")[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<head([^>]*)>/i, `<head$1><base href="${new URL(target).origin}/">`);
    const inject = `<script>window.__pcRealUrl=${JSON.stringify(target)};</script><script src="http://localhost:${PORT}/harness.js"></script>`;
    html = html.includes('</body>') ? html.replace('</body>', inject + '</body>') : html + inject;
    return new Response(html, { headers: { ...headers, 'content-type': 'text/html; charset=utf-8' } });
  }
  return new Response('<!doctype html><meta charset="utf-8"><p>4Rent — serwer testowy. Użyj /page?url=…</p>', { headers: { ...headers, 'content-type': 'text/html; charset=utf-8' } });
});
