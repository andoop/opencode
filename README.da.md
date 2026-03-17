<p align="center">
  <a href="https://opencode.ai">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="OpenCode logo">
    </picture>
  </a>
</p>
<p align="center">Tilpasset intern AI R&D-samarbejdswebplatform baseret på OpenCode.</p>
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

## Projektpositionering

Dette repository beskriver ikke et generisk desktop AI-kodningsværktøj, men en intern web AI R&D-platform tilpasset baseret på OpenCode.

- Det er et **Web-first** internt produkt; den nuværende tilpasningsfokus er Web App
- Det tjener **multi-bruger-samarbejde** i organisationen, ikke enkeltudvikler-brug lokalt
- Det tillader ikke at forbinde frit til servermapper; brugere arbejder inden for **admin-kontrollerede projektgrænser**
- Det leverer **forenet AI-platform-kapaciteter**, ikke blot en "chat med AI for at redigere kode"-side

Forstå det som:

> En kontrolleret, styrebar, multi-bruger AI R&D-arbejdsbænk til intern brug.

## Vores filosofi

Platformen sigter mod at blive en forenet intern AI R&D-samarbejdsplatform, ikke blot en AI-kodningsside.

Kerneprincipper:

- **Ikke fjernskrivebord, men en AI-arbejdsbænk inden for kontrollerede projekter**
- **Ikke for få udviklere der monopoliserer AI, men for flere roller der deltager i softwareproduktion inden for deres autoriserede omfang**
- **Ikke AI der kun svarer på spørgsmål, men AI der gradvist bliver udførelseslaget i R&D-workflowet**
- **Ikke at fjerne grænser, men effektivitet under governance af tilladelser, projekter, sessioner og modeller**

I produktdesign er de tre vigtigste grænser:

- **Projektgrænse**: normale brugere kan kun tilgå projekter førregistreret af admins
- **Sessiongrænse**: én opgave svarer til én uafhængig session og ét uafhængigt arbejdsområde
- **Tilladelsesgrænse**: hvad brugere ser, hvad de kan gøre og hvilke modeller de kan bruge styres af platformen

## Nuværende kernekapaciteter

Tilpasningen fokuserer på Web App:

- Multi-bruger-registrering, login og kontostyring
- Admin-synlige bruger-, projekt-, model- og audit-kapaciteter
- Projektregistrering for kun at eksponere godkendte kode-repositoryer
- Session-baserede isolerede arbejdsområder, typisk via Git worktrees
- Forenet governance af modeller, providere, tilladelser og tilstande
- Forenet AI-platform-indgangspunkt for teams

Fokus er ikke på desktop eller TUI, men på:

> At lade interne brugere fuldføre Q&A, analyse, redigering, udførelse og samarbejde via web, inden for kontrollerede projekter.

## Multi-bruger og forenet AI-platform

Platformen giver ikke fuld adgang til alle der logger ind. I stedet:

1. Admins forbereder projektkode på serveren
2. Admins registrerer tilladte mapper som projekter
3. Brugere registrerer sig og logger ind via web
4. Normale brugere ser kun projekter der er åbnet for dem
5. Brugere starter arbejde i sessioner efter at være gået ind i et projekt

Den forenede AI-platform leverer:

- Forenet model-indgangspunkt
- Forenet provider-styring
- Forenet tilladelseskontrol
- Forenet session-workflow
- Forenede audit- og governance-grænser

Dette design understøtter gradvis intern rollout: start med lav-risiko-tilladelser, udvid derefter efter rolle og scenario.

## Cursor CLI-understøttelse

Platformen understøtter **Cursor CLI** som model/provider-kilde i den forenede AI-platform.

### Sådan forbinder du

Server-maskinen skal have Cursor CLI installeret og kommandoen `agent` tilgængelig i shell:

```bash
agent login
```

Efter login genbruger platformen den eksisterende lokale Cursor-login-status.

### Brug i platformen

- Admins styrer om brugere kan tilgå model- og provider-indstillinger
- Standard-begrænsede brugere har typisk kun `ask`-tilstand
- Standard model-whitelist inkluderer typisk:
  - `cursor-cli/auto`
  - `cursor-cli/composer-1`
  - `cursor-cli/composer-1.5`

Hvis Cursor CLI ikke er installeret eller `agent` ikke er tilgængelig, vises Cursor CLI-relationerede modeller og providere ikke i platformen.

### Konfigurationsanbefalinger

For indledende intern rollout:

- Standard begrænsede brugere: kun `ask`-tilstand
- Standard model-whitelist: foretræk cursor-cli-modeller
- Eksponer ikke Provider, Server, MCP eller anden høj-risiko-styring som standard
- Lad admins udvide kapaciteter per bruger eller rolle efter behov

Fordele:

- Lav onboarding-omkostning
- Klare risikogrænser
- Forenet modelkilde
- Simpel UX til intern adoption

### Rolle i systemet

Med Cursor CLI forbundet kalder platformen ikke blot en ekstern model-API. Den samler session-kontekst, projektgrænser og platformværktøjer og overgiver dem til Cursor CLI til udførelse.

Så `cursor-cli` er ikke et isoleret værktøj her, men en del af den forenede AI-platform.

## Admin-anbefalinger til rollout

Anbefalet tilgang:

1. Forbered kontrollerede projektmapper
2. Registrer kun eksplicit godkendte repositoryer
3. Giv normale brugere begrænsede tilladelser som standard
4. Prioriter web Q&A og lav-risiko-kapaciteter
5. Tilføj gradvist flere modeller, tilstande og workflow-funktioner

Kort sagt: aktiver ikke alt på én gang. I stedet:

> Etabler først projekt-, tilladelses-, model- og sessiongrænser, udvid derefter platformkapaciteter trin for trin.

## Lokal udvikling

Tilpasningsfokus er Web App, så lokal udvikling bør starte web-stacken.

Installér afhængigheder:

```bash
bun install
```

Én-kommando-start:

```bash
sh restart-services.sh
```

Standard-URL'er:

- Backend: `http://localhost:4096`
- Frontend: `http://localhost:3000`

For at starte separat:

```bash
bun run --cwd packages/opencode dev
bun run --cwd packages/app dev
```

## Relateret dokumentation

- `docs/internal-web-user-manual.md`
  - Brugervejledning for admins og normale brugere
- `docs/internal-ai-platform-vision.md`
  - Produktvision og fremtidig retning for teamet

Disse dokumenter er mere detaljerede og tættere på de faktiske mål for dette tilpassede produkt.

---

**Nuværende fokus**: Web App, multi-bruger, forenet AI-platform, kontrolleret projektsamarbejde.
