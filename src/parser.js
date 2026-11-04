// Pełny czynsz — analiza opisu ogłoszenia.
// Czysty JavaScript bez zależności: działa w content scripcie i w testach (Deno).
(function (root) {
  'use strict';

  // ---------- Kategorie ----------
  const CATEGORIES = {
    admin:         { label: 'Czynsz administracyjny' },
    media:         { label: 'Media / opłaty' },
    prad:          { label: 'Prąd' },
    gaz:           { label: 'Gaz' },
    woda:          { label: 'Woda' },
    ogrzewanie:    { label: 'Ogrzewanie' },
    smieci:        { label: 'Śmieci' },
    internet:      { label: 'Internet / TV' },
    parking:       { label: 'Parking / garaż', addon: true },
    komorka:       { label: 'Komórka / piwnica', addon: true },
    sprzatanie:    { label: 'Sprzątanie', addon: true },
    ubezpieczenie: { label: 'Ubezpieczenie (OC najemcy)' },
  };
  // Kolejność wyświetlania
  const CATEGORY_ORDER = Object.keys(CATEGORIES);

  // Słowa kluczowe. tier: 3 = specjalne (kaucja, prowizja, suma), 2 = konkretne, 1 = ogólne („opłaty”, „media”)
  const KEYWORDS = [
    { cat: 'deposit', tier: 3, src: 'ka[uł]cj|depozyt' },
    { cat: 'onetime', tier: 3, src: 'prowizj|prowizyj|opłat\\p{L}* rezerwacyjn|rezerwacyjn|notarialn|notariusz|wynagrodzeni\\p{L}* (?:dla )?(?:biura|pośrednik)' },
    { cat: 'total', tier: 3, src: '[łl][aą]cznie|[łl][aą]czn\\p{L}* (?:miesięczn\\p{L}* )?(?:koszt|kwot|opłat|sum)|razem|w sumie|całość|całkowit\\p{L}* (?:miesięczn\\p{L}* )?(?:koszt|kwot|opłat)|suma' },
    { cat: 'admin', tier: 2, src: 'czynsz\\p{L}* administracyjn|opłat\\p{L}* administracyjn|administracj|czynsz\\p{L}* (?:do|dla) (?:spółdzielni|wspólnoty|zarządcy|administracji)|opłat\\p{L}* (?:do|dla) (?:spółdzielni|wspólnoty|zarządcy|administracji)|opłat\\p{L}* eksploatacyjn|eksploatacyjn|opłat\\p{L}* za (?:korzystanie z )?częś\\p{L}* wspóln|częś\\p{L}* wspóln|opłat\\p{L}* stał|zarządc|spółdzielni|wspólnot' },
    { cat: 'base', tier: 2, src: 'czynsz\\p{L}* najm|czynsz\\p{L}* (?:dla|do) właściciel|cen\\p{L}* (?:najmu|wynajmu)|kwot\\p{L}* (?:najmu|wynajmu)|koszt\\p{L}* (?:najmu|wynajmu)|opłat\\p{L}* za (?:lokal|mieszkanie)|najem|najmu|wynajem|wynajmu|cena|odstępn' },
    { cat: 'czynsz', tier: 2, src: 'czynsz' },
    { cat: 'prad', tier: 2, src: 'prąd|prad|energi\\p{L}* elektryczn|elektryczn|energi' },
    { cat: 'gaz', tier: 2, src: 'gaz(?!et)' },
    { cat: 'woda', tier: 2, src: 'ciepł\\p{L}* wod|wod[aęyząo]|ściek|scieki' },
    { cat: 'ogrzewanie', tier: 2, src: 'ogrzewa|ciepło|c\\.o\\.' },
    { cat: 'smieci', tier: 2, src: 'śmieci|smieci|odpad|wyw[óo]z' },
    { cat: 'internet', tier: 2, src: 'internet|wi-?fi|światłow|telewizj|kablówk|tv(?!\\p{L})' },
    { cat: 'parking', tier: 2, src: 'parking|miejsc\\p{L}* (?:parkingow|postojow|garażow|w garażu|w hali)|postojow|garaż|stanowisk\\p{L}* garażow' },
    { cat: 'komorka', tier: 2, src: 'komórk|komork|piwnic|schowek|boks' },
    { cat: 'sprzatanie', tier: 2, src: 'sprzątan' },
    { cat: 'ubezpieczenie', tier: 2, src: 'ubezpieczeni|polis' },
    { cat: 'media', tier: 1, src: 'medi(?:a|ów|ach|ami)|opłat|rachun|zaliczk|koszt\\p{L}* eksploatacji' },
  ];
  const KW_RES = KEYWORDS.map(k => ({ ...k, re: new RegExp('(?<!\\p{L})(?:' + k.src + ')\\p{L}*', 'giu') }));

  // ---------- Kwoty ----------
  const NUM = '\\d{1,3}(?:[ \\u00a0.]\\d{3}(?!\\d))+(?:,\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?';
  const AMOUNT_RE = new RegExp(
    '(?<![\\d.,])(' + NUM + ')(?:\\s*(?:-|–|do)\\s*(' + NUM + '))?\\s*(?:zł|zl|złotych|złote|pln|,-)(?!\\p{L})',
    'giu'
  );

  function parseNum(s) {
    s = s.replace(/[  ]/g, '');
    if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) s = s.replace(/\./g, '');
    return parseFloat(s.replace(',', '.'));
  }

  // ---------- Pomocnicze ----------
  const BEFORE_SEP = /[\n;•|*+]|,(?!\d)|\.\s+(?=[\p{Lu}•\-–])/gu;
  const SENTENCE_SEP = /[\n;•|*+]|\.\s+(?=[\p{Lu}•\-–])/gu;
  const AFTER_WEAK_STOP = /[\n;•|*(+]|,\s|\.\s+(?=[\p{Lu}•\-–])|\s[-–—]\s/u;
  const AFTER_STRONG_LEAD = /^[ \t]*(?:\/\s*(?:mc|m-c|msc|mies\p{L}*|miesiąc|m)\.?)?[ \t]*(?:miesięcznie|mies\.|netto|brutto)?[ \t]*[-–—:][ \t]*/iu;
  const AFTER_PAREN = /^[ \t]*(?:\/\s*\p{L}+\.?)?[ \t]*\(([^()]{1,50})\)/u;
  const AFTER_STRONG_STOP = /[\n;•|*+]|,\s|\.\s+(?=[\p{Lu}•\-–])|\s[-–—]\s/u;
  const FILLERS = new Set(['ok', 'około', 'ca', 'średnio', 'aktualnie', 'obecnie', 'wynosi', 'wynoszą', 'to', 'w', 'wysokości', 'kwota', 'kwocie', 'od', 'do', 'max', 'maks', 'mc', 'mies', 'miesięcznie', 'miesiąc', 'jest', 'są', 'koszt', 'ok.', 'cca', 'plus']);

  const OPTIONAL_RE = /opcjonaln|możliwoś|mozliwos|na życzenie|do wyboru|jeśli|jeżeli|w razie potrzeby|można (?:wynająć|dokupić|dodatkowo|wykupić)|do dokupienia|do wynajęcia|dla chętnych|nieobowiązk|za dopłatą|istnieje możliwość|ewentualn/iu;
  const MANDATORY_RE = /obligatoryjn|obowiązk|wymaga|w pakiecie|należy doliczyć|nalezy doliczyc|w zestawie|razem z mieszkaniem/iu;
  const PER_PERSON_RE = /(?:za|na|od|\/)\s*(?:os\.?|osob\p{L}*)(?!\p{L})|(?:za|na|od)\s*głow/iu;
  const YEARLY_RE = /^\s*(?:\/\s*rok|rocznie|na rok|za rok|w skali roku)/iu;
  const APPROX_RE = /ok\.?\s*$|około\s*$|~\s*$|ca\.?\s*$|średnio\s*$|szacunk|mniej więcej|zależ|wg\.?\s*zuży|według\s*zuży|zaliczk|maks|max|do\s*$/iu;
  const COVERED_RE = /w cenie|wliczon|zawart|gratis|bez dodatkow\p{L}* opłat|w czynszu|bezpłatn|darmow|w ramach (?:czynszu|najmu|ceny)/iu;
  const ALL_INCLUSIVE_RE = /z opłatami|ze wszystkimi opłatami|(?:wraz )?z mediami|z czynszem i mediami|wszystkie opłaty (?:są )?(?:w cenie|wliczone)|opłaty (?:są )?(?:w cenie|wliczone)|wliczone (?:wszystkie )?opłaty|all inclusive|łącznie z (?:opłatami|mediami)|media (?:są )?(?:w cenie|wliczone)|w cenie (?:są )?(?:wszystkie )?(?:opłaty|media)|cena zawiera (?:wszystkie )?(?:opłaty|media)/iu;
  const COVER_LEAD_RE = /^\s*(?:\/\s*(?:mc|m-c|msc|mies\p{L}*|miesiąc|m)\.?)?\s*(?:miesięcznie)?\s*[,:-]?\s*(?:\(|w tym|obejmując|obejmuj|zawiera|zawierając|za:)/iu;

  function htmlToText(html) {
    if (!html) return '';
    let t = String(html)
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\/\s*(p|li|div|h\d|tr)\s*>/gi, '\n')
      .replace(/<\s*li[^>]*>/gi, '\n• ')
      .replace(/<[^>]+>/g, ' ');
    t = t
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
      .replace(/<\/?[a-z][^>]*>/gi, ' '); // znaczniki, które były zakodowane jako &lt;span…&gt;
    t = t.replace(/\*\*/g, '').replace(/ /g, ' ').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n');
    return t.trim();
  }

  // Zastępuje zamknięte nawiasy spacjami (zachowuje indeksy)
  function blankParens(s) {
    let prev;
    do {
      prev = s;
      s = s.replace(/\([^()]*\)/g, m => ' '.repeat(m.length));
    } while (s !== prev);
    return s;
  }

  function findKeywords(text) {
    const all = [];
    for (const k of KW_RES) {
      k.re.lastIndex = 0;
      let m;
      while ((m = k.re.exec(text))) {
        all.push({ cat: k.cat, tier: k.tier, start: m.index, end: m.index + m[0].length, word: m[0] });
      }
    }
    all.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
    const kept = [];
    let lastEnd = -1;
    for (const m of all) {
      if (m.start >= lastEnd) {
        kept.push(m);
        lastEnd = m.end;
      }
    }
    return kept;
  }

  function lastBoundary(text, pos, re) {
    re = re || BEFORE_SEP;
    let b = 0;
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) && m.index < pos) {
      b = m.index + m[0].length;
    }
    return b;
  }

  function snippetOf(text, start, end) {
    const a = Math.max(0, start - 70);
    const b = Math.min(text.length, end + 50);
    return (a > 0 ? '…' : '') + text.slice(a, b).replace(/\s+/g, ' ').trim() + (b < text.length ? '…' : '');
  }

  function isStrongTail(tail) {
    // tail = tekst między słowem kluczowym a kwotą
    if (!/[:=\-–—]/.test(tail)) return false;
    const parts = tail.split(/[:=\-–—]/);
    const afterSep = parts[parts.length - 1];
    const words = afterSep.match(/\p{L}+/gu) || [];
    if (!words.every(w => FILLERS.has(w.toLowerCase()))) return false;
    const beforeSep = parts.slice(0, -1).join(' ');
    return (beforeSep.match(/\p{L}+/gu) || []).length <= 4;
  }

  // ---------- Główna analiza ----------
  /**
   * @param {{price?:number, adminRent?:number, deposit?:number, description:string, isHtml?:boolean}} ad
   */
  function analyze(ad) {
    const text = ad.isHtml === false ? String(ad.description || '') : htmlToText(ad.description);
    const P = ad.price > 0 ? ad.price : null;
    const R = ad.adminRent >= 20 ? ad.adminRent : null; // OLX bywa „1 zł” jako zaślepka
    const D = ad.deposit > 0 ? ad.deposit : null;

    const stripped = blankParens(text);
    const keywords = findKeywords(stripped);
    const rawKeywords = findKeywords(text);

    // 1) Wszystkie kwoty
    const amounts = [];
    AMOUNT_RE.lastIndex = 0;
    let m;
    while ((m = AMOUNT_RE.exec(text))) {
      const a = parseNum(m[1]);
      const b = m[2] ? parseNum(m[2]) : null;
      if (!isFinite(a)) continue;
      amounts.push({
        start: m.index, end: m.index + m[0].length,
        value: b && b > a ? (a + b) / 2 : a,
        range: b && b > a ? [a, b] : null,
      });
    }

    const PR = P && R ? P + R : null;
    const valid = (cand, amt) => {
      if (cand.cat === 'base') return !P || Math.abs(amt - P) / P <= 0.15 || (PR && Math.abs(amt - PR) / PR <= 0.02);
      if (cand.cat === 'total') return !P || amt >= P * 0.9;
      return true;
    };
    const kwIn = (from, to) => keywords.filter(k => k.start >= from && k.end <= to);

    const found = [];
    const unknown = [];

    amounts.forEach((am, i) => {
      const prevEnd = i > 0 ? amounts[i - 1].end : 0;
      const nextStart = i < amounts.length - 1 ? amounts[i + 1].start : text.length;
      let bStart = Math.max(prevEnd, lastBoundary(stripped, am.start), am.start - 90);
      if (!kwIn(bStart, am.start).length) {
        // „prąd według zużycia, ok. 180 zł” — etykieta przed przecinkiem
        bStart = Math.max(prevEnd, lastBoundary(stripped, am.start, SENTENCE_SEP), am.start - 90);
      }
      let before = kwIn(bStart, am.start);
      // kwota wewnątrz nawiasu: „+ prąd (całość około 2600 zł)” — słowa z tego nawiasu też się liczą
      const openIdx = text.lastIndexOf('(', am.start);
      if (openIdx >= bStart && openIdx > text.lastIndexOf(')', am.start)) {
        const closeIdx = text.indexOf(')', am.start);
        if (closeIdx !== -1) {
          before = before.filter(k => k.end <= openIdx)
            .concat(rawKeywords.filter(k => k.start > openIdx && k.end <= am.start));
        }
      }

      const afterLimit = Math.min(nextStart, am.end + 110);
      const afterText = text.slice(am.end, afterLimit);
      // okno „mocne” po kwocie: „300 zł – miejsce postojowe”
      let aStrong = [];
      const lead = afterText.match(AFTER_STRONG_LEAD);
      let strongWinStart = null, strongWinEnd = null;
      if (lead && !/^\s*:/.test(afterText)) {
        strongWinStart = am.end + lead[0].length;
        const rest = stripped.slice(strongWinStart, afterLimit);
        const stop = rest.search(AFTER_STRONG_STOP);
        strongWinEnd = strongWinStart + (stop === -1 ? rest.length : stop);
        aStrong = kwIn(strongWinStart, strongWinEnd);
      }
      const weakRest = afterText;
      const weakStop = weakRest.search(AFTER_WEAK_STOP);
      const aWeakEnd = am.end + (weakStop === -1 ? weakRest.length : weakStop);
      const aWeak = kwIn(am.end, aWeakEnd).filter(k => !/^\s*:/.test(text.slice(k.end, k.end + 3)));

      const amt = am.value;
      const pick = (cands, fromEnd, minTier) => {
        const v = cands.filter(c => c.tier >= minTier && valid(c, amt));
        if (!v.length) return null;
        const special = v.filter(c => c.tier === 3);
        const pool = special.length ? special : v.filter(c => c.tier === Math.max(...v.map(x => x.tier)));
        return fromEnd ? pool[pool.length - 1] : pool[0];
      };

      // etykieta w nawiasie po kwocie: „480 zł (media)”
      const parenM = afterText.match(AFTER_PAREN);
      const aParen = parenM && !before.length
        ? findKeywords(parenM[1]).map(k => ({ ...k, start: k.start + am.end + parenM[0].indexOf('(') + 1, end: k.end + am.end + parenM[0].indexOf('(') + 1 }))
        : [];

      let label = null, how = null;
      for (const minTier of [2, 1]) {
        const tierOk = c => (minTier === 2 ? c.tier >= 2 : c.tier === 1);
        // a) mocne przed: „Prąd: 200 zł”
        const lb = before.filter(c => tierOk(c) && valid(c, amt)).find(c => isStrongTail(stripped.slice(c.end, am.start)));
        if (lb) { label = lb; how = 'before'; break; }
        // b) mocne po: „200 zł – prąd”
        const as = pick(aStrong.filter(tierOk), false, 1);
        if (as) { label = as; how = 'after'; break; }
        // b2) nawias po kwocie: „480 zł (media)”
        const ap = pick(aParen.filter(tierOk), false, 1);
        if (ap) { label = ap; how = 'after'; break; }
        // c) słabe przed — pierwsze słowo kluczowe w fragmencie
        const bw = pick(before.filter(tierOk), false, 1);
        if (bw) { label = bw; how = 'before'; break; }
        // d) słabe po
        const aw = pick(aWeak.filter(tierOk), false, 1);
        if (aw) { label = aw; how = 'after'; break; }
      }

      const ctxStart = Math.max(bStart, lastBoundary(text, am.start));
      const ctxBefore = text.slice(ctxStart, am.start);
      const ctxAfter = text.slice(am.end, Math.max(aWeakEnd, strongWinEnd || 0));
      const snippet = snippetOf(text, am.start, am.end);

      if (!label) {
        const isBaseLike = (P && Math.abs(amt - P) / P <= 0.02) || (PR && Math.abs(amt - PR) / PR <= 0.02);
        const isRentLike = R && Math.abs(amt - R) <= 1;
        const isDepositLike = D && Math.abs(amt - D) <= 1;
        if (!isBaseLike && !isRentLike && !isDepositLike && amt >= 5) unknown.push({ amount: amt, snippet });
        return;
      }

      let cat = label.cat;
      // kwota równa cenie najmu to sama cena (np. „2500 zł z opłatami”)
      if (P && Math.abs(amt - P) / P <= 0.02 && !['deposit', 'total', 'onetime'].includes(cat)) return;
      if (cat === 'czynsz') cat = P && Math.abs(amt - P) / P <= 0.15 ? 'base' : 'admin';
      if (cat === 'base') return;
      if (amt < 1 && cat !== 'deposit') return;
      // dodatek droższy niż sam najem to raczej suma („z miejscem postojowym – 3280 zł”)
      if (P && amt >= P * 0.9 && !['deposit', 'onetime', 'total'].includes(cat)) {
        unknown.push({ amount: amt, snippet });
        return;
      }

      // Co obejmuje ta kwota (np. „(w tym woda, prąd)”)
      let coverText = '';
      if (how === 'before') coverText += text.slice(label.end, am.start);
      else {
        const tail = text.slice(label.end, nextStart);
        const cut = tail.search(/[\n;•]|\.\s+(?=\p{Lu})/u);
        coverText += cut === -1 ? tail : tail.slice(0, cut);
      }
      const afterAmount = text.slice(am.end, Math.min(text.length, am.end + 160));
      if (COVER_LEAD_RE.test(afterAmount)) {
        const paren = afterAmount.match(/^[^()]*\(([^)]*)\)/);
        if (paren) coverText += ' ' + paren[1];
        else coverText += ' ' + afterAmount.split(/\n|\.\s+(?=\p{Lu})/u)[0];
      }
      const covers = [...new Set(findKeywords(coverText).filter(k => CATEGORIES[k.cat] || k.cat === 'czynsz').map(k => (k.cat === 'czynsz' ? 'admin' : k.cat)))].filter(c => c !== cat && c !== 'media');

      const localCtx = ctxBefore + ' ' + text.slice(label.start, label.end) + ' ' + ctxAfter;
      const yearly = YEARLY_RE.test(text.slice(am.end, am.end + 20));
      const perPerson = PER_PERSON_RE.test(text.slice(am.end, am.end + 25));
      const approx = !!am.range || APPROX_RE.test(text.slice(Math.max(0, am.start - 25), am.start)) || /^\s*\(?\s*(?:wg|według|zależ)/iu.test(text.slice(am.end, am.end + 30));
      const optional = OPTIONAL_RE.test(localCtx);
      const mandatory = MANDATORY_RE.test(localCtx);

      found.push({
        cat, amount: yearly ? amt / 12 : amt, range: am.range, approx, perPerson, yearly,
        optional: CATEGORIES[cat] && CATEGORIES[cat].addon ? !mandatory : optional && !mandatory,
        covers, snippet, pos: am.start,
      });
    });

    // 2) Wzmianki bez kwot: „komórka lokatorska w cenie”, „prąd wg zużycia”
    const covered = new Set();
    const mentioned = new Set();
    const amountSpans = amounts.map(a => [a.start, a.end]);
    for (const k of rawKeywords) {
      const cat = k.cat === 'czynsz' ? 'admin' : k.cat;
      if (!CATEGORIES[cat]) continue;
      const segStart = lastBoundary(text, k.start);
      let segEnd = text.slice(k.end).search(/[\n;•|]|,\s|\.\s+(?=\p{Lu})/u);
      segEnd = segEnd === -1 ? text.length : k.end + segEnd;
      const hasAmount = amountSpans.some(([s, e]) => s >= segStart && e <= segEnd);
      const seg = text.slice(k.end, Math.min(segEnd, k.end + 45));
      if (!hasAmount && COVERED_RE.test(seg)) covered.add(cat);
      else mentioned.add(cat);
    }
    const allMatch = text.match(ALL_INCLUSIVE_RE);
    const allInclusive = !!allMatch;
    if (allInclusive) {
      ['admin', 'media', 'prad', 'gaz', 'woda', 'ogrzewanie', 'smieci'].forEach(c => covered.add(c));
      // „z mediami (prąd gaz woda) i internetem” — wszystko z tego zdania też jest w cenie
      const sStart = lastBoundary(text, allMatch.index, SENTENCE_SEP);
      let sEnd = text.slice(allMatch.index).search(/\n|\.\s+(?=\p{Lu})/u);
      sEnd = sEnd === -1 ? text.length : allMatch.index + sEnd;
      findKeywords(text.slice(sStart, sEnd)).forEach(k => { if (CATEGORIES[k.cat]) covered.add(k.cat); });
    }

    // 3) Składanie wyniku
    const items = [];
    const oneTime = [];
    let statedTotal = null;
    const notes = [];

    const add = (it) => {
      const same = items.find(x => x.cat === it.cat);
      if (same) {
        if (Math.abs(same.amount - it.amount) > 1) same.alternatives = (same.alternatives || []).concat([{ amount: it.amount, snippet: it.snippet }]);
        same.covers = [...new Set([...(same.covers || []), ...(it.covers || [])])];
        return;
      }
      items.push(it);
    };

    // Czy pole „czynsz” to suma kilku opłat z opisu? (np. „części wspólne 790 + media 550” = 1340)
    let useR = !!R;
    if (R) {
      const UTIL = ['admin', 'media', 'prad', 'gaz', 'woda', 'ogrzewanie', 'smieci'];
      const pool = found.filter(f => UTIL.includes(f.cat) && !f.optional).slice(0, 10);
      for (let mask = 1; mask < (1 << pool.length) && useR; mask++) {
        let s = 0, n = 0;
        pool.forEach((f, i) => { if (mask & (1 << i)) { s += f.amount; n++; } });
        if (n >= 2 && Math.abs(s - R) <= Math.max(R * 0.03, 10)) useR = false;
      }
      if (!useR) notes.push(`Pole „czynsz” (${fmt(R)}) to suma opłat rozpisanych w opisie.`);
    }

    if (useR) {
      items.push({ cat: 'admin', amount: R, source: 'field', fromField: true, snippet: 'Kwota „czynsz” z pól ogłoszenia', covers: [], optional: false });
    }

    for (const f of found) {
      if (f.cat === 'deposit') {
        if (!oneTime.find(o => o.kind === 'deposit')) oneTime.push({ kind: 'deposit', label: 'Kaucja', amount: f.amount, snippet: f.snippet });
        continue;
      }
      if (f.cat === 'onetime') {
        if (f.amount < 1) continue;
        oneTime.push({ kind: 'onetime', label: /prowizj/i.test(f.snippet) ? 'Prowizja' : 'Opłata jednorazowa', amount: f.amount, snippet: f.snippet });
        continue;
      }
      if (f.cat === 'total') {
        // pierwsza suma to zwykle wariant podstawowy („3150 zł, a z miejscem postojowym 3280 zł”)
        if (statedTotal == null) statedTotal = f.amount;
        continue;
      }
      const it = { cat: f.cat, amount: f.amount, approx: f.approx, range: f.range, perPerson: f.perPerson, yearly: f.yearly, optional: f.optional, covers: f.covers, snippet: f.snippet, source: 'desc' };

      if (useR && (f.cat === 'admin' || f.cat === 'media')) {
        const adminItem = items.find(x => x.cat === 'admin' && x.fromField);
        // „media” bliskie polu „czynsz” to ta sama opłata — chyba że opis osobno podaje czynsz administracyjny
        const close = Math.abs(f.amount - R) <= Math.max(R * 0.25, 30) && !(f.cat === 'media' && found.some(x => x.cat === 'admin'));
        if (f.cat === 'admin' || close) {
          // to ta sama opłata co pole „czynsz”
          adminItem.covers = [...new Set([...adminItem.covers, ...f.covers])];
          if (Math.abs(f.amount - R) > 1) {
            if (f.cat === 'admin' && adminItem.source === 'field') {
              // opis wprost podaje czynsz administracyjny — zwykle jest aktualniejszy niż pole
              adminItem.amount = f.amount;
              adminItem.approx = f.approx;
              adminItem.source = 'desc';
              adminItem.note = `w polu „czynsz”: ${fmt(R)}`;
            } else if (adminItem.source === 'field') {
              adminItem.note = `w opisie: ${fmt(f.amount)}`;
            }
          }
          adminItem.snippet = f.snippet;
          continue;
        }
        if (f.covers.includes('admin')) {
          // np. „opłaty 1300 zł (w tym czynsz administracyjny)” — opis zawiera więcej niż pole
          adminItem.amount = f.amount;
          adminItem.source = 'desc';
          adminItem.snippet = f.snippet;
          adminItem.covers = [...new Set([...adminItem.covers, ...f.covers])];
          continue;
        }
      }
      add(it);
    }

    if (!oneTime.find(o => o.kind === 'deposit') && D) oneTime.unshift({ kind: 'deposit', label: 'Kaucja', amount: D, snippet: 'Kwota kaucji z pól ogłoszenia' });
    else if (D) {
      const dep = oneTime.find(o => o.kind === 'deposit');
      if (Math.abs(dep.amount - D) > 1) { dep.amount = D; dep.snippet = 'Kwota kaucji z pól ogłoszenia'; }
    }

    // ogólne „media” o tej samej kwocie co konkretna pozycja to duplikat („480 zł (media)” + „480 zł – opłaty za prąd”)
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.cat === 'media' && items.some(x => x !== it && Math.abs(x.amount - it.amount) <= 1)) items.splice(i, 1);
    }

    // pokrycia z pozycji („w tym prąd”) też liczą się jako „w cenie”
    for (const it of items) for (const c of it.covers || []) if (!items.find(x => x.cat === c)) covered.add(c);
    for (const it of items) covered.delete(it.cat);

    items.sort((a, b) => CATEGORY_ORDER.indexOf(a.cat) - CATEGORY_ORDER.indexOf(b.cat));

    return {
      price: P,
      items,
      oneTime,
      statedTotal,
      allInclusive,
      covered: [...covered],
      mentionedNoAmount: [...mentioned].filter(c => !items.find(x => x.cat === c) && !covered.has(c)),
      unknownAmounts: unknown,
      notes,
      text,
    };
  }

  // ---------- Liczenie sumy wg ustawień ----------
  const DEFAULT_SETTINGS = {
    persons: 1,
    categories: {
      admin:         { mandatory: true, optional: true,  estimate: false, estimateAmount: 600 },
      media:         { mandatory: true, optional: true,  estimate: false, estimateAmount: 200 },
      prad:          { mandatory: true, optional: true,  estimate: true,  estimateAmount: 150 },
      gaz:           { mandatory: true, optional: true,  estimate: false, estimateAmount: 50 },
      woda:          { mandatory: true, optional: true,  estimate: false, estimateAmount: 80 },
      ogrzewanie:    { mandatory: true, optional: true,  estimate: false, estimateAmount: 150 },
      smieci:        { mandatory: true, optional: true,  estimate: false, estimateAmount: 40 },
      internet:      { mandatory: true, optional: false, estimate: true,  estimateAmount: 60 },
      parking:       { mandatory: true, optional: false, estimate: false, estimateAmount: 0 },
      komorka:       { mandatory: true, optional: false, estimate: false, estimateAmount: 0 },
      sprzatanie:    { mandatory: true, optional: false, estimate: false, estimateAmount: 0 },
      ubezpieczenie: { mandatory: true, optional: false, estimate: false, estimateAmount: 10 },
    },
  };

  function mergeSettings(s) {
    const out = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    if (!s) return out;
    if (s.persons > 0) out.persons = +s.persons;
    for (const c of Object.keys(out.categories)) {
      if (s.categories && s.categories[c]) Object.assign(out.categories[c], s.categories[c]);
    }
    return out;
  }

  /**
   * Buduje listę wierszy i sumę.
   * overrides: { [rowId]: true|false } — ręczne zaznaczenia użytkownika dla danego ogłoszenia
   */
  function compute(result, settingsIn, overrides) {
    const settings = mergeSettings(settingsIn);
    overrides = overrides || {};
    const rows = [];

    for (const it of result.items) {
      const cs = settings.categories[it.cat] || { mandatory: true, optional: false };
      const mult = it.perPerson ? settings.persons : 1;
      const amount = Math.round(it.amount * mult);
      const id = 'item:' + it.cat;
      const def = it.optional ? !!cs.optional : cs.mandatory !== false;
      rows.push({
        id, kind: it.optional ? 'optional' : 'item', cat: it.cat,
        label: CATEGORIES[it.cat] ? CATEGORIES[it.cat].label : it.cat,
        amount, approx: !!it.approx, perPerson: !!it.perPerson, persons: mult, yearly: !!it.yearly,
        snippet: it.snippet, note: it.note, alternatives: it.alternatives, covers: it.covers,
        source: it.source,
        checked: id in overrides ? !!overrides[id] : def,
      });
    }

    if (!result.allInclusive) {
      for (const cat of CATEGORY_ORDER) {
        const cs = settings.categories[cat];
        if (!cs || !cs.estimate || !(cs.estimateAmount > 0)) continue;
        if (result.items.find(x => x.cat === cat)) continue;
        if (result.covered.includes(cat)) continue;
        // jeśli są „media” / „opłaty” bez rozbicia, nie szacujemy mediów
        if (['woda', 'ogrzewanie', 'smieci', 'gaz'].includes(cat) && result.items.find(x => x.cat === 'media' || x.cat === 'admin')) continue;
        // kwota za „media” zwykle obejmuje prąd
        if (cat === 'prad' && result.items.find(x => x.cat === 'media')) continue;
        const id = 'est:' + cat;
        rows.push({
          id, kind: 'estimate', cat, label: CATEGORIES[cat].label, amount: Math.round(cs.estimateAmount), approx: true,
          reason: result.mentionedNoAmount.includes(cat) ? 'w ogłoszeniu bez kwoty'
            : ['prad', 'gaz', 'woda'].includes(cat) && result.mentionedNoAmount.includes('media') ? 'ogłoszenie: „media wg zużycia”, bez kwoty'
            : 'ogłoszenie o tym nie wspomina',
          checked: id in overrides ? !!overrides[id] : true,
        });
      }
    }

    const price = result.price || 0;
    const extras = rows.filter(r => r.checked).reduce((s, r) => s + r.amount, 0);
    const total = price + extras;
    const hasEstimate = rows.some(r => r.checked && (r.kind === 'estimate' || r.approx));
    const deposit = result.oneTime.filter(o => o.kind === 'deposit').reduce((s, o) => s + o.amount, 0);
    const startCost = result.oneTime.reduce((s, o) => s + o.amount, 0) + total;

    return { rows, price, extras, total, hasEstimate, deposit, startCost, settings };
  }

  function fmt(n) {
    if (n == null || !isFinite(n)) return '—';
    return Math.round(n).toLocaleString('pl-PL').replace(/ /g, ' ') + ' zł';
  }

  root.PelnyCzynsz = { analyze, compute, htmlToText, fmt, CATEGORIES, CATEGORY_ORDER, DEFAULT_SETTINGS, mergeSettings };
})(typeof globalThis !== 'undefined' ? globalThis : this);
