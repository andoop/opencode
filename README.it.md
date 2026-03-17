<p align="center">
  <a href="https://opencode.ai">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="OpenCode logo">
    </picture>
  </a>
</p>
<p align="center">Piattaforma web interna di collaborazione R&D IA personalizzata basata su OpenCode.</p>
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

## Posizionamento del progetto

Questo repository non descrive uno strumento generico di codifica IA per desktop, ma una piattaforma web interna di R&D IA personalizzata a partire da OpenCode.

- È un prodotto interno **Web-first**; il focus attuale della personalizzazione è l'applicazione web
- Serve la **collaborazione multi-utente** nell'organizzazione, non l'uso locale di un singolo sviluppatore
- Non consente di connettersi liberamente a directory del server; gli utenti lavorano entro **limiti di progetto controllati dall'amministratore**
- Fornisce **capacità di piattaforma IA unificata**, non solo una pagina "chattare con l'IA per modificare il codice"

Puoi intenderla come:

> Un banco di lavoro R&D IA controllato, governabile e multi-utente per uso interno.

## La nostra filosofia

La piattaforma mira a diventare una piattaforma interna unificata di collaborazione R&D IA, non solo una pagina di codifica IA.

Principi chiave:

- **Non un desktop remoto, ma un banco di lavoro IA entro progetti controllati**
- **Non per pochi sviluppatori che monopolizzano l'IA, ma per più ruoli che partecipano alla produzione software nel proprio ambito autorizzato**
- **Non un'IA che risponde solo alle domande, ma un'IA che diventa gradualmente il livello di esecuzione nel flusso R&D**
- **Non eliminare i limiti, ma migliorare l'efficienza sotto governance di permessi, progetti, sessioni e modelli**

In termini di prodotto, i tre limiti più importanti sono:

- **Limite di progetto**: gli utenti normali possono accedere solo ai progetti preregistrati dagli amministratori
- **Limite di sessione**: un'attività corrisponde a una sessione e uno spazio di lavoro indipendenti
- **Limite di permessi**: cosa vedono gli utenti, cosa possono fare e quali modelli usare è controllato dalla piattaforma

## Capacità attuali chiave

La personalizzazione si concentra sull'applicazione web:

- Registrazione multi-utente, login e gestione account
- Capacità utente, progetto, modello e audit visibili agli amministratori
- Registrazione progetti per esporre solo repository di codice approvati
- Spazi di lavoro isolati per sessione, tipicamente tramite Git worktrees
- Governance unificata di modelli, provider, permessi e modalità
- Punto di ingresso unificato alla piattaforma IA per i team

Il focus non è su desktop o TUI, ma su:

> Consentire agli utenti interni di completare Q&A, analisi, modifica, esecuzione e collaborazione via web, entro progetti controllati.

## Multi-utente e piattaforma IA unificata

La piattaforma non concede accesso completo a chi si connette. Invece:

1. Gli amministratori preparano il codice del progetto sul server
2. Gli amministratori registrano le directory consentite come progetti
3. Gli utenti si registrano e accedono via web
4. Gli utenti normali vedono solo i progetti a loro aperti
5. Gli utenti iniziano a lavorare in sessioni dopo essere entrati in un progetto

La piattaforma IA unificata offre:

- Punto di ingresso unificato dei modelli
- Gestione unificata dei provider
- Controllo unificato dei permessi
- Flusso di lavoro unificato per sessione
- Limiti unificati di audit e governance

Questo design supporta un rollout interno graduale: iniziare con permessi a basso rischio, poi espandere per ruolo e scenario.

## Supporto Cursor CLI

La piattaforma supporta **Cursor CLI** come fonte di modello/provider nella piattaforma IA unificata.

### Come connettersi

La macchina server deve avere Cursor CLI installato e il comando `agent` disponibile nella shell:

```bash
agent login
```

Dopo il login, la piattaforma riutilizza lo stato di login Cursor locale esistente.

### Utilizzo nella piattaforma

- Gli amministratori controllano se gli utenti possono accedere a modelli e provider
- Gli utenti limitati di default hanno tipicamente solo la modalità `ask`
- La whitelist dei modelli di default include tipicamente:
  - `cursor-cli/auto`
  - `cursor-cli/composer-1`
  - `cursor-cli/composer-1.5`

Se Cursor CLI non è installato o `agent` non è disponibile, i modelli e i provider Cursor CLI non appariranno nella piattaforma.

### Raccomandazioni di configurazione

Per il rollout interno iniziale:

- Utenti limitati di default: solo modalità `ask`
- Whitelist modelli di default: preferire i modelli `cursor-cli`
- Non esporre Provider, Server, MCP o altra gestione ad alto rischio di default
- Lasciare che gli amministratori espandano le capacità per utente o ruolo secondo necessità

Vantaggi:

- Basso costo di onboarding
- Limiti di rischio chiari
- Fonte modelli unificata
- UX semplice per l'adozione interna

### Ruolo nel sistema

Con Cursor CLI connesso, la piattaforma non chiama semplicemente un'API di modello esterna. Assemblea contesto di sessione, limiti di progetto e strumenti della piattaforma, poi li passa a Cursor CLI per l'esecuzione.

Quindi `cursor-cli` non è uno strumento isolato qui, ma parte della piattaforma IA unificata.

## Raccomandazioni di rollout per amministratori

Approccio raccomandato:

1. Preparare directory di progetto controllate
2. Registrare solo repository esplicitamente approvati
3. Dare permessi limitati di default agli utenti normali
4. Dare priorità a Q&A web e capacità a basso rischio
5. Aggiungere gradualmente più modelli, modalità e funzioni di flusso di lavoro

In breve: non attivare tutto subito. Invece:

> Stabilire prima i limiti di progetto, permessi, modelli e sessioni, poi espandere le capacità della piattaforma passo dopo passo.

## Sviluppo locale

La personalizzazione si concentra sull'applicazione web, quindi lo sviluppo locale deve avviare lo stack web.

Installare le dipendenze:

```bash
bun install
```

Avvio con un comando:

```bash
sh restart-services.sh
```

URL predefiniti:

- Backend: `http://localhost:4096`
- Frontend: `http://localhost:3000`

Per avviare separatamente:

```bash
bun run --cwd packages/opencode dev
bun run --cwd packages/app dev
```

## Documentazione correlata

- `docs/internal-web-user-manual.md`
  - Guida utente per amministratori e utenti normali
- `docs/internal-ai-platform-vision.md`
  - Visione prodotto e direzione futura per il team

Questi documenti sono più dettagliati e più vicini agli obiettivi reali di questo prodotto personalizzato.

---

**Focus attuale**: applicazione web, multi-utente, piattaforma IA unificata, collaborazione in progetti controllati.
