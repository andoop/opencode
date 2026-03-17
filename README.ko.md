<p align="center">
  <a href="https://opencode.ai">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="OpenCode logo">
    </picture>
  </a>
</p>
<p align="center">OpenCode 기반 맞춤형 사내 AI R&D 협업 웹 플랫폼.</p>
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

## 프로젝트 포지셔닝

이 저장소는 일반적인 데스크톱 AI 코딩 도구가 아니라, OpenCode를 기반으로 맞춤 개발한 사내 Web AI R&D 플랫폼을 소개합니다.

- **Web-first** 내부 제품이며, 현재 맞춤화의 핵심은 Web App입니다
- 단일 개발자 로컬 사용이 아니라 사내 **다중 사용자 협업**을 위한 것입니다
- 사용자가 서버 디렉터리에 자유롭게 연결하는 것이 아니라 **관리자가 미리 제어하는 프로젝트 경계 내**에서 AI를 사용합니다
- 단순한 "AI와 채팅하며 코드 수정" 페이지가 아니라 **통합 AI 플랫폼 역량**을 제공합니다

다음과 같이 이해할 수 있습니다:

> 사내에서 제어 가능하고, 거버넌스가 가능하며, 다인 협업을 위한 AI R&D 워크벤치.

## 우리의 철학

이 플랫폼은 AI 코딩 페이지에 그치지 않고, 점진적으로 사내 통합 AI R&D 협업 플랫폼으로 발전하는 것을 목표로 합니다.

핵심 철학:

- **원격 데스크톱이 아니라, 제어된 프로젝트 내 AI 워크벤치**
- **소수 개발자만 AI를 독점하는 것이 아니라, 더 많은 역할이 권한 범위 내에서 소프트웨어 생산에 참여**
- **AI가 질문에만 답하는 것이 아니라, AI가 점진적으로 R&D 워크플로우의 실행 계층이 됨**
- **경계를 풀어버리는 것이 아니라, 권한·프로젝트·세션·모델 등 거버넌스 전제 하에 효율 향상**

제품 설계상 현재 가장 중요한 세 가지 경계:

- **프로젝트 경계**: 일반 사용자는 관리자가 미리 등록한 프로젝트만 접근 가능
- **세션 경계**: 하나의 작업은 하나의 독립 세션과 워크스페이스에 대응
- **권한 경계**: 사용자가 무엇을 보고, 무엇을 할 수 있고, 어떤 모델을 쓸 수 있는지는 모두 플랫폼이 제어

## 현재 핵심 역량

현재 맞춤판의 핵심 역량은 Web App에 집중되어 있습니다:

- 다중 사용자 등록, 로그인, 계정 관리
- 관리자가 볼 수 있는 사용자, 프로젝트, 모델, 감사 역량
- 프로젝트 등록 메커니즘으로 허용된 코드 저장소만 공개
- 세션 단위 독립 워크스페이스, Git worktree 기반 작업 격리
- 모델, Provider, 권한, 모드의 통합 거버넌스
- 팀을 위한 통합 AI 플랫폼 진입점

즉, 플랫폼의 현재 초점은 데스크톱이나 TUI가 아니라:

> 사내 사용자가 Web 페이지를 통해 제어된 프로젝트에서 질의응답, 분석, 수정, 실행, 협업을 수행하는 것.

## 다중 사용자와 통합 AI 플랫폼

현재 설계에서 플랫폼은 "로그인한 사람이 모든 기능을 마음대로 쓸 수 있는" 구조가 아닙니다:

1. 관리자가 먼저 서버 머신에서 프로젝트 코드를 준비합니다
2. 관리자가 접근을 허용한 디렉터리를 프로젝트로 등록합니다
3. 사용자가 Web 페이지를 통해 등록·로그인합니다
4. 일반 사용자는 공개된 프로젝트만 볼 수 있습니다
5. 사용자가 프로젝트에 들어간 후 세션을 기반으로 실제 작업을 시작합니다

통합 AI 플랫폼은 다음에서 드러납니다:

- 통합 모델 진입점
- 통합 Provider 관리
- 통합 권한 제어
- 통합 세션 작업 방식
- 통합 감사 및 거버넌스 경계

