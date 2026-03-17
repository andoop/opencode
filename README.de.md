<p align="center">
  <a href="https://opencode.ai">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="OpenCode logo">
    </picture>
  </a>
</p>
<p align="center">Auf OpenCode basierende, angepasste interne AI R&D-Webplattform für Zusammenarbeit.</p>
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

## Projektpositionierung

Dieses Repository beschreibt kein generisches Desktop-AI-Coding-Tool, sondern eine interne Web-AI-R&D-Plattform, die auf OpenCode angepasst wurde.

- Es ist ein **Web-first** internes Produkt; der aktuelle Anpassungsschwerpunkt ist die Web-App
- Es dient der **Multi-User-Zusammenarbeit** im Unternehmen, nicht dem lokalen Einzelentwickler-Einsatz
- Es geht nicht darum, Nutzer beliebig mit Serververzeichnissen zu verbinden, sondern darum, dass Nutzer AI innerhalb **vom Admin vordefinierter Projektgrenzen** nutzen
- Es bietet **einheitliche AI-Plattform-Funktionen**, nicht nur eine „Chat mit AI zum Codebearbeiten“-Seite

Man kann es verstehen als:

> Eine kontrollierte, steuerbare, multi-user-fähige AI-R&D-Workbench für den internen Einsatz.

## Unsere Philosophie

Die Plattform will nicht nur eine AI-Coding-Seite sein, sondern schrittweise zu einer einheitlichen internen AI-R&D-Kollaborationsplattform werden.

Kernprinzipien:

- **Kein Remote-Desktop, sondern eine AI-Workbench innerhalb kontrollierter Projekte**
- **Nicht wenige Entwickler sollen AI exklusiv nutzen, sondern mehr Rollen sollen innerhalb ihrer Berechtigungen an der Softwareproduktion teilnehmen**
- **AI soll nicht nur Fragen beantworten, sondern schrittweise zur Ausführungsschicht im R&D-Workflow werden**
- **Keine offenen Grenzen, sondern Effizienzsteigerung unter Governance von Berechtigungen, Projekten, Sessions und Modellen**

In der Produktgestaltung sind die drei wichtigsten Grenzen:

- **Projektgrenze**: Normale Nutzer können nur von Admins vorregistrierte Projekte betreten
- **Sessiongrenze**: Eine Aufgabe entspricht einer eigenständigen Session und einem eigenständigen Workspace
- **Berechtigungsgrenze**: Was Nutzer sehen, tun und welche Modelle sie nutzen können, steuert die Plattform

## Aktuelle Kernfunktionen

Die Anpassung konzentriert sich auf die Web-App:

- Multi-User-Registrierung, Login und Kontoverwaltung
- Admin-sichtbare Nutzer-, Projekt-, Modell- und Audit-Funktionen
- Projektregistrierung, sodass nur genehmigte Code-Repositories freigegeben werden
- Session-basierte isolierte Workspaces, typischerweise über Git-Worktrees
- Einheitliche Steuerung von Modellen, Providern, Berechtigungen und Modi
- Einheitlicher AI-Plattform-Einstiegspunkt für Teams

Der Fokus liegt nicht auf Desktop oder TUI, sondern auf:

> Internen Nutzern ermöglichen, per Web Q&A, Analyse, Bearbeitung, Ausführung und Zusammenarbeit in kontrollierten Projekten durchzuführen.

## Multi-User und einheitliche AI-Plattform

Die Plattform gewährt nicht jedem, der sich einloggt, vollen Zugriff. Stattdessen:

1. Admins bereiten Projektcode auf dem Server vor
2. Admins registrieren erlaubte Verzeichnisse als Projekte
3. Nutzer registrieren sich und loggen sich per Web ein
4. Normale Nutzer sehen nur für sie freigegebene Projekte
5. Nutzer starten die Arbeit in Sessions nach dem Betreten eines Projekts

Die einheitliche AI-Plattform bietet:

