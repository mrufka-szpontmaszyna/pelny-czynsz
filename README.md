# 4Rent

Wtyczka do Chrome, która na **Otodom** i **OLX** liczy realny miesięczny koszt mieszkania: najem + czynsz administracyjny + wszystkie opłaty wypisane w opisie (prąd, gaz, parking, internet…).

## Co robi

- **Na liście ogłoszeń** przy cenie pojawia się zielona plakietka „Realnie ≈ 3 650 zł/mies.”. Po kliknięciu pokazuje rozpiskę.
- **Na stronie ogłoszenia** pod ceną pojawia się ramka z pełną rozpiską.
- W rozpisce:
  - **opłaty stałe** z ogłoszenia (czynsz administracyjny, prąd, gaz…),
  - **opcjonalne** dodatki (parking, komórka itp.) w osobnej sekcji — doliczasz je ptaszkiem,
  - **szacunki** dla opłat bez kwoty (np. „prąd wg zużycia” → 150 zł; kwoty ustawiasz sama),
  - co jest **w cenie** (np. „komórka lokatorska w cenie”),
  - **na start**: kaucja, prowizja i suma z pierwszym miesiącem,
  - suma podana przez ogłoszeniodawcę (jeśli jest) — do porównania,
  - kwoty z opisu, których wtyczka nie rozpoznała (do samodzielnego sprawdzenia).
- Przy każdej pozycji jest ⓘ — po najechaniu widać fragment opisu, z którego wzięła się kwota.
- Ptaszki w rozpisce zapamiętują się dla danego ogłoszenia.

## Instalacja (tryb dewelopera)

1. Otwórz w Chrome adres `chrome://extensions`.
2. W prawym górnym rogu włącz **Tryb dewelopera**.
3. Kliknij **Załaduj rozpakowane** i wskaż folder `D:\Projekty\pelny-czynsz`.
4. Gotowe — wejdź na listę mieszkań na otodom.pl albo olx.pl.

Po zmianach w kodzie kliknij ikonę odświeżania przy wtyczce w `chrome://extensions` i przeładuj stronę z ogłoszeniami.

## Ustawienia

Kliknij ikonę wtyczki (zielone „4R”) albo link „Ustawienia” w rozpisce. Dla każdej kategorii ustawiasz:

- **Doliczaj obowiązkowe** — opłaty podane jako stałe,
- **Doliczaj opcjonalne** — dodatki opisane jako „opcjonalnie” / „możliwość wynajęcia” (domyślnie parking i komórka są wyłączone),
- **Szacuj, gdy brak kwoty** + kwota szacunku (domyślnie prąd 150 zł i internet 60 zł).

Jest też liczba osób (dla opłat „za osobę”).

## Jak to działa

- Dane ogłoszenia (cena, pole „czynsz”, kaucja, opis) wtyczka pobiera w tle: z Otodom z danych strony, z OLX z ich API. Pobrane ogłoszenia pamięta przez 6 godzin.
- Opis analizuje `src/parser.js` — rozpoznaje kwoty („250 zł”, „1 100 PLN”, „150-200 zł”) i dopasowuje je do kategorii po słowach obok („Prąd: 200 zł”, „300 zł – miejsce postojowe”, „możliwość wynajęcia garażu za 250 zł”…).
- Wszystko działa lokalnie, bez kont i bez AI. Nic nie jest wysyłane poza Otodom/OLX.

Analiza tekstu to heurystyka — przy nietypowych opisach może się pomylić. Dlatego każda kwota ma podgląd źródła i ptaszek do odznaczenia.

## Dla dewelopera

- `src/parser.js` — analiza opisu i liczenie sumy (czysty JS),
- `src/content.js` + `src/content.css` — plakietki, okienko, ramka,
- `src/background.js` — pobieranie danych ogłoszeń,
- `options.html` / `options.js` — ustawienia,
- `test/parser.test.js` — testy: `deno test test/`,
- `tools/probe.js` — sprawdza parser na żywych ogłoszeniach: `deno run --allow-net tools/probe.js otodom`,
- `tools/devserver.js` — podgląd wtyczki na kopii strony bez instalowania: `deno run -A tools/devserver.js`, potem `http://localhost:8765/page?url=<adres listy>`.
