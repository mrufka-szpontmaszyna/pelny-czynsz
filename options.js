// 4Rent — strona ustawień
(async function () {
  'use strict';
  const PC = globalThis.PelnyCzynsz;
  const stored = (await chrome.storage.sync.get('settings')).settings;
  const settings = PC.mergeSettings(stored);
  const tbody = document.getElementById('cats');
  const ADDON_NOTE = { parking: 'zwykle opcjonalne', komorka: 'zwykle opcjonalne', sprzatanie: 'zwykle opcjonalne' };

  for (const cat of PC.CATEGORY_ORDER) {
    const cs = settings.categories[cat];
    const tr = document.createElement('tr');
    const name = document.createElement('td');
    name.textContent = PC.CATEGORIES[cat].label;
    if (ADDON_NOTE[cat]) {
      const t = document.createElement('span');
      t.className = 'tag';
      t.textContent = ADDON_NOTE[cat];
      name.append(t);
    }
    tr.append(name);

    const cell = (key, type) => {
      const td = document.createElement('td');
      td.className = 'c';
      const inp = document.createElement('input');
      inp.type = type;
      if (type === 'checkbox') inp.checked = !!cs[key];
      else { inp.value = cs[key]; inp.min = 0; inp.step = 10; }
      inp.addEventListener(type === 'checkbox' ? 'change' : 'input', () => {
        cs[key] = type === 'checkbox' ? inp.checked : Math.max(0, +inp.value || 0);
        if (key === 'estimate') amountInput.disabled = !inp.checked;
        save();
      });
      td.append(inp);
      tr.append(td);
      return inp;
    };
    cell('mandatory', 'checkbox');
    cell('optional', 'checkbox');
    cell('estimate', 'checkbox');
    const amountInput = cell('estimateAmount', 'number');
    amountInput.disabled = !cs.estimate;
    tbody.append(tr);
  }

  const persons = document.getElementById('persons');
  persons.value = settings.persons;
  persons.addEventListener('input', () => {
    settings.persons = Math.max(1, Math.min(10, Math.round(+persons.value || 1)));
    save();
  });

  let t;
  function save() {
    chrome.storage.sync.set({ settings });
    const s = document.getElementById('saved');
    s.classList.add('show');
    clearTimeout(t);
    t = setTimeout(() => s.classList.remove('show'), 1200);
  }

  document.getElementById('clear').addEventListener('click', async () => {
    const r = await chrome.runtime.sendMessage({ type: 'clearCache' });
    document.getElementById('clearMsg').textContent = r && r.ok ? `Usunięto ${r.removed} ogłoszeń z pamięci.` : 'Nie udało się.';
  });
})();
