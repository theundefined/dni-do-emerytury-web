# Dni do emerytury — wersja web

Statyczna strona pokazująca, ile zostało do emerytury: dni kalendarzowych, dni i godzin
roboczych (z pominięciem weekendów i polskich świąt ustawowych), a także jaki procent
okresu pracy masz już za sobą. Odpowiednik narzędzia CLI
[dni-do-emerytury](https://github.com/theundefined/dni-do-emerytury).

## Przechowywanie danych

Konfiguracja (data urodzenia, data rozpoczęcia pracy, płeć, wiek emerytalny, godziny pracy
od–do, domyślnie pn–pt 9:00–17:00) jest zapisywana wyłącznie w `localStorage` przeglądarki pod kluczem
`dni-do-emerytury:config`. Nic nie jest wysyłane na serwer, nie są używane ciasteczka.
Dane można usunąć przyciskiem „Usuń zapisane dane” na dole strony.

## Uruchomienie lokalne

Wystarczy otworzyć `index.html` w przeglądarce albo uruchomić prosty serwer:

```bash
python3 -m http.server 8000
```

## Testy

Logika obliczeń (`calc.js`) jest testowana w Node (bez zależności):

```bash
node --test
```

Lista świąt jest porównywana z biblioteką Pythona `holidays` (plik
`tests/pl_holidays_2000_2070.json`), a liczba dni roboczych — z funkcją
`calculate_working_days` z wersji CLI.

## Wdrożenie na GitHub Pages

Workflow `.github/workflows/pages.yml` uruchamia testy i publikuje stronę przy każdym
pushu do gałęzi `main`. W ustawieniach repozytorium: **Settings → Pages → Source:
GitHub Actions**.

## Licencja

MIT