이 설계는 사내 점진적 도입에 적합합니다: 먼저 저위험 권한으로 공개하고, 역할과 시나리오에 따라 점진적으로 역량을 확대합니다.

## Cursor CLI 지원

이 플랫폼은 **Cursor CLI**를 통합 AI 플랫폼의 모델/Provider 소스로 연결할 수 있습니다.

### 연결 방법

서버 머신에 Cursor CLI를 설치하고, shell에서 `agent` 명령을 사용할 수 있어야 합니다:

```bash
agent login
```

로그인 후 플랫폼은 해당 머신의 기존 Cursor 로그인 상태를 재사용합니다.

### 플랫폼 내 사용 방식

- 관리자는 사용자 권한에서 모델 진입점, Provider 진입점 공개 여부를 제어할 수 있습니다
- 기본 제한 사용자는 보통 `ask` 모드만 공개됩니다
- 현재 기본 화이트리스트 모델에는 보통 다음이 포함됩니다:
  - `cursor-cli/auto`
  - `cursor-cli/composer-1`
  - `cursor-cli/composer-1.5`

서버 머신에 Cursor CLI가 올바르게 설치되지 않았거나 `agent` 명령을 사용할 수 없으면, 플랫폼에 Cursor CLI 관련 모델이나 Provider가 표시되지 않습니다.

### 설정 권장사항

사내 초기 도입 시 다음 설정을 권장합니다:

- 일반 등록 사용자 기본값: `ask`만 공개
- 기본 모델 화이트리스트: `cursor-cli` 시리즈 우선 사용
- Provider, Server, MCP 등 고위험 관리 진입점은 기본 공개하지 않음
- 관리자가 사용자·역할별로 점진적으로 역량 확대

장점:

- 도입 비용 낮음
- 위험 경계 명확
- 모델 소스 통일
- 사용자 경험 단순, 사내 보급 용이

### 시스템 내 역할

Cursor CLI를 연결하면 플랫폼은 단순히 외부 모델 API를 호출하는 것이 아니라, 현재 세션 컨텍스트, 프로젝트 경계, 플랫폼 도구 역량을 통합해 Cursor CLI에 전달해 실행에 참여시킵니다.

따라서 `cursor-cli`는 여기서 고립된 도구가 아니라 통합 AI 플랫폼의 일부입니다.

## 관리자 권장 도입 방식

다음과 같이 사용하는 것을 권장합니다:

1. 먼저 제어된 프로젝트 디렉터리를 준비합니다
2. 명시적으로 허용된 저장소만 등록합니다
3. 일반 사용자에게 기본적으로 제한된 권한을 부여합니다
4. Web Q&A와 저위험 역량을 우선 공개합니다
5. 그 다음 더 많은 모델, 모드, 워크플로우 역량을 점진적으로 도입합니다

한마디로, "모든 역량을 먼저 열어두는" 것이 아니라:

> 프로젝트 경계, 권한 경계, 모델 경계, 세션 경계를 먼저 구축한 뒤, 점진적으로 플랫폼 역량을 확대하는 것을 권장합니다.

## 로컬 개발

현재 저장소의 맞춤화 초점은 Web App이므로, 로컬 개발도 Web 방식으로 우선 실행하는 것을 권장합니다.

의존성 설치:

```bash
bun install
```

원클릭 로컬 서비스 시작:

```bash
sh restart-services.sh
```

기본 주소:

- 백엔드: `http://localhost:4096`
- 프론트엔드: `http://localhost:3000`

개별 실행 시:

```bash
bun run --cwd packages/opencode dev
bun run --cwd packages/app dev
```

## 관련 문서

- `docs/internal-web-user-manual.md`
  - 관리자와 일반 사용자를 위한 사용 안내
- `docs/internal-ai-platform-vision.md`
  - 팀 내부를 위한 제품 비전과 향후 방향

이 문서들은 현재 README보다 더 상세하며, 이 맞춤 제품의 실제 목표에 더 가깝습니다.

---

**현재 버전 초점**: Web App, 다중 사용자, 통합 AI 플랫폼, 제어된 프로젝트 협업.
