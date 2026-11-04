// 4Rent — style interfejsu. Wstawiane do Shadow DOM każdego elementu wtyczki,
// więc style strony (i innych wtyczek) nie mają na nie wpływu.
globalThis.FourRentCSS = `
:host {
  all: initial;
  --pc-green: #0b7a4b;
  --pc-green-dark: #075a37;
  --pc-green-bg: #e8f5ee;
  --pc-amber: #a15c00;
  --pc-text: #1d2433;
  --pc-muted: #667085;
  --pc-line: #e4e7ec;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--pc-text);
}
*, *::before, *::after { box-sizing: border-box; }

/* plakietka */
.pc-badge {
  all: unset;
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 999px;
  background: var(--pc-green);
  color: #fff;
  font: 600 13px/1.2 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: 0 1px 2px rgba(16, 24, 40, .15);
  transition: background .15s;
}
.pc-badge:hover { background: var(--pc-green-dark); }
.pc-badge:focus-visible { outline: 2px solid #3a77ff; outline-offset: 2px; }
.pc-badge-label { font-weight: 500; opacity: .85; font-size: 12px; }
.pc-badge-value { font-weight: 700; font-size: 14px; }
.pc-badge-unit { font-weight: 500; opacity: .85; font-size: 12px; }
.pc-badge-caret { font-size: 10px; opacity: .8; margin-left: 2px; }
.pc-badge.pc-over { background: #c62828; }
.pc-badge.pc-over:hover { background: #a01f1f; }
.pc-pin.pc-over { background: #c62828; }
.pc-badge.pc-loading { background: #eef0f3; color: var(--pc-muted); font-weight: 500; box-shadow: none; cursor: progress; }
.pc-badge.pc-error { background: #f2f4f7; color: var(--pc-muted); font-weight: 500; box-shadow: none; cursor: help; }

/* dopiska w pinezce mapy */
.pc-pin {
  display: block;
  margin: 3px auto 0;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--pc-green);
  color: #fff;
  font: 700 11px/1.3 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  white-space: nowrap;
  text-align: center;
}

/* okienko */
.pc-pop {
  display: block;
  background: #fff;
  color: var(--pc-text);
  border: 1px solid var(--pc-line);
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(16, 24, 40, .18), 0 2px 6px rgba(16, 24, 40, .08);
  padding: 12px 14px 10px;
  font-size: 13px;
  line-height: 1.35;
  text-align: left;
}
.pc-pop-head { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 8px; }
.pc-pop-title { flex: 1; font-size: 12px; color: var(--pc-muted); overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.pc-close { all: unset; cursor: pointer; font-size: 20px; line-height: 16px; color: var(--pc-muted); padding: 0 2px; }
.pc-close:hover { color: var(--pc-text); }

/* ramka na stronie ogłoszenia */
.pc-panel {
  display: block;
  padding: 12px 14px 10px;
  border: 1px solid #b7e0c9;
  border-radius: 12px;
  background: #fbfefc;
  color: var(--pc-text);
  font-size: 14px;
  line-height: 1.35;
  text-align: left;
}
.pc-panel-head { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 13px; color: var(--pc-green-dark); margin-bottom: 8px; }
.pc-logo { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 6px; background: var(--pc-green); color: #fff; font-size: 10px; font-weight: 800; letter-spacing: -.02em; }

/* rozpiska */
.pc-total { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 8px 10px; border-radius: 8px; background: var(--pc-green-bg); margin-bottom: 8px; }
.pc-total-label { color: var(--pc-green-dark); font-weight: 600; }
.pc-total-value { color: var(--pc-green-dark); font-size: 20px; font-weight: 800; font-variant-numeric: tabular-nums; }
.pc-total { flex-wrap: wrap; }
.pc-total.pc-over { background: #fdecec; }
.pc-total.pc-over .pc-total-label, .pc-total.pc-over .pc-total-value { color: #b42318; }
.pc-limit-note { flex-basis: 100%; font-size: 12px; color: #b42318; font-weight: 600; }
.pc-limit-ok { flex-basis: 100%; font-size: 12px; color: var(--pc-green-dark); }

.pc-rows { display: flex; flex-direction: column; width: 100%; }
.pc-row { display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; align-items: start; gap: 8px; width: 100%; padding: 5px 2px; border-bottom: 1px solid var(--pc-line); cursor: pointer; margin: 0; font-weight: 400; }
.pc-row:last-child { border-bottom: 0; }
.pc-row input[type="checkbox"] { margin: 2px 0 0; width: 15px; height: 15px; accent-color: var(--pc-green); cursor: pointer; }
.pc-cb-placeholder { display: block; width: 15px; }
.pc-label { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 5px; min-width: 0; }
.pc-sub { flex-basis: 100%; font-size: 11.5px; color: var(--pc-muted); }
.pc-amount { font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; text-align: right; }
.pc-off .pc-label, .pc-off .pc-amount { color: #98a2b3; text-decoration: line-through; text-decoration-color: #c4c9d2; }
.pc-est .pc-amount { color: var(--pc-amber); }
.pc-bold .pc-label, .pc-bold .pc-amount { font-weight: 700; }
.pc-src { color: var(--pc-muted); cursor: help; font-size: 12px; }
.pc-sec { margin: 10px 0 2px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--pc-muted); }
.pc-sec-hint { text-transform: none; letter-spacing: 0; font-weight: 400; }
.pc-empty { color: var(--pc-muted); padding: 6px 2px; }

.pc-info { margin-top: 8px; padding: 6px 10px; border-radius: 8px; background: #f6f7f9; font-size: 12px; color: #475467; display: flex; flex-direction: column; gap: 3px; }
.pc-warn { color: var(--pc-amber); }
.pc-start { margin-top: 4px; }

.pc-unknown { display: block; margin-top: 8px; font-size: 12px; color: #475467; }
.pc-unknown summary { cursor: pointer; color: var(--pc-muted); }
.pc-unknown-item { padding: 4px 0 4px 10px; border-left: 2px solid var(--pc-line); margin: 4px 0; }

.pc-foot { display: flex; justify-content: space-between; gap: 10px; margin-top: 10px; font-size: 11px; color: var(--pc-muted); }
.pc-links { display: flex; gap: 10px; white-space: nowrap; }
.pc-links a { color: var(--pc-green); font-weight: 600; text-decoration: none; cursor: pointer; }
.pc-links a:hover { text-decoration: underline; }
`;
