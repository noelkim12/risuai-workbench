<!--
  Compatibility matrix for cbs-language-server runtime/operator support boundaries.
  @file packages/cbs-lsp/docs/COMPATIBILITY.md
-->

# CBS Language Server compatibility matrix

이 문서는 `cbs-language-server`의 product-level 지원 범위와 degraded mode를 한 곳에 모아 둔 source-of-truth입니다. README는 요약을, `experimental.cbs.operator.docs.compatibility`와 trace `availability.operator.docs.compatibility`는 이 문서 경로를 그대로 노출합니다.

## Matrix

| Axis | Shape | Status | Behavior | Recovery / operator note |
| --- | --- | --- | --- | --- |
| Node runtime | `node >= 20` | Supported | package `engines.node` 범위 안에서 standalone CLI, stdio server, test/build contract를 유지합니다. | 운영 환경도 Node 20 이상으로 고정하세요. |
| Node runtime | `node < 20` | Unsupported | package `engines.node` 바깥이라 boot/build/test contract를 보장하지 않습니다. | Node 20 이상으로 업그레이드하세요. |
| LuaLS companion | `--luals-path` override 또는 PATH candidate(`lua-language-server`, `lua-language-server.exe`)로 executable 발견 + sidecar ready | Supported | `.risulua` hover/completion proxy가 활성화되고, CBS fragment 기능과 함께 동작합니다. | LuaLS는 companion executable입니다. cbs-lsp가 내장 다운로드/관리하지 않습니다. |
| LuaLS companion | executable missing / sidecar crashed / unhealthy | Degraded | CBS fragment 기능은 그대로 유지되고 `.risulua` companion 기능만 unavailable/degraded로 남습니다. runtime failure mode key는 `luals-unavailable`입니다. crash 뒤에는 bounded auto-restart를 먼저 시도합니다. | LuaLS를 설치하고 PATH 또는 `--luals-path`를 확인하세요. 자동 재기동 budget 이후에도 degraded 상태가 남으면 서버를 재시작하거나 다시 initialize하세요. |
| LuaLS companion | embedded Lua runtime, auto-downloaded LuaLS | Unsupported | 현재 제품 범위에는 포함되지 않습니다. | 사용자 설치 companion 전략을 유지합니다. |
| Workspace shape | single extracted workspace | Supported | runtime-config workspace override, `workspaceFolders[0]`, `rootUri`, document-path fallback 순서로 root를 정하고 Layer 1/3 workspace 기능을 활성화합니다. | extracted workspace 하나당 프로세스 하나를 권장합니다. |
| Workspace shape | initialize 시 root 미해결, 이후 canonical `.risu*` 문서 경로로 root 역산 가능 | Degraded | 서버는 먼저 standalone/CBS-local 기능으로 시작하고, root를 알게 되면 workspace graph 기능을 다시 붙입니다. failure mode key는 `workspace-root-unresolved`입니다. | `--workspace`, `CBS_LSP_WORKSPACE`, runtime config, `workspaceFolders`/`rootUri`, 또는 canonical `.risu*` 문서 open으로 root를 명시하세요. |
| Workspace shape | multi-root workspace | Degraded | 현재는 `workspaceFolders[0]`만 startup root로 사용하고 나머지는 무시합니다. failure mode key는 `multi-root-reduced`입니다. | workspace마다 프로세스를 분리하거나, canonical root를 첫 번째 folder로 보내세요. |
| Workspace shape | client without watched-file dynamic registration | Degraded | open/change/close 기반 갱신만 동작하고 외부 파일 변경 push는 비활성화됩니다. failure mode key는 `watched-files-client-unsupported`입니다. | watched-file dynamic registration을 지원하는 client를 쓰거나, 외부 변경 후 문서를 다시 열어 주세요. |
| Workspace shape | productized multi-root aggregation | Unsupported | 여러 workspace folder를 하나의 graph/service surface로 합치는 orchestration은 아직 없습니다. | 현재는 first-workspace-folder policy를 전제로 운영합니다. |
| VS Code client attach | standalone-first (`local-devDependency` / `npx` / `global`) + embedded dev fallback | Supported | 공식 `packages/vscode` client는 public `cbs-language-server` surface를 먼저 소비하고, `auto + local-devDependency`에서만 monorepo embedded module fallback을 사용합니다. | 일반 사용자는 standalone mode를 기준으로 운영하고, embedded fallback은 monorepo 개발 보조 수단으로만 사용하세요. |
| VS Code client attach | invalid explicit path override | Unsupported | explicit `risuWorkbench.cbs.server.path`가 잘못되면 client는 silent fallback 대신 resolution failure UX를 띄웁니다. | path override를 비우거나 유효한 executable로 수정하세요. |

## Operator summary

- **지원 보장선**: Node 20+, single extracted workspace, user-installed LuaLS companion.
- **정직한 degraded mode**: LuaLS 미설치/충돌, startup root 미해결, multi-root 축소, watched-file 미지원은 모두 서버를 죽이지 않고 runtime payload failure mode로 노출합니다.
- **의도적 비지원**: embedded LuaLS, auto-download, productized multi-root aggregation, Node 20 미만.
- **VS Code client 경계**: 공식 client는 standalone-first contract를 따르고, explicit path override 오류는 fallback으로 숨기지 않습니다.

## Related source-of-truth documents

- `packages/cbs-lsp/README.md`
- `packages/cbs-lsp/docs/AGENT_INTEGRATION.md`
- `packages/cbs-lsp/docs/LUALS_COMPANION.md`
- `packages/cbs-lsp/docs/STANDALONE_USAGE.md`
- `packages/cbs-lsp/docs/TROUBLESHOOTING.md`
- `packages/vscode/README.md`
