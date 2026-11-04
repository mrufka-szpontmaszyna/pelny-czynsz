// Testy parsera: deno test test/
import '../src/parser.js';
const { analyze, compute } = globalThis.PelnyCzynsz;

function assertEq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg || ''}\n  oczekiwano: ${JSON.stringify(b)}\n  otrzymano:  ${JSON.stringify(a)}`);
}
const cats = r => Object.fromEntries(r.items.map(i => [i.cat, Math.round(i.amount)]));
const opt = r => r.items.filter(i => i.optional).map(i => i.cat);

Deno.test('lista z dwukropkami (Otodom)', () => {
  const r = analyze({ price: 3000, adminRent: 920, isHtml: false, description: 'KOSZTY Najmu: 3 000 zł Czynsz: 920 zł Prąd: 200 zł Gaz: 40 zł Przed podpisaniem umowy' });
  assertEq(cats(r), { admin: 920, prad: 200, gaz: 40 });
  assertEq(compute(r).total, 3000 + 920 + 200 + 40 + 60, 'z szacunkiem internetu');
});

Deno.test('opcjonalne miejsce postojowe, komórka w cenie, łączny koszt', () => {
  const r = analyze({ price: 2600, adminRent: 950, deposit: 3700, isHtml: false, description: 'z możliwość wynajęcia miejsca postojowego w garażu podziemnym za dodatkowe 250 zł miesięcznie, komórka lokatorska w garażu. WARUNKI NAJMU I OPŁATY czynsz najmu: 2600 zł miesięcznie, czynsz administracyjny: około 950 zł miesięcznie, prąd: około 150 zł miesięcznie, łączny miesięczny koszt: około 3700 zł, opcjonalne miejsce postojowe w garażu podziemnym: 250 zł miesięcznie, komórka lokatorska w cenie, kaucja zwrotna: 3700 zł. Najem okazjonalny.' });
  assertEq(cats(r), { admin: 950, prad: 150, parking: 250 });
  assertEq(opt(r), ['parking']);
  assertEq(r.statedTotal, 3700);
  assertEq(r.covered.includes('komorka'), true, 'komórka w cenie');
  assertEq(r.oneTime[0].amount, 3700);
  const c = compute(r);
  assertEq(c.total, 2600 + 950 + 150 + 60, 'parking nie doliczony domyślnie');
});

Deno.test('kwota przed etykietą („300 PLN - miejsce postojowe”)', () => {
  const r = analyze({ price: 3400, isHtml: false, description: 'CENA: 3400 PLN – czynsz najmu 300 PLN - miejsce postojowe w parkingu podziemnym 1000 PLN – czynsz administracyjny (woda, ogrzewanie, fundusz remontowy, ochrona) 200 PLN – zaliczka na prąd' });
  assertEq(cats(r), { admin: 1000, prad: 200, parking: 300 });
});

Deno.test('obowiązkowe miejsce postojowe i polisa roczna', () => {
  const r = analyze({ price: 2950, adminRent: 845, deposit: 4545, isHtml: false, description: 'jedyne czego wymagamy to wykupienia polisy OC najemcy (koszt polisy to 48 PLN/rok Opłaty: 2900 zł - czynsz najmu 300 zł - miejsce postojowe w garażu podziemnym (wynajem obligatoryjny) 845 zł - opłaty administracyjne ( czynsz, woda, ogrzewanie) wraz z prądem 4545 zł -kaucja ____' });
  assertEq(cats(r), { admin: 845, parking: 300, ubezpieczenie: 4 });
  assertEq(opt(r), [], 'parking obowiązkowy');
  assertEq(r.covered.includes('prad'), true, 'prąd w opłatach');
  assertEq(compute(r).total, 2950 + 845 + 300 + 4 + 60);
});

Deno.test('media na osobę i prąd wg zużycia', () => {
  const r = analyze({ price: 3600, adminRent: 600, isHtml: false, description: 'Koszty: - najem 3 600zł - czynsz 600zł - opłaty - około 70zł za os. W mieszkaniu ogrzewanie jest miejskie' });
  assertEq(cats(r), { admin: 600, media: 70 });
  assertEq(r.items.find(i => i.cat === 'media').perPerson, true);
  assertEq(compute(r, { persons: 2 }).rows.find(x => x.cat === 'media').amount, 140);
});

Deno.test('lista z myślnikami: czynsz - 3200 PLN - media - 420 PLN', () => {
  const r = analyze({ price: 3200, adminRent: 490, isHtml: false, description: 'OPŁATY: - czynsz - 3200 PLN - media - 420 PLN dla jednej osoby, 490 PLN dla dwóch osób - prąd - wg. zużycia ( średnio ok. 90 PLN) Istnieje możliwość wystawienia - FAKTURY' });
  assertEq(cats(r), { admin: 490, prad: 90 });
  assertEq(r.items.find(i => i.cat === 'prad').approx, true);
});

Deno.test('zakres kwot prądu i opłaty do zarządcy', () => {
  const r = analyze({ price: 2250, adminRent: 460, isHtml: false, description: 'Cena wynajmu to 2250 zł + opłaty do zarządcy (aktualnie 460 zł) + prąd (średnie zużycie z lat poprzednich waha się w kwotach 250-350 zł miesięcznie ze względu na wysoką taryfę). Kaucja 3200 zł Dostępne od 1 listopada' });
  assertEq(cats(r), { admin: 460, prad: 300 });
  assertEq(r.oneTime[0].amount, 3200);
});

Deno.test('OLX: czynsz dodatkowo + parking i internet', () => {
  const r = analyze({ price: 3200, adminRent: 1100, isHtml: false, description: 'OPŁATY: Czynsz najmu: 3 200 zł Czynsz administracyjny: ok. 1 100 zł (zawiera zaliczki na ogrzewanie, wodę, wywóz odpadów, ścieki) Prąd: ok. 140 zł (według zużycia) Gaz: ok. 30 zł (według zużycia) Internet + TV UPC: 90 zł Kaucja zwrotna: 5 000 zł WARUNKI NAJMU:' });
  assertEq(cats(r), { admin: 1100, prad: 140, gaz: 30, internet: 90 });
  assertEq(r.oneTime[0].amount, 5000);
  assertEq(compute(r).total, 3200 + 1100 + 140 + 30 + 90);
});

Deno.test('Media obejmują prąd i internet — bez szacunków', () => {
  const r = analyze({ price: 2050, adminRent: 700, isHtml: false, description: 'OPŁATY: Czynsz najmu:2 050 PLN Media: ok 700 PLN (woda, prąd, ciepło, internet, itd.) Kaucja: 2 400 PLN prowizja jednorazowa: 400 PLN' });
  assertEq(cats(r), { admin: 700 });
  assertEq(compute(r).total, 2050 + 700);
  assertEq(r.oneTime.map(o => o.amount), [2400, 400]);
});

Deno.test('„do kwoty wynajmu należy doliczyć ok 540 zł czynszu”', () => {
  const r = analyze({ price: 2700, adminRent: 540, isHtml: false, description: 'leży miejsce postojowe w garażu podziemnym. Do kwoty wynajmu należy doliczyc ok 540 zl czynszu. Mieszkanie jest dobrze' });
  assertEq(cats(r), { admin: 540 });
  assertEq(r.unknownAmounts.length, 0);
});

Deno.test('opłata eksploatacyjna bez pola czynsz (OLX)', () => {
  const r = analyze({ price: 2200, isHtml: false, description: 'Opłaty obejmują: wynajem 2000/M + opłatę eksploatacyjną oraz za części wspólne-200 ZŁ/MC+ woda i prąd *KAUCJA 2200 ZŁ *prąd i woda rozliczone są wg zużycia' });
  assertEq(cats(r), { admin: 200 });
  assertEq(r.oneTime[0].amount, 2200);
  assertEq(r.mentionedNoAmount.includes('prad'), true);
});

Deno.test('parking + komórka „dodatkowo 200 zł” = opcjonalne', () => {
  const r = analyze({ price: 3000, adminRent: 800, isHtml: false, description: 'Łazienka z kabiną prysznicową. Miejsce parkingowe, komórka - dodatkowo 200 zł . Czynsz do administracji 800 zł. Nowe piękne osiedle' });
  assertEq(cats(r).admin, 800);
  assertEq(r.items.filter(i => i.optional).length, 1);
  const c = compute(r, { categories: { parking: { optional: true }, komorka: { optional: true } } });
  assertEq(c.total, 3000 + 800 + 200 + 150 + 60, 'po zaznaczeniu kategorii w ustawieniach');
});

Deno.test('wszystko w cenie', () => {
  const r = analyze({ price: 2500, isHtml: false, description: 'Kawalerka 2500 zł z opłatami, bez prowizji. Internet w cenie.' });
  assertEq(r.allInclusive, true);
  assertEq(compute(r).total, 2500);
});

Deno.test('opłaty w tym czynsz administracyjny (więcej niż pole)', () => {
  const r = analyze({ price: 3000, adminRent: 700, isHtml: false, description: 'Cena najmu 3000 zł. Opłaty ok. 1300 zł (w tym czynsz administracyjny, prąd, gaz).' });
  assertEq(cats(r), { admin: 1300 });
  assertEq(compute(r).total, 3000 + 1300 + 60);
});

Deno.test('HTML z Otodom', () => {
  const r = analyze({ price: 4500, adminRent: 1100, description: '<p>• możliwość wynajęcia miejsca parkingowego w garażu podziemnym: 250 zł.</p><p>OPŁATY:</p><ul><li>Czynsz najmu: 4&nbsp;500 zł;</li><li>Czynsz administracyjny: 1 100 zł;</li><li>Prąd: 200 zł;</li><li>Kaucja zwrotna : 6 000 zł.</li></ul>' });
  assertEq(cats(r), { admin: 1100, prad: 200, parking: 250 });
  assertEq(opt(r), ['parking']);
  assertEq(r.oneTime[0].amount, 6000);
});

Deno.test('etykieta to pierwsze słowo, nie ostatnie („…za ogrzewanie oraz wodę 890”)', () => {
  const r = analyze({ price: 2500, adminRent: 890, isHtml: false, description: 'OPŁATY:\n*czysz najmu 2500 PLN\n*czynsz administracyjny wraz o opłatami za ogrzewanie oraz wodę 890 PLN\n* kałcja zwrotna 3000 PLN' });
  assertEq(cats(r), { admin: 890 });
  assertEq(r.oneTime[0].amount, 3000);
});

Deno.test('etykieta przed przecinkiem („prąd według zużycia, ok. 180 zł”)', () => {
  const r = analyze({ price: 2400, adminRent: 700, isHtml: false, description: 'KOSZTY:\n- Koszt wynajmu: 2400zł.\n- prąd według zużycia, ok. 180 zł\n- Kaucja: 2500zł (zwrotna).\nDodatkowo płatne: ewentualne dopłaty za zwiększone zużycie wody i prądu, internet 72 zł.' });
  assertEq(cats(r), { admin: 700, prad: 180, internet: 72 });
  assertEq(r.oneTime[0].amount, 2500);
});

Deno.test('kaucja bez waluty nie kradnie kwoty czynszu', () => {
  const r = analyze({ price: 3600, adminRent: 890, isHtml: false, description: 'Opłaty dla właściciela 3700 , kaucja 4000 ,opłata do wspólnoty 890 zł plus prąd według zużycia.' });
  assertEq(cats(r), { admin: 890 });
  assertEq(r.oneTime.length, 0);
});

Deno.test('suma w nawiasie („+ prąd (całość około 2600 zł)”)', () => {
  const r = analyze({ price: 2000, adminRent: 497, isHtml: false, description: '• Opłaty: 2000 zł odstępne + czynsz do spółdzielni (około 497 zł) + prąd (całość około 2600 zł).' });
  assertEq(cats(r), { admin: 497 });
  assertEq(r.statedTotal, 2600);
});

Deno.test('etykieta w nawiasie po kwocie + duplikat', () => {
  const r = analyze({ price: 1500, isHtml: false, description: '1500 zł kawalerka 24 m2, 1500 zł + 480 zł (media), okolice ul. X\n1500 zł - odstępne dla właściciela, czynsz, woda, śmieci, administracja\n480 zł - opłaty za prąd obliczone jako średnia' });
  assertEq(cats(r), { prad: 480 });
});

Deno.test('zaślepka czynszu 1 zł i prowizja 0 zł', () => {
  const r = analyze({ price: 2000, adminRent: 1, isHtml: false, description: 'Kaucja 3200 zł, prowizja 0 zł.' });
  assertEq(r.items.length, 0);
  assertEq(r.oneTime.map(o => o.label), ['Kaucja']);
});

Deno.test('pole „czynsz” = suma opłat z opisu (części wspólne + media)', () => {
  const r = analyze({ price: 3790, adminRent: 1340, isHtml: false, description: 'Koszty:\nOpłata: 3 790,00 PLN/miesiąc\nOpłata za korzystanie z części wspólnych budynku: 790,00 PLN/miesiąc\nOpłaty za media (prąd, woda zimna i ciepła, ogrzewanie, wywóz śmieci): 550,00 PLN/miesiąc\nŁączne miesięczne opłaty: 5 130,00 PLN/miesiąc\nOpcjonalne miejsce postojowe: 500,00 PLN/miesiąc' });
  assertEq(cats(r), { admin: 790, media: 550, parking: 500 });
  assertEq(compute(r, { categories: { internet: { estimate: false } } }).total, 5130);
  assertEq(r.statedTotal, 5130);
});

Deno.test('opłata prowizyjna i zakodowane znaczniki HTML', () => {
  const r = analyze({ price: 2935, adminRent: 365, description: '<p>Cena 2935 zł + opłaty administracyjne (365 zł) + media (400 zł) &lt;span title="Szacunkowo: prąd 200 zł, woda 200 zł"&gt;&lt;/span&gt;</p><p>Opłata prowizyjna 1800 zł.</p>' });
  assertEq(cats(r), { admin: 365, media: 400 });
  assertEq(r.oneTime.map(o => o.amount), [1800]);
});

Deno.test('suma z parkingiem nie jest ceną parkingu; czynsz z opisu ma pierwszeństwo', () => {
  const r = analyze({ price: 2300, adminRent: 800, isHtml: false, description: 'Istnieje możliwość wynajęcia miejsca postojowego w garażu za dodatkową opłatą 130 zł miesięcznie.\nWarunki najmu\n• Czynsz najmu: 2300 zł miesięcznie\n• Opłaty administracyjne: 850 zł miesięcznie (w tym woda, ogrzewanie, śmieci)\n• Energia elektryczna: dodatkowo płatna, według zużycia\n• Miejsce postojowe w garażu podziemnym: opcjonalnie 130 zł miesięcznie\n• Kaucja zwrotna: 3500 zł\nŁączny miesięczny koszt wynosi 3150 zł + energia elektryczna, a w przypadku wynajęcia miejsca postojowego – 3280 zł + energia elektryczna.' });
  assertEq(cats(r), { admin: 850, parking: 130 });
  assertEq(r.items.find(i => i.cat === 'parking').alternatives, undefined);
  assertEq(r.statedTotal, 3150);
  assertEq(r.mentionedNoAmount.includes('prad'), true);
});

Deno.test('„z mediami (prąd gaz woda) i internetem” = wszystko w cenie', () => {
  const r = analyze({ price: 1100, isHtml: false, description: 'Mieszkanie wyposażone w sprzęt AGD, internet.\nKaucja 1100 zł\nCena za wynajem z mediami (prąd gaz woda) i internetem, czynszem 1300 zł\nProszę o kontakt' });
  assertEq(r.allInclusive, true);
  assertEq(r.covered.includes('internet'), true);
  assertEq(compute(r).total, 1100);
});

Deno.test('„+ zaliczki za gaz i prąd” to opłaty dodatkowe, nie wliczone', () => {
  const r = analyze({ price: 3000, adminRent: 650, deposit: 5000, isHtml: false, description: 'OPŁATY:\nKwota Najmu: 3000 zł plus ok. 650 zł czynsz administracyjny + zaliczki za gaz i prąd .' });
  assertEq(cats(r), { admin: 650 });
  assertEq(r.items[0].covers, []);
  assertEq(r.covered, []);
  assertEq(r.extraNoAmount.sort(), ['gaz', 'prad']);
  const c = compute(r);
  assertEq(c.rows.find(x => x.cat === 'prad').reason, 'w ogłoszeniu bez kwoty');
  assertEq(c.total, 3000 + 650 + 150 + 60);
});

Deno.test('„ogrzewanie podłogowe + prysznic” nie jest opłatą dodatkową', () => {
  const r = analyze({ price: 4000, adminRent: 1100, isHtml: false, description: 'W łazience ogrzewanie podłogowe + prysznic typu walk-in. Ogrzewanie jest miejskie. Czynsz 4000zł + media według zużycia. Dodatkowo prąd.' });
  assertEq(r.extraNoAmount, ['prad']);
});

Deno.test('limit cenowy', () => {
  const r = analyze({ price: 3000, adminRent: 800, isHtml: false, description: 'Prąd: 200 zł' });
  assertEq(compute(r, { limit: 4000 }).overLimit, true);
  assertEq(compute(r, { limit: 4000 }).overBy, 60);
  assertEq(compute(r, { limit: 4100 }).overLimit, false);
  assertEq(compute(r).overLimit, false);
});

Deno.test('„plus opłaty 900 zł plus prąd i gaz 150-200 zł”', () => {
  const r = analyze({ price: 3000, isHtml: false, description: 'Do dyspozycji najemcy piwnica.\nCena: 3000 zł plus opłaty 900 zł plus prąd i gaz 150-200 ZŁ\nOgrzewanie miejskie !' });
  assertEq(cats(r), { media: 900, prad: 175 });
});

Deno.test('„Razem media … 960 zł” to suma wcześniejszych pozycji', () => {
  const r = analyze({ price: 3000, isHtml: false, description: 'Kwota najmu miesięczna: 3400 zł\nDodatkowe opłaty miesięczne:\n- zaliczka na energię elektryczna 200 zł\n- zaliczka gaz 450 zł\n- zaliczka za wodę i ścieki 150 zł\n- wywóz nieczystości 70 zł\n- internet 90 zł\nRazem media przy 2 osobach zaliczka 960 zł.\nPobierana kaucja zwrotna 4000 zł.' });
  assertEq(cats(r), { prad: 200, gaz: 450, woda: 150, smieci: 70, internet: 90 });
  assertEq(compute(r).total, 3000 + 960);
});

Deno.test('ogólne „media” równe sumie pozycji jest pomijane', () => {
  const r = analyze({ price: 2500, isHtml: false, description: 'Prąd: 150 zł\nGaz: 50 zł\nMedia: 200 zł' });
  assertEq(cats(r), { prad: 150, gaz: 50 });
});

Deno.test('„czynsz 550 zł + gaz, woda i prąd wg zużycia – w sumie ok 1000 zł”', () => {
  const r = analyze({ price: 3000, adminRent: 600, deposit: 5000, isHtml: false, description: 'Koszty\nNajem - 3000 zł/mies.\nOpłaty - czynsz 550 zł + gaz, woda i prąd wg zużycia – w sumie średnio ok 1000zł/mies.\nKaucja zwrotna - 5000 zł' });
  assertEq(cats(r), { admin: 550, media: 450 });
  assertEq(r.items.find(i => i.cat === 'media').covers.sort(), ['gaz', 'prad', 'woda']);
  assertEq(r.extraNoAmount, []);
  assertEq(compute(r).total, 3000 + 1000 + 60);
});
