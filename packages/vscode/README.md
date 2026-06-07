# Risu Workbench VS Code 문서 인덱스

`packages/vscode`는 RisuAI Workbench를 VS Code Extension Host 안에서 실행하는 공식 클라이언트 패키지입니다. 이 문서는 extension의 공개 경계, `packages/webview` 번들 소비 방식, CBS LSP 연결 정책, 로컬 검증 루프를 한 번에 탐색하기 위한 진입점입니다.

문서의 신뢰 기준(Source of Truth)은 코드와 테스트를 따릅니다. 이 README는 구현 파일을 대신하는 명세가 아니라, 작업자가 어떤 경계를 먼저 확인해야 하는지 좁혀 주는 인덱스입니다.

## 이 패키지는 무엇을 소유하나

- VS Code activation, command, language, grammar, view, custom editor contribution 경계
- `.risulorebook`, `.risuregex`, `.risuprompt`, `.risuhtml`, `.risutext`, `.risulua` 관련 VS Code 언어/문법 등록
- `cbs-language-server`를 붙이는 공식 VS Code CBS LSP client 경계
- `packages/webview`에서 빌드한 Svelte/Vite bundle을 Extension Host webview로 로드하는 host/provider 경계
- `.risuchar`, `.risumodule` root marker artifact browser와 marker editor host 동작
- main editor provider와 webview-backed editor bridge 동작

`packages/webview`는 UI bundle과 브라우저 쪽 message/helper를 소유하고, `packages/vscode`는 그 bundle을 VS Code webview resource로 제공하며 host-side 파일 접근, command, LSP, editor lifecycle을 소유합니다.

## Entry × Page 매트릭스

현재 작업 주제별로 먼저 확인할 구현/테스트 위치입니다.

| surface | 먼저 볼 경계 | 현재 근거 파일 |
| :-- | :-- | :-- |
| Extension activation | activation/register boundary | `src/extension.ts`, `package.json` |
| VS Code contributions | command/language/view/custom editor manifest | `package.json`, `language-configuration.json`, `syntaxes/*` |
| CBS LSP client | standalone-first client launch | `src/lsp/cbsLanguageClient.ts`, `src/lsp/cbsLanguageClientBoundary.ts`, `tests/e2e/extension-client.test.ts` |
| Artifact Browser sidebar | VS Code Webview View host | `src/views/ArtifactBrowserViewProvider.ts`, `src/artifact-browser/*`, `packages/webview/src/App.svelte`, `packages/webview/src/main.ts` |
| Marker editor | `.risuchar`/`.risumodule` panel host | `src/views/MarkerEditorViewProvider.ts`, `packages/webview/src/lib/components/editor/marker/*` |
| Main editor | custom editor provider + bridge | `src/editors/mainEditor/*`, `packages/webview/src/lib/components/editor/main/*`, `packages/webview/src/lib/monaco/*` |
| Webview bundle packaging | copy built UI into extension dist | `scripts/copy-webview.mjs`, `packages/webview/vite.config.ts` |
| Product client E2E | official client regression | `tests/e2e/*`, `scripts/verify-cbs-client.mjs` |

## VS Code ↔ Webview 관계

두 패키지는 한 제품 경계를 나눠 가진다.

1. `packages/webview`가 `index.html`과 Svelte/Monaco runtime import graph를 `dist/`로 빌드한다.
2. `packages/vscode`의 `build` script는 먼저 webview build를 실행한 뒤 `scripts/copy-webview.mjs`로 `../webview/dist`를 `dist/webview`에 복사한다.
3. VS Code provider는 `dist/webview`를 `localResourceRoots`에 넣고, production HTML 또는 dev-server HTML을 webview에 주입한다.
4. Webview 쪽은 versioned message envelope를 `postMessage`로 보내고, VS Code 쪽 provider가 파일 시스템, editor open, save/reset/image selection, LSP bridge 같은 host-only 작업을 처리한다.