- Einheitlichen Modell-Einstiegspunkt
- Einheitliche Provider-Verwaltung
- Einheitliche Berechtigungssteuerung
- Einheitlichen Session-Workflow
- Einheitliche Audit- und Governance-Grenzen

Dieses Design unterstützt schrittweise interne Einführung: zuerst mit geringem Risiko, dann schrittweise Erweiterung nach Rolle und Szenario.

## Cursor CLI-Unterstützung

Die Plattform unterstützt **Cursor CLI** als Modell-/Provider-Quelle in der einheitlichen AI-Plattform.

### Anbindung

Auf dem Server muss Cursor CLI installiert sein und der Befehl `agent` in der Shell verfügbar sein:

```bash
agent login
```

Nach dem Login nutzt die Plattform den bestehenden lokalen Cursor-Login-Status.

### Nutzung in der Plattform

- Admins steuern, ob Nutzer Modell- und Provider-Einstellungen nutzen können
- Standardmäßig eingeschränkte Nutzer haben typischerweise nur den `ask`-Modus
- Die Standard-Modell-Whitelist umfasst meist:
  - `cursor-cli/auto`
  - `cursor-cli/composer-1`
  - `cursor-cli/composer-1.5`

Wenn Cursor CLI nicht installiert ist oder `agent` nicht verfügbar ist, erscheinen Cursor-CLI-Modelle und -Provider nicht in der Plattform.

### Konfigurationsempfehlungen

Für die erste interne Einführung:

- Standard eingeschränkte Nutzer: nur `ask`-Modus
- Standard-Modell-Whitelist: bevorzugt `cursor-cli`-Modelle
- Provider, Server, MCP und andere risikoreiche Verwaltung standardmäßig nicht freigeben
- Admins erweitern Berechtigungen pro Nutzer oder Rolle nach Bedarf

Vorteile:

- Geringe Einführungskosten
- Klare Risikogrenzen
- Einheitliche Modellquelle
- Einfache UX für interne Nutzung

### Rolle im System

Mit angeschlossenem Cursor CLI ruft die Plattform nicht einfach eine externe Modell-API auf. Sie bündelt Session-Kontext, Projektgrenzen und Plattform-Tools und übergibt sie an Cursor CLI zur Ausführung.

`cursor-cli` ist hier also kein isoliertes Tool, sondern Teil der einheitlichen AI-Plattform.

## Admin-Empfehlungen zur Einführung

Empfohlener Ansatz:

1. Kontrollierte Projektverzeichnisse vorbereiten
2. Nur explizit genehmigte Repositories registrieren
3. Normale Nutzer standardmäßig eingeschränkte Berechtigungen geben
4. Web-Q&A und risikoarme Funktionen priorisieren
5. Schrittweise weitere Modelle, Modi und Workflow-Funktionen hinzufügen

Kurz: Nicht alles auf einmal freischalten. Stattdessen:

> Zuerst Projekt-, Berechtigungs-, Modell- und Session-Grenzen etablieren, dann die Plattform-Funktionen schrittweise erweitern.

## Lokale Entwicklung

Der Anpassungsschwerpunkt liegt auf der Web-App, daher sollte die lokale Entwicklung mit dem Web-Stack starten.

Abhängigkeiten installieren:

```bash
bun install
```

Ein-Klick-Start:

```bash
sh restart-services.sh
```

Standard-URLs:

- Backend: `http://localhost:4096`
- Frontend: `http://localhost:3000`

Getrennt starten:

```bash
bun run --cwd packages/opencode dev
bun run --cwd packages/app dev
```

## Verwandte Dokumentation

- `docs/internal-web-user-manual.md`
  - Benutzerhandbuch für Admins und normale Nutzer
- `docs/internal-ai-platform-vision.md`
  - Produktvision und zukünftige Richtung für das Team

Diese Dokumente sind detaillierter und näher an den tatsächlichen Zielen dieses angepassten Produkts.

---

**Aktueller Fokus**: Web App, Multi-User, einheitliche AI-Plattform, kontrollierte Projektzusammenarbeit.
