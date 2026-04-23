# Risu Workbench VS Code client

`packages/vscode`는 `cbs-language-server`의 공식 VS Code client입니다. 이 문서는 extension이 standalone CBS LSP를 어떻게 소비하는지, 그리고 monorepo 개발 환경에서만 허용하는 embedded fallback 경계를 설명합니다.

## Launch contract

### Settings

```json
{
  "risuWorkbench.cbs.server.launchMode": "auto",
  "risuWorkbench.cbs.server.installMode": "local-devDependency",
  "risuWorkbench.cbs.server.path": ""
}
```

- `launchMode = "auto"` — selected standalone install mode를 먼저 시도하고, `local-devDependency`가 workspace에서 해석되지 않을 때만 embedded monorepo module로 fallback합니다.
- `launchMode = "standalone"` — standalone public surface만 사용합니다. fallback 없이 resolution failure UX를 바로 노출합니다.
- `launchMode = "embedded"` — monorepo 개발용 `packages/cbs-lsp/dist/server.js` IPC launch를 강제합니다.

- `installMode = "local-devDependency"` — `<workspace>/node_modules/.bin/cbs-language-server --stdio`
- `installMode = "npx"` — `npx cbs-language-server --stdio`
- `installMode = "global"` — `cbs-language-server --stdio`
- `path` — explicit executable override. 상대 경로는 first workspace folder 기준으로 해석합니다.

## Failure UX policy

client는 resolution 실패를 silent no-op으로 숨기지 않습니다.

- Output Channel에 command plan / resolution failure를 남깁니다.
- VS Code error message에 recovery hint를 노출합니다.
- explicit path override가 잘못되면 fallback으로 감추지 않습니다.

## Product verify loop

`packages/vscode`는 `npm run verify:cbs-client`로 공식 client boundary를 제품 수준에서 고정합니다. 이 verify loop는 built output 기준으로 아래 4가지 시나리오를 회귀 검증합니다.

- standalone `local-devDependency` — first workspace folder를 launch cwd/root로 전달하고, stdio transport + CBS selector/file watcher contract를 유지합니다.
- auto embedded fallback — standalone preflight가 실패할 때만 monorepo embedded IPC module로 내려갑니다.
- invalid explicit path override — silent fallback 없이 error message / Output / Settings 복구 UX를 노출합니다.
- multi-root reduced — VS Code-family client preview는 `initialize.workspaceFolders` 전체를 유지하지만, launch resolver의 path/cwd 결정은 first workspace folder만 사용합니다.

Source-of-truth는 `packages/vscode/src/lsp/cbsLanguageClientBoundary.ts`와 `packages/vscode/scripts/verify-cbs-client.mjs`입니다.

## Product document handoff

- standalone install/attach/runtime config: `packages/cbs-lsp/docs/STANDALONE_USAGE.md`
- compatibility / degraded policy: `packages/cbs-lsp/docs/COMPATIBILITY.md`
- LuaLS companion install: `packages/cbs-lsp/docs/LUALS_COMPANION.md`
- troubleshooting: `packages/cbs-lsp/docs/TROUBLESHOOTING.md`
- agent/automation contract: `packages/cbs-lsp/docs/AGENT_INTEGRATION.md`

## Scope honesty

이 extension은 공식 client일 뿐, server contract의 source-of-truth는 여전히 `cbs-language-server` 패키지입니다. standalone-first가 기본이고, embedded launch는 monorepo 개발을 위한 보조 모드로만 유지합니다.
