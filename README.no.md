<p align="center">
  <a href="https://opencode.ai">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="OpenCode logo">
    </picture>
  </a>
</p>
<p align="center">Tilpasset intern AI R&D-samarbeidswebplattform basert på OpenCode.</p>
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

## Prosjektposisjonering

Dette repositoriet beskriver ikke et generisk desktop AI-kodingsverktøy, men en intern web AI R&D-plattform tilpasset basert på OpenCode.

- Det er et **Web-first** internt produkt; den nåværende tilpasningsfokus er Web App
- Det tjener **flerbruker-samarbeid** i organisasjonen, ikke enkeltutvikler-bruk lokalt
- Det tillater ikke å koble fritt til servermapper; brukere arbeider innenfor **admin-kontrollerte prosjektgrenser**
- Det leverer **forenet AI-plattform-kapasiteter**, ikke bare en «chat med AI for å redigere kode»-side

Forstå det som:

> En kontrollert, styrebar, flerbruker AI R&D-arbeidsbenk for intern bruk.

## Vår filosofi

Plattformen sikter mot å bli en forenet intern AI R&D-samarbeidsplattform, ikke bare en AI-kodingsside.

Kjerneprinsipper:

- **Ikke fjernskrivebord, men en AI-arbeidsbenk innenfor kontrollerte prosjekter**
- **Ikke for få utviklere som monopoliserer AI, men for flere roller som deltar i programvareproduksjon innenfor sitt autoriserte omfang**
- **Ikke AI som bare svarer på spørsmål, men AI som gradvis blir utførelseslaget i R&D-workflowet**
- **Ikke å fjerne grenser, men effektivitet under governance av tillatelser, prosjekter, økter og modeller**

I produktdesign er de tre viktigste grensene:

- **Prosjektgrense**: vanlige brukere kan bare få tilgang til prosjekter forhåndsregistrert av admins
- **Øktgrense**: én oppgave tilsvarer én uavhengig økt og ett uavhengig arbeidsområde
- **Tillatelsesgrense**: hva brukere ser, hva de kan gjøre og hvilke modeller de kan bruke styres av plattformen

## Nåværende kjernepasiteter

Tilpasningen fokuserer på Web App:

- Flerbruker-registrering, innlogging og kontostyring
- Admin-synlige bruker-, prosjekt-, modell- og revisjonskapasiteter
- Prosjektregistrering for kun å eksponere godkjente kode-repositorier
- Økt-baserte isolerte arbeidsområder, typisk via Git worktrees
- Forenet governance av modeller, providere, tillatelser og moduser
- Forenet AI-plattform-inngangspunkt for team

Fokus er ikke på desktop eller TUI, men på:

> Å la interne brukere fullføre Q&A, analyse, redigering, utførelse og samarbeid via web, innenfor kontrollerte prosjekter.

## Flerbruker og forenet AI-plattform

Plattformen gir ikke full tilgang til alle som logger inn. I stedet:

1. Admins forbereder prosjektkode på serveren
2. Admins registrerer tillatte mapper som prosjekter
3. Brukere registrerer seg og logger inn via web
4. Vanlige brukere ser bare prosjekter som er åpnet for dem
5. Brukere starter arbeid i økter etter å ha gått inn i et prosjekt

Den forenede AI-plattformen leverer:

- Forenet modell-inngangspunkt
- Forenet provider-styring
- Forenet tillatelseskontroll
- Forenet økt-workflow
- Forenede revisjons- og governance-grenser

Dette designet støtter gradvis intern utrulling: start med lav-risiko-tillatelser, utvid deretter etter rolle og scenario.

## Cursor CLI-støtte

Plattformen støtter **Cursor CLI** som modell/provider-kilde i den forenede AI-plattformen.

### Slik kobler du til

Server-maskinen må ha Cursor CLI installert og kommandoen `agent` tilgjengelig i shell:

```bash
agent login
```

Etter innlogging gjenbruker plattformen den eksisterende lokale Cursor-innloggingsstatusen.

### Bruk i plattformen

- Admins styrer om brukere kan få tilgang til modell- og provider-innstillinger
- Standard-begrensede brukere har typisk bare `ask`-modus
- Standard modell-whitelist inkluderer typisk:
  - `cursor-cli/auto`
  - `cursor-cli/composer-1`
  - `cursor-cli/composer-1.5`

Hvis Cursor CLI ikke er installert eller `agent` ikke er tilgjengelig, vises ikke Cursor CLI-relaterte modeller og providere i plattformen.

### Konfigurasjonsanbefalinger

For innledende intern utrulling:

- Standard begrensede brukere: bare `ask`-modus
- Standard modell-whitelist: foretrekk cursor-cli-modeller
- Ikke eksponer Provider, Server, MCP eller annen høy-risiko-styring som standard
- La admins utvide kapasiteter per bruker eller rolle etter behov

Fordeler:

- Lav onboarding-kostnad
- Klare risikogrenser
- Forenet modellkilde
- Enkel UX for intern adopsjon

### Rolle i systemet

Med Cursor CLI koblet til kaller ikke plattformen bare en ekstern modell-API. Den samler økt-kontekst, prosjektgrenser og plattformverktøy og overgir dem til Cursor CLI for utførelse.

Så `cursor-cli` er ikke et isolert verktøy her, men en del av den forenede AI-plattformen.

## Admin-anbefalinger for utrulling

Anbefalt tilnærming:

1. Forbered kontrollerte prosjektmapper
2. Registrer bare eksplisitt godkjente repositorier
3. Gi vanlige brukere begrensede tillatelser som standard
4. Prioriter web Q&A og lav-risiko-kapasiteter
5. Legg til gradvis flere modeller, moduser og workflow-funksjoner

Kort sagt: aktiver ikke alt på én gang. I stedet:

> Etabler først prosjekt-, tillatelses-, modell- og øktgrenser, utvid deretter plattformkapasiteter trinn for trinn.

## Lokal utvikling

Tilpasningsfokus er Web App, så lokal utvikling bør starte web-stacken.

Installer avhengigheter:

```bash
bun install
```

Én-kommando-start:

```bash
sh restart-services.sh
```

Standard-URL-er:

- Backend: `http://localhost:4096`
- Frontend: `http://localhost:3000`

For å starte separat:

```bash
bun run --cwd packages/opencode dev
bun run --cwd packages/app dev
```

## Relatert dokumentasjon

- `docs/internal-web-user-manual.md`
  - Brukerveiledning for admins og vanlige brukere
- `docs/internal-ai-platform-vision.md`
  - Produktvisjon og fremtidig retning for teamet

Disse dokumentene er mer detaljerte og nærmere de faktiske målene for dette tilpassede produktet.

---

**Nåværende fokus**: Web App, flerbruker, forenet AI-plattform, kontrollert prosjektsamarbeid.
