# risu-workbench

RisuAI 프로젝트를 위한 VS Code 기반 크리에이터 워크벤치.

봇 설정, 모듈, 캐릭터 카드, 분석용 프로젝트 구조를 임포트하거나 스캐폴딩하고, CBS, Lua, 로어북 등 RisuAI 고유 저작 요소를 전용 툴링으로 다룬 뒤, 유효한 RisuAI 포맷으로 내보낸다.

## 워크플로우 우선순위

편집/분석 > 임포트/스캐폴드 > round-trip 충실성 > 런타임 시뮬레이션

## 퍼스트클래스 아티팩트

봇 설정, 모듈, 캐릭터 카드, 분석 출력물, 프로젝트 스캐폴드

## RisuAI 고유 영역

- CBS 툴링
- Lua 분석
- 로어북 도메인 로직
- 엄격한 round-trip 계약
- 모델 호출 없는 런타임 시뮬레이션

## 저장소 구조

| 경로 | 역할 |
|------|------|
| `packages/core/` | 공유 코어 엔진 -- RisuAI archive/card I/O, canonical artifact 계약, CBS/Lua/로어북 분석, 런타임 헬퍼, `risu-core` CLI |
| `packages/cbs-lsp/` | Standalone `cbs-language-server` -- CBS/RisuAI 아티팩트용 LSP, JSON `report/query`, LuaLS companion |
| `packages/vscode/` | VS Code 익스텐션 및 공식 CBS LSP client -- 언어, grammar, command, view, webview-backed editor |
| `packages/webview/` | Svelte/Vite/Monaco 기반 VS Code webview UI -- main editor, marker editor, preview, LSP UI bridge |
| `packages/lua-analyzer-wasm/` | `.risulua` lexical indexing을 위한 private Rust/WASM 분석 커널 |
| `packages/risuai-workbench-mcp/` | Agent workflow용 local stdio MCP server -- 추출, 검증, 분석 조회, 안전한 patch preview/apply |
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

확장 개발용 전체 빌드는 다음 명령을 사용한다.

```bash
npm run build:extension-dev
```

CBS LSP release 경계까지 검증하려면 다음 명령을 사용한다.

```bash
npm run verify:cbs-lsp-release
```

## 라이선스

GPL-3.0

---

English version: [README_EN.md](./README_EN.md)
