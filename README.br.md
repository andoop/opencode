<p align="center">
  <a href="https://opencode.ai">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="OpenCode logo">
    </picture>
  </a>
</p>
<p align="center">Plataforma web interna de colaboração em IA R&D personalizada baseada em OpenCode.</p>
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

## Posicionamento do projeto

Este repositório não descreve uma ferramenta genérica de codificação com IA para desktop, mas uma plataforma web interna de IA R&D personalizada baseada em OpenCode.

- É um produto interno **Web-first**; o foco atual de personalização é o aplicativo web
- Serve a **colaboração multiusuário** na organização, não o uso local de um único desenvolvedor
- Não permite conectar livremente a diretórios do servidor; os usuários trabalham dentro de **limites de projeto controlados pelo administrador**
- Oferece **capacidades de plataforma de IA unificada**, não apenas uma página de "conversar com IA para editar código"

Pode ser entendido como:

> Uma bancada de trabalho de IA R&D controlada, governável e multiusuário para uso interno.

## Nossa filosofia

A plataforma visa se tornar uma plataforma interna unificada de colaboração em IA R&D, não apenas uma página de codificação com IA.

Princípios fundamentais:

- **Não é desktop remoto, mas uma bancada de trabalho de IA dentro de projetos controlados**
- **Não para poucos desenvolvedores monopolizarem a IA, mas para mais papéis participarem da produção de software dentro de seu escopo autorizado**
- **Não para a IA apenas responder perguntas, mas para a IA se tornar gradualmente a camada de execução no fluxo de R&D**
- **Não remover limites, mas melhorar eficiência sob governança de permissões, projetos, sessões e modelos**

Em termos de produto, os três limites mais importantes são:

- **Limite de projeto**: usuários normais só podem acessar projetos pré-registrados por administradores
- **Limite de sessão**: uma tarefa corresponde a uma sessão e um espaço de trabalho independentes
- **Limite de permissão**: o que os usuários veem, o que podem fazer e quais modelos podem usar são controlados pela plataforma

## Capacidades atuais principais

A personalização se concentra no aplicativo web:

- Registro multiusuário, login e gerenciamento de contas
- Capacidades de usuário, projeto, modelo e auditoria visíveis para administradores
- Registro de projetos para expor apenas repositórios de código aprovados
- Espaços de trabalho isolados por sessão, tipicamente via Git worktrees
- Governança unificada de modelos, provedores, permissões e modos
- Ponto de entrada unificado para a plataforma de IA para equipes

O foco não é desktop nem TUI, mas:

> Permitir que usuários internos completem Q&A, análise, edição, execução e colaboração via web, dentro de projetos controlados.

## Multiusuário e plataforma de IA unificada

A plataforma não concede acesso total a quem faz login. Em vez disso:

1. Os administradores preparam o código do projeto no servidor
2. Os administradores registram diretórios permitidos como projetos
3. Os usuários se registram e fazem login via web
4. Usuários normais só veem projetos que foram abertos para eles
5. Os usuários começam a trabalhar em sessões após entrar em um projeto

A plataforma de IA unificada oferece:

- Ponto de entrada unificado de modelos
- Gerenciamento unificado de provedores
- Controle unificado de permissões
- Fluxo de trabalho unificado por sessão
- Limites unificados de auditoria e governança

Este design suporta implantação interna gradual: começar com permissões de baixo risco, depois expandir por papel e cenário.

## Suporte ao Cursor CLI

A plataforma suporta **Cursor CLI** como fonte de modelo/provedor na plataforma de IA unificada.

### Como conectar

A máquina do servidor deve ter o Cursor CLI instalado e o comando `agent` disponível no shell:

```bash
agent login
```

Após o login, a plataforma reutiliza o estado de login existente do Cursor local.

### Uso na plataforma

- Os administradores controlam se os usuários podem acessar modelos e provedores
- Usuários restritos por padrão normalmente têm apenas o modo `ask`
- A whitelist de modelos padrão geralmente inclui:
  - `cursor-cli/auto`
  - `cursor-cli/composer-1`
  - `cursor-cli/composer-1.5`

Se o Cursor CLI não estiver instalado ou `agent` não estiver disponível, os modelos e provedores do Cursor CLI não aparecerão na plataforma.

### Recomendações de configuração

Para implantação interna inicial:

- Usuários restritos por padrão: apenas modo `ask`
- Whitelist de modelos padrão: preferir modelos `cursor-cli`
- Não expor Provider, Server, MCP ou outra gestão de alto risco por padrão
- Permitir que administradores expandam capacidades por usuário ou papel conforme necessário

Benefícios:

- Baixo custo de implantação
- Limites de risco claros
- Fonte de modelos unificada
- UX simples para adoção interna

### Papel no sistema

Com o Cursor CLI conectado, a plataforma não apenas chama uma API de modelo externa. Ela monta o contexto da sessão, os limites do projeto e as ferramentas da plataforma, e os passa para o Cursor CLI para execução.

Assim, `cursor-cli` não é uma ferramenta isolada aqui, mas parte da plataforma de IA unificada.

## Recomendações de implantação para administradores

Abordagem recomendada:

1. Preparar diretórios de projeto controlados
2. Registrar apenas repositórios explicitamente aprovados
3. Dar permissões restritas por padrão a usuários normais
4. Priorizar Q&A web e capacidades de baixo risco
5. Adicionar gradualmente mais modelos, modos e funções de fluxo de trabalho

Em resumo: não ativar tudo de uma vez. Em vez disso:

> Estabelecer primeiro os limites de projeto, permissão, modelo e sessão, depois expandir as capacidades da plataforma passo a passo.

## Desenvolvimento local

O foco de personalização é o aplicativo web, então o desenvolvimento local deve iniciar o stack web.

Instalar dependências:

```bash
bun install
```

Inicialização com um comando:

```bash
sh restart-services.sh
```

URLs padrão:

- Backend: `http://localhost:4096`
- Frontend: `http://localhost:3000`

Para iniciar separadamente:

```bash
bun run --cwd packages/opencode dev
bun run --cwd packages/app dev
```

## Documentação relacionada

- `docs/internal-web-user-manual.md`
  - Guia do usuário para administradores e usuários normais
- `docs/internal-ai-platform-vision.md`
  - Visão do produto e direção futura para a equipe

Esses documentos são mais detalhados e mais próximos dos objetivos reais deste produto personalizado.

---

**Foco atual**: aplicativo web, multiusuário, plataforma de IA unificada, colaboração em projetos controlados.
