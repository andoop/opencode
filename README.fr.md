<p align="center">
  <a href="https://opencode.ai">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="OpenCode logo">
    </picture>
  </a>
</p>
<p align="center">Plateforme web interne de collaboration R&D IA personnalisée basée sur OpenCode.</p>
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

## Positionnement du projet

Ce dépôt ne décrit pas un outil générique de codage IA pour poste de travail, mais une plateforme web interne de R&D IA personnalisée à partir d’OpenCode.

- C’est un produit interne **Web-first** ; la personnalisation actuelle se concentre sur l’application web
- Il sert la **collaboration multi-utilisateurs** en interne, pas l’usage local d’un seul développeur
- Il ne permet pas de se connecter librement à des répertoires serveur ; les utilisateurs travaillent dans des **limites de projet contrôlées par l’administrateur**
- Il fournit des **capacités de plateforme IA unifiée**, pas seulement une page « discuter avec l’IA pour modifier le code »

On peut le voir comme :

> Un poste de travail R&D IA contrôlé, gouvernable et multi-utilisateurs pour usage interne.

## Notre philosophie

La plateforme vise à devenir une plateforme interne unifiée de collaboration R&D IA, pas seulement une page de codage IA.

Principes clés :

- **Pas un bureau à distance, mais un poste de travail IA dans des projets contrôlés**
- **Pas pour que quelques développeurs monopolisent l’IA, mais pour que plus de rôles participent à la production logicielle dans leur périmètre autorisé**
- **Pas une IA qui ne fait que répondre, mais une IA qui devient progressivement la couche d’exécution du flux R&D**
- **Pas de suppression des limites, mais une efficacité accrue sous gouvernance des permissions, projets, sessions et modèles**

En termes de produit, les trois limites les plus importantes sont :

- **Limite de projet** : les utilisateurs normaux n’accèdent qu’aux projets préenregistrés par les administrateurs
- **Limite de session** : une tâche correspond à une session et un espace de travail indépendants
- **Limite de permissions** : ce que les utilisateurs voient, font et quels modèles ils utilisent sont contrôlés par la plateforme

## Capacités actuelles clés

La personnalisation se concentre sur l’application web :

- Inscription multi-utilisateurs, connexion et gestion de comptes
- Capacités utilisateur, projet, modèle et audit visibles par les administrateurs
- Enregistrement de projets pour n’exposer que les dépôts de code approuvés
- Espaces de travail isolés par session, typiquement via Git worktrees
- Gouvernance unifiée des modèles, fournisseurs, permissions et modes
- Point d’entrée unifié vers la plateforme IA pour les équipes

Le focus n’est pas sur le poste de travail ni le TUI, mais sur :

> Permettre aux utilisateurs internes de faire Q&A, analyse, édition, exécution et collaboration via le web, dans des projets contrôlés.

## Multi-utilisateurs et plateforme IA unifiée

La plateforme ne donne pas accès complet à tout le monde. En revanche :

1. Les administrateurs préparent le code du projet sur le serveur
2. Les administrateurs enregistrent les répertoires autorisés comme projets
3. Les utilisateurs s’inscrivent et se connectent via le web
4. Les utilisateurs normaux ne voient que les projets qui leur sont ouverts
5. Les utilisateurs commencent à travailler en sessions après être entrés dans un projet

La plateforme IA unifiée offre :

- Point d’entrée unifié des modèles
- Gestion unifiée des fournisseurs
- Contrôle unifié des permissions
- Flux de travail unifié par session
- Limites unifiées d’audit et de gouvernance

Ce design permet un déploiement interne progressif : commencer avec des permissions à faible risque, puis étendre par rôle et scénario.

## Support Cursor CLI

La plateforme prend en charge **Cursor CLI** comme source de modèle/fournisseur dans la plateforme IA unifiée.

### Comment connecter

La machine serveur doit avoir Cursor CLI installé et la commande `agent` disponible dans le shell :

```bash
agent login
```

Après connexion, la plateforme réutilise l’état de connexion Cursor local existant.

### Utilisation dans la plateforme

- Les administrateurs contrôlent si les utilisateurs peuvent accéder aux modèles et fournisseurs
- Les utilisateurs restreints par défaut ont généralement uniquement le mode `ask`
- La liste blanche de modèles par défaut inclut généralement :
  - `cursor-cli/auto`
  - `cursor-cli/composer-1`
  - `cursor-cli/composer-1.5`

Si Cursor CLI n’est pas installé ou `agent` n’est pas disponible, les modèles et fournisseurs Cursor CLI n’apparaîtront pas dans la plateforme.

### Recommandations de configuration

Pour le déploiement interne initial :

- Utilisateurs restreints par défaut : uniquement le mode `ask`
- Liste blanche de modèles par défaut : privilégier les modèles `cursor-cli`
- Ne pas exposer Provider, Server, MCP ou autre gestion à haut risque par défaut
- Laisser les administrateurs étendre les capacités par utilisateur ou rôle selon les besoins

Avantages :

- Faible coût d’intégration
- Limites de risque claires
- Source de modèles unifiée
- UX simple pour l’adoption interne

### Rôle dans le système

Avec Cursor CLI connecté, la plateforme ne fait pas qu’appeler une API de modèle externe. Elle assemble le contexte de session, les limites du projet et les outils de la plateforme, puis les transmet à Cursor CLI pour exécution.

Ainsi, `cursor-cli` n’est pas un outil isolé ici, mais une partie de la plateforme IA unifiée.

## Recommandations de déploiement pour administrateurs

Approche recommandée :

1. Préparer des répertoires de projet contrôlés
2. N’enregistrer que les dépôts explicitement approuvés
3. Donner des permissions restreintes par défaut aux utilisateurs normaux
4. Prioriser le Q&A web et les capacités à faible risque
5. Ajouter progressivement plus de modèles, modes et fonctions de flux de travail

En bref : ne pas tout activer d’un coup. À la place :

> Établir d’abord les limites de projet, permissions, modèles et sessions, puis étendre les capacités de la plateforme étape par étape.

## Développement local

La personnalisation se concentre sur l’application web, donc le développement local doit démarrer le stack web.

Installer les dépendances :

```bash
bun install
```

Démarrage en une commande :

```bash
sh restart-services.sh
```

URLs par défaut :

- Backend : `http://localhost:4096`
- Frontend : `http://localhost:3000`

Pour démarrer séparément :

```bash
bun run --cwd packages/opencode dev
bun run --cwd packages/app dev
```

## Documentation associée

- `docs/internal-web-user-manual.md`
  - Guide utilisateur pour administrateurs et utilisateurs normaux
- `docs/internal-ai-platform-vision.md`
  - Vision produit et orientation future pour l’équipe

Ces documents sont plus détaillés et plus proches des objectifs réels de ce produit personnalisé.

---

**Focus actuel** : application web, multi-utilisateurs, plateforme IA unifiée, collaboration en projets contrôlés.
