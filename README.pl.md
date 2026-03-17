<p align="center">
  <a href="https://opencode.ai">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="OpenCode logo">
    </picture>
  </a>
</p>
<p align="center">Dostosowana wewnętrzna platforma webowa AI R&D oparta na OpenCode.</p>
<p align="center">
  <a href="https://opencode.ai/discord"><img alt="Discord" src="https://img.shields.io/discord/1391832426048651334?style=flat-square&label=discord" /></a>
  <a href="https://www.npmjs.com/package/opencode-ai"><img alt="npm" src="https://img.shields.io/npm/v/opencode-ai?style=flat-square" /></a>
  <a href="https://github.com/anomalyco/opencode/actions/workflows/publish.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/anomalyco/opencode/publish.yml?style=flat-square&branch=dev" /></a>
</p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.zh.md">简体中文</a> |
  <a href="README.zht.md">繁體中文</a> |
  <a href="README.ko.md">한국어</a> |
  <a href="README.de.md">Deutsch</a> |
  <a href="README.es.md">Español</a> |
  <a href="README.fr.md">Français</a> |
  <a href="README.it.md">Italiano</a> |
  <a href="README.da.md">Dansk</a> |
  <a href="README.ja.md">日本語</a> |
  <a href="README.pl.md">Polski</a> |
  <a href="README.ru.md">Русский</a> |
  <a href="README.ar.md">العربية</a> |
  <a href="README.no.md">Norsk</a> |
  <a href="README.br.md">Português (Brasil)</a> |
  <a href="README.th.md">ไทย</a> |
  <a href="README.tr.md">Türkçe</a>
</p>

