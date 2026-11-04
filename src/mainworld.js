// 4Rent — skrypt działający w „świecie strony” Otodom (MAIN world).
// Pinezki na mapie mają w danych React prawdziwy adres ogłoszenia (slug) — zapisujemy go
// w atrybucie data-fourrent-slug, żeby główna część wtyczki mogła go odczytać.
(function () {
  'use strict';
  function tagPins() {
    document.querySelectorAll('.pin.pin--single:not([data-fourrent-slug])').forEach(pin => {
      let slug = '', tx = '';
      try {
        const fk = Object.keys(pin).find(k => k.startsWith('__reactFiber'));
        let f = fk && pin[fk];
        for (let i = 0; f && i < 8; i++, f = f.return) {
          const ad = f.memoizedProps && f.memoizedProps.pin && f.memoizedProps.pin.ad;
          if (ad && ad.slug) { slug = String(ad.slug); tx = String(ad.transaction || ''); break; }
        }
      } catch (e) { /* zmiana budowy strony — po prostu bez dopiski */ }
      pin.setAttribute('data-fourrent-tx', tx);
      pin.setAttribute('data-fourrent-slug', slug);
    });
  }
  let t = null;
  new MutationObserver(() => {
    if (t) return;
    t = setTimeout(() => { t = null; tagPins(); }, 120);
  }).observe(document.documentElement, { childList: true, subtree: true });
  tagPins();
})();