이 분리 때문에 UI state나 Monaco helper 변경은 `packages/webview`에서 먼저 확인하고, VS Code API, file URI, workspace discovery, custom editor lifecycle 변경은 `packages/vscode`에서 먼저 확인한다.

## Launch contract

CBS LSP client 설정은 `package.json`의 `contributes.configuration`과 `src/lsp/*` 구현이 함께 고정합니다.

```json
{
  "risuWorkbench.cbs.server.launchMode": "auto",
  "risuWorkbench.cbs.server.installMode": "local-devDependency",
  "risuWorkbench.cbs.server.path": "",
  "risuWorkbench.cbs.server.luaLsPath": ""
}
```

- `launchMode = "auto"` — selected standalone install mode를 먼저 시도하고, `local-devDependency`가 workspace에서 해석되지 않을 때만 embedded monorepo module로 fallback합니다.
- `launchMode = "standalone"` — standalone public surface만 사용합니다. fallback 없이 resolution failure UX를 바로 노출합니다.
- `launchMode = "embedded"` — monorepo 개발용 `packages/cbs-lsp/dist/embedded.js` IPC launch를 강제합니다.
- `installMode = "local-devDependency"` — `<workspace>/node_modules/.bin/cbs-language-server --stdio`
- `installMode = "npx"` — `npx cbs-language-server --stdio`
- `installMode = "global"` — `cbs-language-server --stdio`
- `path` — explicit executable override. 상대 경로는 first workspace folder 기준으로 해석합니다.
- `luaLsPath` — CBS LuaLS sidecar가 사용할 `lua-language-server` executable override입니다.

## Failure UX policy

client는 resolution 실패를 silent no-op으로 숨기지 않습니다.

- Output Channel에 command plan / resolution failure를 남깁니다.
- VS Code error message에 recovery hint를 노출합니다.
- explicit path override가 잘못되면 fallback으로 감추지 않습니다.
- standalone server 자체의 stdio smoke, extracted workspace E2E, perf budget은 server 패키지가 소유하고, 이 패키지는 공식 VS Code client가 public server surface를 어떻게 선택하고 붙는지만 검증합니다.

## 개발과 검증

패키지 단위 기본 루프입니다.

```bash
npm run build
npm run build:extension
npm run build:test:e2e
npm run test:e2e:cbs-client:boundary
npm run test:e2e:cbs-client:runtime
npm run verify:cbs-client
```

- `npm run build` — `packages/webview` build 후 VS Code extension build와 webview copy를 실행합니다.
- `npm run build:extension` — TypeScript compile, alias rewrite, webview copy만 실행합니다.
- `npm run test:e2e:cbs-client:boundary` — built output + static boundary/failure UX snapshot 회귀입니다.
- `npm run test:e2e:cbs-client:runtime` — `@vscode/test-electron` 기반 Extension Host runtime roundtrip입니다.
- `npm run verify:cbs-client` — static/build contract smoke와 official client E2E를 묶은 release verify entry입니다.

## 문서 수정 규칙

- `packages/vscode` 문서는 VS Code host 경계와 webview bundle 소비 경계를 설명합니다. UI component 세부 의미론은 `packages/webview` README에서 먼저 다룹니다.
- claim은 구현 파일과 테스트 파일을 함께 확인해 고정합니다. 테스트가 없는 현재 구현 설명은 보장처럼 쓰지 않습니다.
- 링크를 추가해야 한다면 이 패키지 내부 또는 하위 경로의 문서만 사용합니다. sibling package나 상위 문서는 경로 문자열로만 언급합니다.
- `packages/webview`와의 관계를 설명할 때도, host/provider가 소유하는 책임과 webview bundle이 소유하는 책임을 섞지 않습니다.

## Scope honesty

이 extension은 공식 VS Code client이자 webview host입니다. CBS server contract의 source-of-truth는 여전히 `cbs-language-server` 패키지이고, webview UI component의 source-of-truth는 `packages/webview`입니다. `packages/vscode`는 두 경계를 VS Code Extension Host에서 조립하고 검증하는 레이어입니다.
