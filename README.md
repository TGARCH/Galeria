# Galeria

Wirtualna galeria rysunków (three.js). Każdy plik graficzny wrzucony do folderu na Dysku Google
pojawia się w ramie na ścianie — sale dobudowują się same, gdy przybywa prac.

## Jak to działa

- `api/drawings.js` — lista obrazów z folderu Dysku (Google Drive API, cache CDN 60 s)
- `api/image.js` — serwuje obraz w zadanej rozdzielczości z tej samej domeny (WebGL wymaga CORS)
- `src/gallery.js` — generator sal, ramy z passe-partout, etykiety, doczytywanie tekstur
- `src/main.js` — spacer (WASD + mysz, joystick na telefonie), kolizje ze ścianami, powiększenie
- `src/config.js` — tytuł, wymiary sal, wygląd ram

**Sale = podfoldery.** Każdy podfolder folderu galerii to osobna sala, nazwa folderu to nazwa sali
(na ścianie z przejściem do następnej sali: obok drzwi napis „Następna sala”, dalej duża nazwa bieżącej sali w miejscu jednej pracy; także w rogu ekranu). Kolejność: numer na początku nazwy (`1 Grupa wtorkowa`,
numer nie jest wyświetlany), potem alfabetycznie. Pliki luzem w folderze głównym tworzą pierwszą salę.
Puste foldery są pomijane.

Układ sali: przejścia blisko środka ścian (do ±3 m), na przemian przesunięte, żeby nie wypadały naprzeciw siebie. Mała sala (do 14 prac) ma same ściany;
większa dostaje ścianki wolnostojące parami (po jednej w każdej połowie sali) i rośnie symetrycznie w głąb.
Rysunki rozkładają się równomiernie po wszystkich miejscach sali.
Przy 4 i więcej ściankach ustawiają się na przemian wzdłuż i w poprzek.

W sali rysunki układają się chronologicznie (data dodania na Dysk): nowe dochodzą na końcu, starsze nie zmieniają miejsc.
Tytuł bierze się z nazwy pliku; nazwy ze skanera (`20261022161541_001.jpg`) pokazują tylko datę.

## Spacer automatyczny (targi, prezentacje)

Przycisk „Spacer automatyczny” na ekranie startowym albo adres z `?spacer`
(np. `https://galeria-tg.vercel.app/?spacer`) — kamera sama chodzi od pracy do pracy
(sala po sali, omija ścianki), przy każdej zatrzymuje się ok. 4,5 s z podpisem, po ostatniej
wraca płynnie na początek. Ruch myszą, klawisz lub dotyk przerywa spacer; z `?spacer`
wraca on sam po minucie bezczynności. Parametry: `src/tour.js` (tempo, czas oglądania).

## Prawa autorskie

Powiększenie rysunku (i plik z niego zapisany) ma stopkę „© rok Właściciel. Wszelkie prawa zastrzeżone.”
oraz informację o prawach w metadanych pliku (EXIF). Obrazy na ścianach galerii są bez stopki.

## Studio — rolki do social mediów (tylko dla właściciela)

Wejście raz przez `https://<adres galerii>/?studio=KLUCZ` (KLUCZ = wartość `STUDIO_KEY`)
zapamiętuje dostęp w przeglądarce na 90 dni; pojawia się przycisk „Studio”. Scenariusze:
„Nowa praca”, „Przegląd sali”, „Zaproszenie do galerii”; formaty 9:16, 4:5, 16:9.
Film renderuje się klatka po klatce (30 kl./s, H.264 MP4) — zawsze płynny, niezależnie od
komputera; najlepiej w Chrome lub Edge. Odwiedzający bez klucza nie widzą niczego.
Panel krok po kroku: format → rodzaj (Nowe prace, Prezentacja sali, Spacer po galerii,
Zdjęcia do postów) → sale → prace (miniatury). Filmy to spacer jak w trybie automatycznym.
„Zdjęcia do postów”: każda wybrana praca w 3 ujęciach (z bliska, z dystansu, z 5 m), bez napisów,
JPG 4:5 / 1:1 / 1,91:1, do pobrania pojedynczo lub w ZIP-ie.
Przy filmie 16:9 Studio przygotowuje też pakiet YouTube: 2 miniatury 1280×720 (kolaż i sala) oraz zwiastun ok. 10–15 s.

## Zmienne środowiskowe (Vercel)

| Nazwa | Wartość |
|---|---|
| `GOOGLE_API_KEY` | klucz Google API z włączonym Google Drive API |
| `DRIVE_FOLDER_ID` | ID folderu (folder udostępniony: „Każdy, kto ma link → Przeglądający”) |
| `GALLERY_TITLE` | tytuł galerii (opcjonalnie, domyślnie z `src/config.js`) |
| `GALLERY_SUBTITLE` | podtytuł, np. „Rysunki” albo „Prace z kursu” (opcjonalnie) |
| `COPYRIGHT_HOLDER` | właściciel praw w stopce powiększenia (opcjonalnie; domyślnie `GALLERY_TITLE`) |
| `STUDIO_KEY` | tajne hasło do Studia (opcjonalnie; bez niego Studio jest wyłączone) |

## Kilka galerii z jednego kodu

Każda galeria to osobny projekt Vercel podłączony do tego samego repozytorium, z własnymi
zmiennymi `DRIVE_FOLDER_ID`, `GALLERY_TITLE`, `GALLERY_SUBTITLE` (i `GOOGLE_API_KEY`).
Push na `main` wdraża zmiany we wszystkich galeriach naraz.

## Lokalnie

```bash
npm install
npm run dev        # http://localhost:5173/?demo=30  — podgląd ze szkicami demonstracyjnymi
```
