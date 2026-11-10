// 4Rent — odczyt danych ogłoszenia OLX z HTML strony ogłoszenia.
// (OLX zamknął publiczne API /api/v1/offers — od listopada 2026 zwraca 403.)
// Używane w tle (background.js przez importScripts) i na stronie (content script).
(function (root) {
  'use strict';

  // „ul. Śliczna 16”, „ulica Kunickiego” → „Śliczna 16”
  function streetFromText(s) {
    if (!s) return null;
    const t = String(s).replace(/<[^>]+>/g, ' ');
    const m = t.match(/(?<!\p{L})(?:ul\.|ulica|ulicy|al\.|aleja|alei|pl\.|plac|placu|os\.|osiedle)\s*((?:\p{Lu}[\p{L}.-]*\s*){1,3})(\d+[a-zA-Z]?)?/u);
    return m ? (m[1].trim() + (m[2] ? ' ' + m[2] : '')).trim() : null;
  }

  function fromHtml(html) {
    const m = String(html).match(/window\.__PRERENDERED_STATE__\s*=\s*("(?:[^"\\]|\\.)*")/);
    if (!m) return null;
    let ad;
    try { ad = JSON.parse(JSON.parse(m[1])).ad.ad; } catch (e) { return null; }
    if (!ad || !ad.id) return null;
    const param = k => (ad.params || []).find(p => p.key === k);
    const num = v => {
      if (v == null || v === '') return null;
      const n = parseFloat(String(v).replace(/[^\d.,]/g, '').replace(',', '.'));
      return isFinite(n) ? n : null;
    };
    const rentP = param('rent');
    const map = ad.map || {};
    return {
      site: 'olx',
      id: String(ad.id),
      title: ad.title || '',
      price: num(ad.price && ad.price.regularPrice && ad.price.regularPrice.value),
      adminRent: rentP ? num(rentP.normalizedValue != null ? rentP.normalizedValue : rentP.value) : null,
      deposit: null,
      description: ad.description || '',
      isBusiness: !!ad.isBusiness,
      // OLX zwykle podaje tylko okolicę; ulicę próbujemy wyczytać z tytułu/opisu
      location: map.lat ? {
        lat: map.lat, lon: map.lon,
        radiusM: map.show_detailed ? 0 : 1500,
        areaOnly: !map.show_detailed,
        street: streetFromText(ad.title) || streetFromText(ad.description),
        city: (ad.location && ad.location.cityName) || null,
      } : null,
    };
  }

  root.FourRentOlx = { fromHtml, streetFromText };
})(typeof globalThis !== 'undefined' ? globalThis : this);
