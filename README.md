# Galeria

Wirtualna galeria rysunków (three.js). Każdy plik graficzny wrzucony do folderu na Dysku Google
pojawia się w ramie na ścianie — sale dobudowują się same, gdy przybywa prac.

## Jak to działa

- `api/drawings.js` — lista obrazów z folderu Dysku (Google Drive API, cache CDN 60 s)
- `api/image.js` — serwuje obraz w zadanej rozdzielczości z tej samej domeny (WebGL wymaga CORS)
- `src/gallery.js` — generator sal, ramy z passe-partout, etykiety, doczytywanie tekstur
- `src/main.js` — spacer (WASD + mysz, joystick na telefonie), kolizje ze ścianami, powiększenie
- `src/config.js` — tytuł, wymiary sal, wygląd ram

Rysunki układają się chronologicznie (data dodania na Dysk): nowe dochodzą na końcu, starsze nie zmieniają miejsc.
Tytuł bierze się z nazwy pliku; nazwy ze skanera (`20261022161541_001.jpg`) pokazują tylko datę.

## Zmienne środowiskowe (Vercel)

| Nazwa | Wartość |
|---|---|
| `GOOGLE_API_KEY` | klucz Google API z włączonym Google Drive API |
| `DRIVE_FOLDER_ID` | ID folderu (folder udostępniony: „Każdy, kto ma link → Przeglądający”) |

## Lokalnie

```bash
npm install
npm run dev        # http://localhost:5173/?demo=30  — podgląd ze szkicami demonstracyjnymi
```