[![OpenCode Terminal UI](packages/web/src/assets/lander/screenshot.png)](https://opencode.ai)

---

## Pozycjonowanie projektu

To repozytorium nie opisuje generycznego narzędzia deweloperskiego AI na desktop, lecz wewnętrzną platformę webową AI R&D dostosowaną na podstawie OpenCode.

- To produkt wewnętrzny **Web-first**; obecny nacisk dostosowań to aplikacja webowa
- Służy **współpracy wieloużytkownikowej** w organizacji, nie lokalnemu użyciu przez pojedynczego dewelopera
- Nie pozwala na dowolne łączenie z katalogami serwera; użytkownicy pracują w ramach **granic projektów kontrolowanych przez administratora**
- Dostarcza **zunifikowane możliwości platformy AI**, nie tylko stronę „czat z AI do edycji kodu”

Można to rozumieć jako:

> Kontrolowaną, zarządzalną, wieloużytkownikową stanowisko pracy AI R&D do użytku wewnętrznego.

## Nasza filozofia

Platforma ma na celu stać się zunifikowaną wewnętrzną platformą współpracy AI R&D, nie tylko stroną AI do kodowania.

Kluczowe zasady:

- **Nie zdalny pulpit, lecz stanowisko pracy AI w ramach kontrolowanych projektów**
- **Nie dla garstki deweloperów monopolizujących AI, lecz dla większej liczby ról uczestniczących w produkcji oprogramowania w ramach autoryzowanego zakresu**
- **Nie AI odpowiadające tylko na pytania, lecz AI stopniowo stające się warstwą wykonawczą w przepływie R&D**
- **Nie usuwanie granic, lecz poprawa efektywności pod zarządzaniem uprawnieniami, projektami, sesjami i modelami**

W projektowaniu produktu trzy najważniejsze granice to:

- **Granica projektu**: zwykli użytkownicy mogą uzyskać dostęp tylko do projektów wcześniej zarejestrowanych przez administratorów
- **Granica sesji**: jedno zadanie odpowiada jednej niezależnej sesji i jednej niezależnej przestrzeni roboczej
- **Granica uprawnień**: co użytkownicy widzą, co mogą robić i z jakich modeli korzystać – kontroluje platforma

## Obecne kluczowe możliwości

Dostosowanie koncentruje się na aplikacji webowej:

- Rejestracja wieloużytkownikowa, logowanie i zarządzanie kontami
- Możliwości użytkowników, projektów, modeli i audytu widoczne dla administratorów
- Rejestracja projektów, aby udostępniać tylko zatwierdzone repozytoria kodu
- Izolowane przestrzenie robocze na sesję, typowo przez Git worktrees
- Zunifikowane zarządzanie modelami, dostawcami, uprawnieniami i trybami
- Zunifikowany punkt wejścia do platformy AI dla zespołów

Skupienie nie jest na desktopie ani TUI, lecz na:

> Umożliwieniu użytkownikom wewnętrznym wykonywania Q&A, analizy, edycji, wykonania i współpracy przez web, w ramach kontrolowanych projektów.

## Wieloużytkownikowość i zunifikowana platforma AI

Platforma nie przyznaje pełnego dostępu każdemu, kto się zaloguje. Zamiast tego:

1. Administratorzy przygotowują kod projektu na serwerze
2. Administratorzy rejestrują dozwolone katalogi jako projekty
3. Użytkownicy rejestrują się i logują przez web
4. Zwykli użytkownicy widzą tylko projekty, które zostały im udostępnione
5. Użytkownicy rozpoczynają pracę w sesjach po wejściu do projektu

Zunifikowana platforma AI oferuje:

- Zunifikowany punkt wejścia modeli
- Zunifikowane zarządzanie dostawcami
- Zunifikowaną kontrolę uprawnień
- Zunifikowany przepływ pracy sesji
- Zunifikowane granice audytu i zarządzania

Ten projekt wspiera stopniowe wdrożenie wewnętrzne: zacząć od uprawnień niskiego ryzyka, potem rozszerzać według roli i scenariusza.

## Obsługa Cursor CLI

Platforma obsługuje **Cursor CLI** jako źródło modelu/dostawcy w zunifikowanej platformie AI.

### Jak połączyć

Na maszynie serwera musi być zainstalowane Cursor CLI, a polecenie `agent` musi być dostępne w shellu:

```bash
agent login
```

Po zalogowaniu platforma ponownie wykorzystuje istniejący lokalny stan logowania Cursor.

### Użycie w platformie

- Administratorzy kontrolują, czy użytkownicy mogą uzyskać dostęp do modeli i dostawców
- Użytkownicy z ograniczeniami domyślnymi mają zazwyczaj tylko tryb `ask`
- Domyślna białe lista modeli zazwyczaj obejmuje:
  - `cursor-cli/auto`
  - `cursor-cli/composer-1`
  - `cursor-cli/composer-1.5`

Jeśli Cursor CLI nie jest zainstalowane lub `agent` nie jest dostępne, modele i dostawcy Cursor CLI nie pojawią się na platformie.

### Zalecenia konfiguracyjne

Dla początkowego wdrożenia wewnętrznego:

- Użytkownicy z ograniczeniami domyślnymi: tylko tryb `ask`
- Domyślna białe lista modeli: preferuj modele `cursor-cli`
- Nie udostępniaj domyślnie Provider, Server, MCP ani innego zarządzania wysokiego ryzyka
- Pozwól administratorom rozszerzać możliwości po użytkowniku lub roli według potrzeb

Korzyści:

- Niski koszt wdrożenia
- Jasne granice ryzyka
- Zunifikowane źródło modeli
- Prosta UX dla adopcji wewnętrznej

### Rola w systemie

Z połączonym Cursor CLI platforma nie wywołuje po prostu zewnętrznego API modelu. Zbiera kontekst sesji, granice projektu i narzędzia platformy, a następnie przekazuje je do Cursor CLI do wykonania.

Więc `cursor-cli` nie jest tu izolowanym narzędziem, lecz częścią zunifikowanej platformy AI.

## Zalecenia wdrożenia dla administratorów

Zalecane podejście:

1. Przygotuj kontrolowane katalogi projektów
2. Rejestruj tylko jawnie zatwierdzone repozytoria
3. Nadaj zwykłym użytkownikom domyślnie ograniczone uprawnienia
4. Priorytetyzuj web Q&A i możliwości niskiego ryzyka
5. Stopniowo dodawaj więcej modeli, trybów i funkcji przepływu pracy

Krótko: nie włączaj wszystkiego naraz. Zamiast tego:

> Najpierw ustal granice projektów, uprawnień, modeli i sesji, potem rozszerzaj możliwości platformy krok po kroku.

## Rozwój lokalny

Dostosowanie koncentruje się na aplikacji webowej, więc rozwój lokalny powinien uruchamiać stos webowy.

Instalacja zależności:

```bash
bun install
```

Uruchomienie jedną komendą:

```bash
sh restart-services.sh
```

Domyślne adresy URL:

- Backend: `http://localhost:4096`
- Frontend: `http://localhost:3000`

Aby uruchomić osobno:

```bash
bun run --cwd packages/opencode dev
bun run --cwd packages/app dev
```

## Powiązana dokumentacja

- `docs/internal-web-user-manual.md`
  - Przewodnik użytkownika dla administratorów i zwykłych użytkowników
- `docs/internal-ai-platform-vision.md`
  - Wizja produktu i kierunek przyszły dla zespołu

Te dokumenty są bardziej szczegółowe i bliższe rzeczywistym celom tego dostosowanego produktu.

---

**Obecny nacisk**: aplikacja webowa, wieloużytkownikowość, zunifikowana platforma AI, kontrolowana współpraca projektowa.
