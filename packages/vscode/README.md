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
  "risuaiWorkbench.cbs.server.launchMode": "auto",
  "risuaiWorkbench.cbs.server.installMode": "local-devDependency",
  "risuaiWorkbench.cbs.server.path": "",
  "risuaiWorkbench.cbs.server.luaLsPath": ""
}
```

- `launchMode = "auto"` — selected standalone install mode를 먼저 시도하고, workspace-local server를 찾지 못하면 VSIX에 포함된 embedded server로 fallback합니다. 모노레포 개발 환경에서는 sibling `packages/cbs-lsp/dist/embedded.js`도 사용할 수 있습니다. 잘못된 explicit path override는 fallback으로 숨기지 않습니다.
- `launchMode = "standalone"` — standalone public surface만 사용합니다. fallback 없이 resolution failure UX를 바로 노출합니다.
- `launchMode = "embedded"` — VSIX의 `node_modules/@risuai-workbench/cbs-language-server/dist/embedded.js`를 IPC로 실행합니다. 패키징되지 않은 개발 환경에서는 monorepo server를 사용합니다.
- `installMode = "local-devDependency"` — `<workspace>/node_modules/.bin/cbs-language-server --stdio`
- `installMode = "npx"` — `npx --yes --package @risuai-workbench/cbs-language-server cbs-language-server --stdio`
- `installMode = "global"` — `cbs-language-server --stdio`
- `path` — explicit executable override. 상대 경로는 first workspace folder 기준으로 해석합니다.
- `luaLsPath` — CBS LuaLS sidecar가 사용할 `lua-language-server` executable override입니다.
- standalone 실행 계약: `packages/cbs-lsp/docs/STANDALONE_USAGE.md`
- 지원 환경과 호환성: `packages/cbs-lsp/docs/COMPATIBILITY.md`

## Failure UX policy

client는 resolution 실패를 silent no-op으로 숨기지 않습니다.

- Output Channel에 command plan / resolution failure를 남깁니다.
- VS Code error message에 recovery hint를 노출합니다.
- explicit path override가 잘못되면 fallback으로 감추지 않습니다.
- standalone server 자체의 stdio smoke, extracted workspace E2E, perf budget은 server 패키지가 소유하고, 이 패키지는 공식 VS Code client가 public server surface를 어떻게 선택하고 붙는지만 검증합니다.

## AI agent 연결 (MCP)

Workbench MCP server(`@risuai-workbench/mcp`)는 VSIX에 포함되지 않는 별도 npm 패키지입니다. Claude Code, Codex, OpenCode 같은 agent가 같은 canonical workspace를 읽고 검증·수정하게 할 때 사용합니다. Node.js 20 이상이 필요합니다.

1. Command Palette에서 **Risu Workbench: Copy MCP Config**를 실행합니다.
2. 사용할 client와 형식을 고르면 이 확장 버전과 맞춘 `@risuai-workbench/mcp@<version>`으로 고정된 설정이 클립보드에 복사됩니다.
3. 등록 명령은 workspace root 터미널에서 실행하고, 설정 snippet은 해당 client 설정 파일에 붙여 넣습니다.
4. agent에서 `workbench.smoke`를 호출해 workspace root가 현재 프로젝트인지 확인합니다.

- 구현: `src/commands/mcpConfig.ts`, 테스트: `tests/e2e/mcp-config-boundary.test.ts`
- 고정 버전 `RISU_MCP_PACKAGE_VERSION`은 `packages/risuai-workbench-mcp/package.json`의 `version`과 같아야 하며 boundary test가 이를 검사합니다.
- client별 상세 설정과 문제 해결: `packages/risuai-workbench-mcp/docs/HARNESS_SETUP.md`

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

## VSIX 생성과 배포

저장소 루트에서 Node.js 22와 Rust/`wasm-pack` 빌드 환경을 사용합니다. `wasm:build`는 `npx wasm-pack`을 호출합니다.

```bash
npm ci
npm run package:vsix
npm run verify:vsix
```

- 산출물: `dist/vsix/risu-workbench-vscode-<platform>-<arch>-<version>.vsix`
- 버전 기준: `packages/vscode/package.json`의 `version`. 이 확장은 npm Changesets 버전 관리와 별도입니다.
- 현재 checkout의 core, CBS server, Lua WASM 패키지와 runtime dependencies를 별도 staging 디렉터리에 설치해 포함합니다. 로컬 workspace symlink에 의존하지 않습니다.
- verifier는 VSIX를 저장소 밖에 풀고 런타임 의존성 및 server 동작을 검사합니다. 실제 VS Code UI 설치 테스트를 대체하지 않습니다.
- 네이티브 Tree-sitter 의존성 때문에 범용 VSIX가 아닙니다. 빌드한 호스트의 플랫폼으로 패키징하며 CI는 `linux-x64`(Ubuntu 22.04), `win32-x64`, `darwin-arm64`를 각각 빌드·검증합니다. Linux ARM64, Windows ARM64, Intel macOS, Alpine Linux는 이 배포 matrix에 포함하지 않습니다.
- VSIX는 **확장이 실행되는 호스트**에 맞춰 선택합니다. 로컬 Windows 창은 `win32-x64`, WSL/SSH/container의 Linux x64 Extension Host는 `linux-x64`, Apple Silicon macOS는 `darwin-arm64`입니다.
- Windows에서 소스 빌드는 Git Bash와 네이티브 Node addon 빌드 도구가 필요하며 `npm_config_script_shell=bash` 환경변수를 설정합니다. 일반 사용자는 빌드 도구 없이 해당 플랫폼 VSIX를 설치합니다.

### staging에서 검증하고 main에서 배포하기

1. 변경 브랜치에서 **staging을 대상으로 PR**을 만듭니다. `VSIX release` workflow가 빌드·검증하고 `vscode-vsix-<target>` artifact를 업로드합니다. PR에서는 Release를 게시하지 않습니다.
2. artifact의 VSIX를 내려받아 VS Code의 **Extensions → … → Install from VSIX…**로 설치합니다. 확장 개발 호스트가 아닌 일반 창에서 테스트합니다.
3. 작은 Risu 프로젝트를 열어 Artifact Browser와 편집기를 확인하고, CBS 진단이 나타나는지 확인합니다. **Output → CBS Language Server**에서 server launch 경로를 확인합니다. 실패하면 오류 메시지와 launch 로그를 공유합니다.
4. staging → main PR을 머지합니다. npm 패키지 릴리스 workflow는 기존대로 별도로 실행됩니다.
5. **main에 포함된 배포할 커밋**에 확장 버전과 같은 태그를 생성하고 push합니다. 아래는 첫 `0.1.0` 배포 예입니다.

```bash
git fetch origin main
git tag vscode-v0.1.0 origin/main
git push origin vscode-v0.1.0
```

태그 push는 **공개 GitHub Release 배포를 실행**합니다. 태그/manifest 버전 불일치나 main에 포함되지 않은 커밋은 거부합니다. 빌드·검증 성공 후 `vscode-v0.1.0` Release에 VSIX가 첨부됩니다. npm Release의 latest 표시는 변경하지 않습니다.

`workflow_dispatch` 수동 실행은 브랜치에서 artifact만 만들 때 사용할 수 있습니다. 태그를 선택하면 같은 release gate와 게시 단계가 적용됩니다. 이미 게시된 버전의 파일을 덮어쓰지 않습니다. 수정 배포는 확장 버전을 올리고 새 태그를 사용합니다.

Marketplace/Open VSX 게시는 포함하지 않습니다. GitHub Release 배포에는 기본 `GITHUB_TOKEN`만 사용하며 `VSCE_PAT`가 필요하지 않습니다. LuaLS sidecar는 별도 `lua-language-server` 설치 또는 `risuaiWorkbench.cbs.server.luaLsPath` 설정이 필요합니다.

## 문서 수정 규칙

- `packages/vscode` 문서는 VS Code host 경계와 webview bundle 소비 경계를 설명합니다. UI component 세부 의미론은 `packages/webview` README에서 먼저 다룹니다.
- claim은 구현 파일과 테스트 파일을 함께 확인해 고정합니다. 테스트가 없는 현재 구현 설명은 보장처럼 쓰지 않습니다.
- 링크를 추가해야 한다면 이 패키지 내부 또는 하위 경로의 문서만 사용합니다. sibling package나 상위 문서는 경로 문자열로만 언급합니다.
- `packages/webview`와의 관계를 설명할 때도, host/provider가 소유하는 책임과 webview bundle이 소유하는 책임을 섞지 않습니다.

## Scope honesty

이 extension은 공식 VS Code client이자 webview host입니다. CBS server contract의 source-of-truth는 여전히 `cbs-language-server` 패키지이고, webview UI component의 source-of-truth는 `packages/webview`입니다. `packages/vscode`는 두 경계를 VS Code Extension Host에서 조립하고 검증하는 레이어입니다.
