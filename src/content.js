// 4Rent — plakietki na listach i ramka na stronie ogłoszenia.
(function () {
  'use strict';
  const PC = globalThis.PelnyCzynsz;
  const host = location.hostname;
  const SITE = host.includes('otodom.') ? 'otodom' : host.includes('olx.') ? 'olx' : null;
  if (!SITE) return;

  let settings = PC.mergeSettings(null);
  const states = new Map(); // key -> { status, data, analysis, overrides, error, listeners:Set }

  // ---------- Pomocnicze DOM ----------
  function el(tag, attrs, ...children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      e.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return e;
  }
  const fmt = PC.fmt;

  // Element wtyczki z własnym Shadow DOM — style strony go nie dotykają
  function shadowHost(tag, attrs) {
    const host = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) host.setAttribute(k, v);
    const root = host.attachShadow({ mode: 'open' });
    root.append(el('style', { text: globalThis.FourRentCSS || '' }));
    return { host, root };
  }

  // ---------- Stan i dane ----------
  function cleanUrl(u) {
    try { const x = new URL(u, location.href); return x.origin + x.pathname; } catch (e) { return u; }
  }
  function keyOf(ref) { return ref.site + ':' + (ref.id || cleanUrl(ref.url)); }

  function getState(ref) {
    const key = keyOf(ref);
    let st = states.get(key);
    if (!st) {
      st = { key, ref, status: 'loading', listeners: new Set(), overrides: {} };
      states.set(key, st);
      load(st);
    }
    return st;
  }

  async function load(st) {
    try {
      const ovKey = 'ov:' + st.key;
      const [resp, ov] = await Promise.all([
        chrome.runtime.sendMessage({ type: 'fetchAd', ref: st.ref }),
        chrome.storage.local.get(ovKey),
      ]);
      st.overrides = ov[ovKey] || {};
      if (!resp || !resp.ok) throw new Error(resp ? resp.error : 'brak odpowiedzi');
      st.data = resp.data;
      st.analysis = PC.analyze(resp.data);
      st.status = 'ok';
    } catch (e) {
      st.status = 'error';
      st.error = String(e && e.message || e);
    }
    notify(st);
  }

  function notify(st) {
    for (const fn of [...st.listeners]) {
      try { fn(st); } catch (e) { console.warn('[4Rent]', e); }
    }
  }

  function setOverride(st, id, value) {
    st.overrides[id] = value;
    chrome.storage.local.set({ ['ov:' + st.key]: st.overrides });
    notify(st);
  }
  function resetOverrides(st) {
    st.overrides = {};
    chrome.storage.local.remove('ov:' + st.key);
    notify(st);
  }

  // ---------- Rozpiska kosztów ----------
  function renderBreakdown(st, opts) {
    const a = st.analysis;
    const c = PC.compute(a, settings, st.overrides);
    const box = el('div', { class: 'pc-breakdown' });

    box.append(el('div', { class: 'pc-total' + (c.overLimit ? ' pc-over' : '') },
      el('span', { class: 'pc-total-label', text: 'Realnie miesięcznie' }),
      el('strong', { class: 'pc-total-value', text: (c.hasEstimate ? '≈ ' : '') + fmt(c.total) }),
      c.overLimit ? el('span', { class: 'pc-limit-note', text: `Ponad Twój limit ${fmt(c.settings.limit)} o ${fmt(c.overBy)}` })
        : c.settings.limit > 0 ? el('span', { class: 'pc-limit-ok', text: `W limicie ${fmt(c.settings.limit)} (zapas ${fmt(c.settings.limit - c.total)})` }) : null
    ));

    const list = el('div', { class: 'pc-rows' });
    list.append(row({ label: 'Najem (cena z ogłoszenia)', amount: c.price, fixed: true }));

    const mand = c.rows.filter(r => r.kind === 'item');
    const optional = c.rows.filter(r => r.kind === 'optional');
    const est = c.rows.filter(r => r.kind === 'estimate');

    if (!mand.length && !est.length && !optional.length) {
      list.append(el('div', { class: 'pc-empty', text: 'Nie znaleziono w ogłoszeniu żadnych dodatkowych opłat.' }));
    }
    mand.forEach(r => list.append(rowFor(r)));

    if (optional.length) {
      list.append(el('div', { class: 'pc-sec' }, 'Opcjonalne ', el('span', { class: 'pc-sec-hint', text: '(oznaczone w ogłoszeniu jako dodatkowe)' })));
      optional.forEach(r => list.append(rowFor(r)));
    }
    if (est.length) {
      list.append(el('div', { class: 'pc-sec' }, 'Szacunki ', el('span', { class: 'pc-sec-hint', text: '(brak kwoty w ogłoszeniu)' })));
      est.forEach(r => list.append(rowFor(r)));
    }
    box.append(list);

    const info = el('div', { class: 'pc-info' });
    if (a.allInclusive) info.append(el('div', { text: '✔ Ogłoszenie podaje, że opłaty są wliczone w cenę.' }));
    const shownCats = new Set(c.rows.map(r => r.cat));
    const extraNoAmount = (a.extraNoAmount || []).filter(x => !shownCats.has(x) && PC.CATEGORIES[x]).map(x => PC.CATEGORIES[x].label.toLowerCase());
    if (extraNoAmount.length) info.append(el('div', { class: 'pc-warn', text: '⚠ Płatne dodatkowo, ale bez kwoty w ogłoszeniu: ' + extraNoAmount.join(', ') }));
    const covered = a.covered.filter(x => PC.CATEGORIES[x]).map(x => PC.CATEGORIES[x].label.toLowerCase());
    if (covered.length && !a.allInclusive) info.append(el('div', { text: '✔ W cenie / wliczone: ' + covered.join(', ') }));
    if (a.statedTotal) {
      const diff = Math.round(c.total - a.statedTotal);
      info.append(el('div', {
        text: `Ogłoszeniodawca podaje łącznie: ${fmt(a.statedTotal)}` + (Math.abs(diff) > 20 ? ` (wtyczka liczy ${diff > 0 ? '+' : '−'}${fmt(Math.abs(diff))})` : ' ✔'),
      }));
    }
    if (info.childNodes.length) box.append(info);

    if (a.oneTime.length) {
      const start = el('div', { class: 'pc-rows pc-start' });
      start.append(el('div', { class: 'pc-sec', text: 'Na start (jednorazowo)' }));
      a.oneTime.forEach(o => start.append(row({ label: o.label, amount: o.amount, fixed: true, snippet: o.snippet, noCheck: true })));
      start.append(row({ label: 'Razem na start (z 1. miesiącem)', amount: c.startCost, fixed: true, noCheck: true, bold: true }));
      box.append(start);
    }

    if (a.unknownAmounts.length) {
      const det = el('details', { class: 'pc-unknown' }, el('summary', { text: `Inne kwoty w opisie — nierozpoznane (${a.unknownAmounts.length})` }));
      a.unknownAmounts.slice(0, 8).forEach(u => det.append(el('div', { class: 'pc-unknown-item' }, el('b', { text: fmt(u.amount) }), ' — ', u.snippet)));
      box.append(det);
    }

    const foot = el('div', { class: 'pc-foot' },
      el('span', { text: 'Wyliczone automatycznie z opisu — najedź na ⓘ, żeby zobaczyć źródło.' }),
      el('span', { class: 'pc-links' },
        Object.keys(st.overrides).length ? el('a', { href: '#', onclick: e => { e.preventDefault(); e.stopPropagation(); resetOverrides(st); }, text: 'Przywróć' }) : null,
        el('a', { href: '#', onclick: e => { e.preventDefault(); e.stopPropagation(); chrome.runtime.sendMessage({ type: 'openOptions' }); }, text: 'Ustawienia' })
      )
    );
    box.append(foot);
    return box;

    function rowFor(r) {
      let label = r.label;
      let sub = null;
      if (r.kind === 'estimate') sub = r.reason;
      if (r.perPerson) sub = `${fmt(r.amount / r.persons)} na osobę × ${r.persons}`;
      if (r.yearly) sub = 'kwota roczna podzielona na 12';
      if (r.note) sub = (sub ? sub + '; ' : '') + r.note;
      if (r.alternatives && r.alternatives.length) sub = (sub ? sub + '; ' : '') + 'w opisie też: ' + r.alternatives.map(x => fmt(x.amount)).join(', ');
      if (r.covers && r.covers.length) sub = (sub ? sub + '; ' : '') + 'obejmuje: ' + r.covers.map(x => (PC.CATEGORIES[x] ? PC.CATEGORIES[x].label.toLowerCase() : x)).join(', ');
      return row({
        id: r.id, label, sub, amount: r.amount, approx: r.approx, checked: r.checked, snippet: r.snippet,
        estimate: r.kind === 'estimate',
      });
    }

    function row(o) {
      const cb = o.fixed || o.noCheck
        ? el('span', { class: 'pc-cb-placeholder' })
        : el('input', {
          type: 'checkbox', checked: o.checked, title: 'Doliczaj do sumy',
          onclick: e => e.stopPropagation(),
          onchange: e => setOverride(st, o.id, e.target.checked),
        });
      const info = o.snippet ? el('span', { class: 'pc-src', title: (o.snippet.startsWith('Kwota') ? '' : 'Z opisu: ') + o.snippet, text: 'ⓘ' }) : null;
      const r = el('label', { class: 'pc-row' + (o.checked === false ? ' pc-off' : '') + (o.estimate ? ' pc-est' : '') + (o.bold ? ' pc-bold' : '') },
        cb,
        el('span', { class: 'pc-label' }, el('span', { text: o.label }), info, o.sub ? el('span', { class: 'pc-sub', text: o.sub }) : null),
        el('span', { class: 'pc-amount', text: (o.approx ? '≈ ' : '') + fmt(o.amount) })
      );
      if (o.fixed || o.noCheck) r.addEventListener('click', e => e.preventDefault());
      return r;
    }
  }

  // ---------- Plakietka na liście ----------
  function makeBadge(ref) {
    const st = getState(ref);
    const { host, root } = shadowHost('fourrent-badge', { 'data-pc-key': st.key });
    const badge = el('button', { type: 'button', class: 'pc-badge pc-loading', text: 'liczę pełny koszt…' });
    root.append(badge);
    let wasConnected = false;
    const update = () => {
      // odpinamy się dopiero, gdy plakietka była na stronie i z niej zniknęła
      if (host.isConnected) wasConnected = true;
      else if (wasConnected) { st.listeners.delete(update); return; }
      if (st.status === 'loading') return;
      if (st.status === 'error') {
        badge.className = 'pc-badge pc-error';
        badge.textContent = 'pełny koszt: ?';
        badge.title = 'Nie udało się pobrać ogłoszenia: ' + st.error;
        return;
      }
      const c = PC.compute(st.analysis, settings, st.overrides);
      badge.className = 'pc-badge' + (c.hasEstimate ? ' pc-has-est' : '') + (c.overLimit ? ' pc-over' : '');
      badge.textContent = '';
      badge.append(
        el('span', { class: 'pc-badge-label', text: 'Realnie' }),
        el('span', { class: 'pc-badge-value', text: (c.hasEstimate ? '≈ ' : '') + fmt(c.total) }),
        el('span', { class: 'pc-badge-unit', text: '/mies.' }),
        el('span', { class: 'pc-badge-caret', text: '▾' })
      );
      const extras = c.total - c.price;
      badge.title = `Najem ${fmt(c.price)} + dodatkowo ${fmt(extras)}.` + (c.overLimit ? ` Ponad Twój limit o ${fmt(c.overBy)}.` : '') + ' Kliknij, żeby zobaczyć rozpiskę.';
      if (openPop && openPop.badge === host) renderPop();
    };
    st.listeners.add(update);
    update();
    badge.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      if (openPop && openPop.badge === host) closePop();
      else if (st.status === 'ok') showPop(host, st);
    });
    // nie pozwól kartom ogłoszeń przechwycić kliknięcia (nawigacja)
    ['mousedown', 'mouseup', 'pointerdown', 'pointerup'].forEach(ev => badge.addEventListener(ev, e => e.stopPropagation()));
    return host;
  }

  // ---------- Okienko z rozpiską ----------
  let openPop = null;
  function showPop(badge, st) {
    closePop();
    const { host, root } = shadowHost('fourrent-pop');
    const inner = el('div', { class: 'pc-pop' });
    root.append(inner);
    ['click', 'mousedown', 'mouseup', 'pointerdown'].forEach(ev => host.addEventListener(ev, e => e.stopPropagation()));
    document.body.append(host);
    openPop = { pop: host, inner, badge, st };
    renderPop();
  }
  function renderPop() {
    if (!openPop) return;
    const { pop, inner, badge, st } = openPop;
    inner.replaceChildren(
      el('div', { class: 'pc-pop-head' },
        el('span', { class: 'pc-pop-title', text: st.data && st.data.title ? st.data.title : 'Rozpiska kosztów' }),
        el('button', { type: 'button', class: 'pc-close', title: 'Zamknij', text: '×', onclick: closePop })
      ),
      renderBreakdown(st)
    );
    positionPop(pop, badge);
  }
  function positionPop(pop, badge) {
    const r = badge.getBoundingClientRect();
    const w = Math.min(380, window.innerWidth - 24);
    pop.style.width = w + 'px';
    let left = r.left + window.scrollX;
    left = Math.max(window.scrollX + 12, Math.min(left, window.scrollX + window.innerWidth - w - 12));
    pop.style.left = left + 'px';
    pop.style.top = (r.bottom + window.scrollY + 6) + 'px';
  }
  function closePop() {
    if (openPop) { openPop.pop.remove(); openPop = null; }
  }
  document.addEventListener('click', e => { if (openPop && !openPop.pop.contains(e.target)) closePop(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePop(); });
  window.addEventListener('resize', () => { if (openPop) positionPop(openPop.pop, openPop.badge); });

  // ---------- Ramka na stronie ogłoszenia ----------
  function makePanel(ref) {
    const st = getState(ref);
    const { host, root } = shadowHost('fourrent-panel', { 'data-pc-key': st.key });
    const panel = el('div', { class: 'pc-panel' });
    root.append(panel);
    let wasConnected = false;
    const update = () => {
      if (host.isConnected) wasConnected = true;
      else if (wasConnected) { st.listeners.delete(update); return; }
      const head = el('div', { class: 'pc-panel-head' }, el('span', { class: 'pc-logo', text: '4R' }), el('span', { text: '4Rent' }));
      if (st.status === 'loading') panel.replaceChildren(head, el('div', { class: 'pc-empty', text: 'Liczę pełny koszt…' }));
      else if (st.status === 'error') panel.replaceChildren(head, el('div', { class: 'pc-empty', text: 'Nie udało się odczytać ogłoszenia (' + st.error + ').' }));
      else panel.replaceChildren(head, renderBreakdown(st));
    };
    st.listeners.add(update);
    update();
    return host;
  }

  // ---------- Wyszukiwanie miejsc na stronie ----------
  function refFromHref(href) {
    let u;
    try { u = new URL(href, location.href); } catch (e) { return null; }
    if (u.hostname.includes('otodom.')) {
      if (!/\/oferta\//.test(u.pathname) || /\/hpr\//.test(u.pathname)) return null;
      return otodomRef(u.origin + u.pathname);
    }
    return null;
  }

  // Otodom: kod „ID4DPNL” w adresie to numer ogłoszenia (68599265) zapisany w base62.
  // Klucz po numerze pozwala dzielić dane między listą, mapą i stroną ogłoszenia.
  const B62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  function b62decode(s) { let n = 0; for (const ch of s) { const i = B62.indexOf(ch); if (i < 0) return null; n = n * 62 + i; } return n; }
  function b62encode(n) { let s = ''; n = +n; while (n > 0) { s = B62[n % 62] + s; n = Math.floor(n / 62); } return s; }
  function otodomRef(url) {
    const m = url.match(/[-/]ID([0-9a-zA-Z]+)\/?$/);
    const id = m ? b62decode(m[1]) : null;
    return id ? { site: 'otodom', id: String(id), url } : { site: 'otodom', url };
  }
  function otodomRefFromId(id) {
    return { site: 'otodom', id: String(id), url: 'https://www.otodom.pl/pl/oferta/ID' + b62encode(id) };
  }

  // ---------- Pinezki na mapie ----------
  function makePinLabel(ref) {
    const st = getState(ref);
    const { host, root } = shadowHost('fourrent-pin', { 'data-pc-key': st.key });
    host.hidden = true;
    const label = el('span', { class: 'pc-pin' });
    root.append(label);
    let wasConnected = false;
    const update = () => {
      if (host.isConnected) wasConnected = true;
      else if (wasConnected) { st.listeners.delete(update); return; }
      if (st.status !== 'ok') { host.hidden = true; return; }
      const c = PC.compute(st.analysis, settings, st.overrides);
      host.hidden = false;
      label.textContent = (c.hasEstimate ? '≈ ' : '') + fmt(c.total);
      label.className = 'pc-pin' + (c.overLimit ? ' pc-over' : '');
      label.title = `4Rent: realnie ${fmt(c.total)}/mies. (najem ${fmt(c.price)} + dodatkowo ${fmt(c.total - c.price)})`;
    };
    st.listeners.add(update);
    update();
    return host;
  }

  function scanOtodomMap() {
    // okienko po kliknięciu pinezki
    document.querySelectorAll('[data-cy*="selected-ad-preview"]').forEach(prev => {
      const a = prev.querySelector('a[href*="/oferta/"]');
      const ref = a && refFromHref(a.getAttribute('href'));
      if (!ref) return;
      const priceRow = prev.querySelector('[data-sentry-element="PriceWrapper"]') ||
        [...prev.querySelectorAll('div, span')].find(x => /\d\s*zł/.test(x.textContent) && /czynsz/.test(x.textContent) && x.children.length <= 3);
      if (!priceRow) return;
      placeBadge(prev, ref, b => priceRow.after(b));
    });
    // pinezki z ceną (pojedyncze ogłoszenia, nie grupy)
    if (settings.mapPins === false) {
      document.querySelectorAll('fourrent-pin').forEach(x => x.remove());
      return;
    }
    document.querySelectorAll('.pin.pin--single[id]').forEach(pin => {
      if (!/^\d+$/.test(pin.id)) return;
      const ref = otodomRefFromId(pin.id);
      const existing = pin.querySelector(':scope > fourrent-pin');
      if (existing && existing.dataset.pcKey === keyOf(ref)) return;
      if (existing) existing.remove();
      pin.append(makePinLabel(ref));
    });
  }

  function placeBadge(container, ref, insert) {
    const key = keyOf(ref);
    const existing = container.querySelector(':scope fourrent-badge');
    if (existing && existing.dataset.pcKey === key) return;
    if (existing) existing.remove();
    insert(makeBadge(ref));
  }

  function scanOtodom() {
    // lista wyników
    document.querySelectorAll('[data-cy="listing-item-price"]').forEach(priceEl => {
      const card = priceEl.closest('article, li, [data-cy="listing-item"]') || priceEl.parentElement;
      const a = card && card.querySelector('a[href*="/oferta/"]');
      const ref = a && refFromHref(a.getAttribute('href'));
      if (!ref) return;
      placeBadge(priceEl.parentElement, ref, b => priceEl.after(b));
    });
    // mapa
    scanOtodomMap();
    // strona ogłoszenia
    const price = document.querySelector('[data-cy="adPageHeaderPrice"]');
    if (price && /\/oferta\//.test(location.pathname)) {
      const ref = otodomRef(location.origin + location.pathname);
      const anchor = price.parentElement && price.parentElement.parentElement || price.parentElement;
      mountPanel(anchor, ref);
    }
  }

  function scanOlx() {
    document.querySelectorAll('[data-cy="l-card"]').forEach(card => {
      const priceEl = card.querySelector('[data-testid="ad-price"]');
      const a = card.querySelector('a[href]');
      if (!priceEl || !a) return;
      let ref = refFromHref(a.getAttribute('href'));
      if (!ref) {
        if (!/^\d+$/.test(card.id || '')) return;
        ref = { site: 'olx', id: card.id };
      }
      placeBadge(priceEl.parentElement, ref, b => priceEl.after(b));
    });
    const pc = document.querySelector('[data-testid="ad-price-container"]');
    if (pc && /\/d\/oferta\//.test(location.pathname)) {
      mountPanel(pc, { site: 'olx', url: location.origin + location.pathname });
    }
  }

  function mountPanel(anchor, ref) {
    const key = keyOf(ref);
    const existing = document.querySelector('fourrent-panel');
    if (existing && existing.dataset.pcKey === key && existing.isConnected) return;
    if (existing) existing.remove();
    anchor.after(makePanel(ref));
  }

  let scanTimer = null;
  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      try { SITE === 'otodom' ? scanOtodom() : scanOlx(); } catch (e) { console.warn('[4Rent]', e); }
    }, 250);
  }

  // ---------- Start ----------
  chrome.storage.sync.get('settings').then(s => {
    settings = PC.mergeSettings(s.settings);
    scheduleScan();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.settings) {
      settings = PC.mergeSettings(changes.settings.newValue);
      states.forEach(notify);
      scheduleScan();
    }
  });
  new MutationObserver(muts => {
    // własne elementy wtyczki (fourrent-*) nie uruchamiają ponownego skanowania
    if (muts.some(m => [...m.addedNodes].some(n => n.nodeType === 1 && !n.tagName.startsWith('FOURRENT-')))) scheduleScan();
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
