// Narzędzie deweloperskie: sprawdza parser na prawdziwych ogłoszeniach.
// Użycie: deno run --allow-net tools/probe.js [otodom|olx] [url listy]
import '../src/parser.js';
const PC = globalThis.PelnyCzynsz;
const site = Deno.args[0] || 'otodom';
const UA = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', 'accept-language': 'pl-PL,pl;q=0.9' };

async function otodomAd(url) {
  const html = await (await fetch(url, { headers: UA })).text();
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  const ad = m && JSON.parse(m[1]).props?.pageProps?.ad;
  if (!ad) return null;
  return { url, price: +ad.target.Price, adminRent: +ad.target.Rent || null, deposit: +ad.target.Deposit || null, description: ad.description };
}
async function olxAd(id) {
  const d = (await (await fetch(`https://www.olx.pl/api/v1/offers/${id}/`, { headers: UA })).json()).data;
  const p = k => d.params.find(x => x.key === k);
  return { url: d.url, price: p('price')?.value?.value, adminRent: parseFloat(p('rent')?.value?.key) || null, description: d.description };
}

let ads = [];
if (site === 'otodom') {
  const list = Deno.args[1] || 'https://www.otodom.pl/pl/wyniki/wynajem/mieszkanie/mazowieckie/warszawa/warszawa/warszawa';
  const html = await (await fetch(list, { headers: UA })).text();
  const links = [...new Set([...html.matchAll(/href="(\/pl\/oferta\/[^"?#]+)"/g)].map(m => 'https://www.otodom.pl' + m[1]))];
  ads = (await Promise.all(links.slice(0, 36).map(u => otodomAd(u).catch(() => null)))).filter(Boolean);
} else {
  const list = Deno.args[1] || 'https://www.olx.pl/nieruchomosci/mieszkania/wynajem/krakow/';
  const html = await (await fetch(list, { headers: UA })).text();
  const ids = [...new Set([...html.matchAll(/data-cy="l-card"[^>]*?id="(\d+)"|id="(\d+)"[^>]*?data-cy="l-card"/g)].map(m => m[1] || m[2]))];
  ads = (await Promise.all(ids.slice(0, 36).map(id => olxAd(id).catch(() => null)))).filter(Boolean);
}

for (const ad of ads) {
  const a = PC.analyze(ad);
  const c = PC.compute(a);
  const fmtRow = r => `${r.kind === 'optional' ? '[opc] ' : r.kind === 'estimate' ? '[szac] ' : ''}${r.cat}=${r.amount}${r.checked ? '' : '(off)'}`;
  console.log(`\n${ad.url}\n  P=${ad.price} R=${ad.adminRent} → SUMA ${c.total}${a.statedTotal ? ` (ogł. łącznie ${a.statedTotal})` : ''}${a.allInclusive ? ' [wszystko w cenie]' : ''}`);
  console.log('  ' + c.rows.map(fmtRow).join(', '));
  if (a.covered.length) console.log('  w cenie: ' + a.covered.join(', '));
  if (a.oneTime.length) console.log('  start: ' + a.oneTime.map(o => `${o.label} ${o.amount}`).join(', '));
  for (const u of a.unknownAmounts) console.log(`  ? ${u.amount}: ${u.snippet}`);
}
console.log(`\nogłoszeń: ${ads.length}`);
