# risu-workbench

> **설치 가이드:** [MCP 서버](./packages/risuai-workbench-mcp/docs/INSTALLATION.md) · [CBS LSP](./packages/cbs-lsp/docs/INSTALLATION.md) · [LuaLS](./packages/cbs-lsp/docs/LUALS_COMPANION.md) · [VS Code 확장](./packages/vscode/README.md)

RisuAI 프로젝트를 위한 VS Code 기반 크리에이터 워크벤치.

`.charx` / `.risum` 아티팩트를 편집 가능한 canonical 워크스페이스로 추출하고, CBS · Lua · 로어북 · 에셋 등 RisuAI 고유 저작 요소를 전용 툴링으로 편집·분석·시뮬레이션한 뒤, 유효한 RisuAI 포맷으로 다시 패킹한다. RisuAI 앱을 대체하는 것이 아니라, 원시 파일이나 웹 UI로 다루기 어려운 아티팩트와 워크플로우를 위한 개발자 지향 워크벤치다.

## 주요 기능

### 카드 추출 / 패킹 (Round-trip)

- `.charx`, `.risum` 아티팩트를 워크스페이스 프로젝트 구조로 추출 (`Risu Workbench: Extract Card`)
- 편집 후 원본 포맷으로 재패킹 (`Pack Card`) — 진행률/완료 다이얼로그를 갖춘 웹뷰 Pack 플로우 포함
- 임베디드 recovery manifest 기반 복원, 충돌 아카이브/복구 등 엄격한 round-trip 계약 보장

### 전용 에디터 (Custom Editors)

웹뷰 기반 Monaco 에디터가 RisuAI 고유 파일 타입을 담당한다.

- **로어북 에디터** (`*.risulorebook`) — `@@` 데코레이터 시맨틱, 활성화 링크 탐색(CodeLens)
- **정규식 에디터** (`*.risuregex`) — 정규식 시뮬레이터로 dry-run 검증
- **프롬프트 에디터** (`*.risuprompt`)
- **HTML 에디터** (`*.risuhtml`)
- **마커 에디터** — `.risuchar` / `.risumodule` 루트 마커 아티팩트 편집

`risulua`, `risuvar`, `risutoggle`, `risutext` 등 워크벤치 전 파일 타입에 대한 문법 하이라이팅 제공.

### CBS 언어 지원 (LSP)

독립 배포되는 `cbs-language-server`가 CBS(Curly Braced Syntax)에 대해 다음을 제공한다.

- 진단, 자동완성, hover, signature help, 정의/참조/rename, 포매팅, 코드 액션
- 시맨틱 토큰, 폴딩, 심볼, inlay hint, 로어북 CodeLens
- JSON `report/query` 어댑터 및 LuaLS companion 프록시(Lua 진단/hover/완성)

### CBS 프리뷰 / 시뮬레이터

모델 호출 없이 로컬 평가기로 CBS를 dry-run 하는 사이드 웹뷰 패널. `{{raw::}}` 에셋 해석을 포함해 실제 렌더 결과에 가까운 프리뷰를 제공한다. 지원 범위는 [CBS_SIMULATOR_SUPPORT_MATRIX.md](./CBS_SIMULATOR_SUPPORT_MATRIX.md) 참고.

### 에셋 매니저

Artifact Browser에서 여는 전용 에셋 관리 웹뷰 앱.

- 드래그 앤 드롭 기반 파일 추가/교체 및 파일 변경 자동 감지(file watcher)
- 카탈로그 / 매니페스트 / 콤보 에셋 매트릭스 뷰 — 축 제외 필터, 2·3-슬롯 교차 비교, 요약 히트맵
- 디스플레이 정규식 렌더러(`{{raw}}` 표시 렌더링, `editdisplay` 직렬화)

### Lua 분석

- Rust → WASM 렉시컬 분석 커널(`lua-analyzer-wasm`)이 대용량 `.risulua` 파일의 문자열 리터럴, CBS 마커, state 키(`getState`/`setChatVar` 등), require 별칭, 모듈 export를 고속 인덱싱
- `Analyze Lua`, `Generate LuaLS Stubs` 커맨드로 분석 및 LuaLS 스텁 생성

### Artifact Browser

액티비티 바의 "Risu Workbench" 사이드바에서 워크스페이스 내 카드/모듈 아티팩트를 탐색하고, 카드 패널·마커 에디터·에셋 매니저 등 각 도구로 진입한다.

### MCP 서버 (Agent 연동)

`risuai-workbench-mcp` — AI 에이전트가 canonical 워크스페이스를 읽고 검증하고, 승인 기반으로 패치할 수 있게 하는 로컬 stdio MCP 서버. Facade 기반 도구 표면과 patch preview/apply 안전장치를 갖춘다.

## 저장소 구조

npm workspaces 기반 모노레포.

| 경로 | 역할 |
|------|------|
| `packages/core/` | 공유 코어 엔진 — RisuAI archive/card I/O, canonical artifact 계약, CBS/Lua/로어북 분석, 런타임 헬퍼, `risu-core` CLI |
| `packages/cbs-lsp/` | Standalone `cbs-language-server` — CBS/RisuAI 아티팩트용 LSP, JSON `report/query`, LuaLS companion |
| `packages/vscode/` | VS Code 익스텐션 및 공식 CBS LSP client — 언어, grammar, command, view, webview-backed editor |
| `packages/webview/` | Svelte/Vite/Monaco 기반 VS Code webview UI — main editor, marker editor, preview, asset manager, LSP UI bridge |
| `packages/lua-analyzer-wasm/` | `.risulua` lexical indexing을 위한 Rust/WASM 분석 커널 |
| `packages/risuai-workbench-mcp/` | Agent workflow용 local stdio MCP server — 추출, 검증, 분석 조회, 안전한 patch preview/apply |
| `docs/` | 아키텍처, 제품 기획, custom-extension 명세, core/domain 문서, MCP 문서, 리서치 자료 |

## 개발

```bash
npm install
npm run build:core
npm run build:cbs-lsp
npm run build:webview
npm run build:vscode
```

VS Code에서 루트 디렉토리를 열고 `F5`를 누르면 Extension Development Host가 실행된다. 이 흐름은 모노레포 루트의 `.vscode` launch 설정을 기준으로 `packages/vscode` 확장을 개발 모드로 띄우는 로컬 디버깅 진입점이다.

확장 개발용 전체 빌드(WASM 포함)는 다음 명령을 사용한다.

```bash
npm run build:extension-dev
```

CBS LSP release 경계까지 검증하려면 다음 명령을 사용한다.

```bash
npm run verify:cbs-lsp-release
```

린트/포맷은 `npm run lint`, `npm run format`을 사용한다.

## 라이선스

GPL-3.0

---

English version: [README_EN.md](./README_EN.md)
