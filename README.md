# 4Rent

Wtyczka do Chrome, która na **Otodom** i **OLX** liczy realny miesięczny koszt mieszkania: najem + czynsz administracyjny + wszystkie opłaty wypisane w opisie (prąd, gaz, parking, internet…).

## Co robi

- **Na liście ogłoszeń** przy cenie pojawia się zielona plakietka „Realnie ≈ 3 650 zł/mies.”. Po kliknięciu pokazuje rozpiskę.
- **Na stronie ogłoszenia** pod ceną pojawia się ramka z pełną rozpiską.
- **Na mapie Otodom** każda pinezka z ceną dostaje małą zieloną dopiskę z pełną kwotą, a okienko po kliknięciu pinezki — plakietkę z rozpiską. (Dopiski na pinezkach można wyłączyć w ustawieniach.)
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
- **🎓 Dojazd komunikacją** do wybranego miejsca (domyślnie Uniwersytet DSW Ideis, ul. Strzegomska 55, Wrocław; przyjazd na 9:00 w dzień roboczy): czas, „bez przesiadek” albo „potrzebna przesiadka”, numery tramwajów / autobusów / pociągów, przystanki i godzina wyjścia z domu. Plus link do tej trasy w Google Maps.

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

Jest też **🚩 czerwona flaga przy prowizji biura** (gdy opis mówi, że biuro pobiera prowizję; „🚩 Prowizja?” gdy ogłoszenie jest sprzeczne, np. tytuł „bez prowizji”, a opis „pobieramy prowizję”), **limit miesięczny** (np. 4000 zł) — ogłoszenia droższe po zsumowaniu wszystkich opłat mają czerwoną plakietkę zamiast zielonej — oraz liczba osób (dla opłat „za osobę”).

## Jak to działa

- Dane ogłoszenia (cena, pole „czynsz”, kaucja, opis) wtyczka pobiera w tle: z Otodom z danych strony, z OLX z ich API. Pobrane ogłoszenia pamięta przez 6 godzin.
- Opis analizuje `src/parser.js` — rozpoznaje kwoty („250 zł”, „1 100 PLN”, „150-200 zł”) i dopasowuje je do kategorii po słowach obok („Prąd: 200 zł”, „300 zł – miejsce postojowe”, „możliwość wynajęcia garażu za 250 zł”…).
- Wszystko działa bez kont, kluczy i bez AI. Poza Otodom/OLX wtyczka łączy się tylko z planerem tras Transitous (wysyła wyłącznie współrzędne mieszkania i celu, żeby policzyć dojazd).

### Dojazd komunikacją — Transitous

Trasy liczy [Transitous](https://transitous.org/) — darmowy, społecznościowy planer podróży dla projektów open-source (silnik [MOTIS](https://github.com/motis-project/motis)). Dane: rozkłady MPK Wrocław, Kolei Dolnośląskich i innych przewoźników oraz mapa © [współtwórcy OpenStreetMap](https://www.openstreetmap.org/copyright) — pełna lista źródeł: <https://transitous.org/sources/>.

Zgodnie z [zasadami Transitous](https://transitous.org/api/) wtyczka:
- przedstawia się nagłówkiem `User-Agent: 4Rent/… (+https://github.com/mrufka-szpontmaszyna/pelny-czynsz)` (reguła `rules.json`),
- liczy trasę tylko wtedy, gdy otworzysz rozpiskę ogłoszenia, i zapamiętuje wynik na 7 dni (mało zapytań),
- jest niekomercyjna i open-source (licencja MIT).

Kontakt w sprawie wtyczki: [zgłoszenia na GitHubie](https://github.com/mrufka-szpontmaszyna/pelny-czynsz/issues).

Analiza tekstu to heurystyka — przy nietypowych opisach może się pomylić. Dlatego każda kwota ma podgląd źródła i ptaszek do odznaczenia.

## Dla dewelopera

- `src/parser.js` — analiza opisu i liczenie sumy (czysty JS),
- `src/content.js` — plakietki, okienko, ramka, mapa (w Shadow DOM, odporne na style strony),
- `src/styles.js` — style interfejsu, `src/content.css` — tylko opakowania elementów,
- `src/background.js` — pobieranie danych ogłoszeń (pomija ogłoszenia sprzedaży) i tras (Transitous),
- `rules.json` — nagłówek User-Agent dla Transitous,
- `src/mainworld.js` — na mapie Otodom zapisuje na pinezkach prawdziwy adres ogłoszenia,
- `options.html` / `options.js` — ustawienia,
- `test/parser.test.js` — testy: `deno test test/`,
- `tools/probe.js` — sprawdza parser na żywych ogłoszeniach: `deno run --allow-net tools/probe.js otodom`,
- `tools/devserver.js` — podgląd wtyczki na kopii strony bez instalowania: `deno run -A tools/devserver.js`, potem `http://localhost:8765/page?url=<adres listy>`.

## Licencja

MIT — zobacz [LICENSE](LICENSE).
