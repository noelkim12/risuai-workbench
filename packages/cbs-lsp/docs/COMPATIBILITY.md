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
| Workspace symbol surface | resolved workspace root with Layer 1/3 state | Supported | `workspace/symbol`은 variables / CBS local funcs / lorebook entries / prompt sections를 prefix/fuzzy query로 검색하고, 결과는 query rank → symbol source → name → container → URI 순으로 deterministic ordering을 유지합니다. | workspace root가 잡힌 뒤 symbol search를 수행하세요. |
| Workspace symbol surface | root unresolved or reduced multi-root state | Degraded | `workspace/symbol`은 현재 materialized workspace state만 읽습니다. root가 아직 없으면 빈 결과를 반환하고, multi-root에서는 first-workspace-folder policy로 구성된 state만 authoritative하게 노출합니다. | `--workspace` 또는 첫 번째 `workspaceFolders[0]`를 canonical extracted workspace로 맞추세요. |
| Workspace shape | client without watched-file dynamic registration | Degraded | open/change/close 기반 갱신만 동작하고 외부 파일 변경 push는 비활성화됩니다. failure mode key는 `watched-files-client-unsupported`입니다. | watched-file dynamic registration을 지원하는 client를 쓰거나, 외부 변경 후 문서를 다시 열어 주세요. |
| LSP position encoding | client omits `general.positionEncodings` or includes `utf-16` | Supported | 서버는 initialize result에 `capabilities.positionEncoding = 'utf-16'`를 명시하고, `position.ts`/fragment remap/semantic token 계산도 JavaScript string index 기반 UTF-16 code unit 좌표를 그대로 사용합니다. 한글은 BMP 1 code unit, 이모지/서로게이트 페어는 2 code unit 기준으로 range를 계산합니다. | 별도 설정 없이 UTF-16 좌표를 그대로 소비하면 됩니다. |
| LSP position encoding | client advertises only `utf-8` / `utf-32` and excludes `utf-16` | Unsupported | cbs-lsp는 현재 UTF-16 한 가지 좌표 체계만 구현/광고합니다. non-UTF-16 client와의 on-the-fly range 재인코딩은 아직 없습니다. | UTF-16을 지원하는 client를 사용하거나, client 쪽 position encoding 설정을 UTF-16으로 맞추세요. |
| Formatting contract | routed clean CBS fragment | Supported | `textDocument/formatting`은 pretty formatter가 아니라 canonical serializer입니다. macro spacing, shorthand close tag, block header argument 표기만 안정적인 fragment text shape로 rewrite하며, pure block body text는 pretty-print하지 않습니다. | 들여쓰기/줄바꿈/option-aware layout이 아니라 canonical rewrite를 기대하세요. |
| Formatting contract | newline on-type inside one clean CBS fragment | Supported | `textDocument/onTypeFormatting`은 `\n`만 safe trigger로 광고하고, 요청 위치가 단일 clean CBS fragment 내부이며 반환 edit가 현재 줄/다음 줄과 교차할 때만 line-local canonical edit를 반환합니다. `}` / `/` trigger는 현재 canonical serializer contract에서 과한 rewrite 위험이 있어 광고하지 않습니다. | on-type은 newline-only editor polish로 이해하고, block-close pretty indentation은 future formatter contract를 기다려 주세요. |
| Formatting contract | malformed fragment / unsupported artifact / fragmentless host / host-fragment safety violation | Supported | formatting request는 오류 대신 safe no-op(`[]`)으로 degrade합니다. multi-fragment host에서도 document formatting은 canonical text가 바뀐 routed fragment만 rewrite하고 나머지 host text는 그대로 둡니다. range/on-type formatting은 단일 fragment 내부 요청이 아니면 no-op입니다. | malformed fragment를 먼저 복구하거나, CBS-bearing artifact와 fragment 범위를 확인하세요. |
| Formatting contract | pretty indentation, line wrapping, `tabSize` / `insertSpaces` 반영, block-close on-type formatting 기대 | Unsupported | 현재 formatter contract는 full editor polish를 보장하지 않습니다. protocol option은 받아도 layout engine으로 쓰지 않으며 `textDocument/onTypeFormatting`도 newline-only vertical slice까지만 제공합니다. | pretty formatting이 필요하면 future formatter 확장 항목을 기준으로 별도 구현이 필요합니다. |
| Workspace shape | productized multi-root aggregation | Unsupported | 여러 workspace folder를 하나의 graph/service surface로 합치는 orchestration은 아직 없습니다. | 현재는 first-workspace-folder policy를 전제로 운영합니다. |
| VS Code client attach | standalone-first (`local-devDependency` / `npx` / `global`) + embedded dev fallback | Supported | 공식 `packages/vscode` client는 public `cbs-language-server` surface를 먼저 소비하고, `auto + local-devDependency`에서만 monorepo embedded module fallback을 사용합니다. `verify:cbs-client`는 boundary snapshot suite로 standalone stdio / embedded IPC / selector-watcher / failure-UX contract를, extension-host runtime suite로 explicit standalone path override와 auto embedded fallback을 통한 real LanguageClient initialize → didOpen → hover → shutdown loop를 함께 회귀 검증합니다. | 일반 사용자는 standalone mode를 기준으로 운영하고, embedded fallback은 monorepo 개발 보조 수단으로만 사용하세요. |
| VS Code client attach | invalid explicit path override | Unsupported | explicit `risuWorkbench.cbs.server.path`가 잘못되면 client는 silent fallback 대신 resolution failure UX를 띄웁니다. `verify:cbs-client`는 Output/Settings action이 붙은 failure surface를 함께 고정합니다. | path override를 비우거나 유효한 executable로 수정하세요. |
| Client capability profile | Neovim minimum (nvim-lspconfig representative) + LuaLS ready | Supported | watched-file dynamic registration, codeAction literal support, prepareRename, publishDiagnostics versionSupport를 활용합니다. codeLens refresh와 relativePattern은 없지만 이 조합에서는 추가 failure mode가 활성화되지 않습니다. | LuaLS companion이 healthy하면 full capability를 사용할 수 있습니다. |
| Client capability profile | Zed minimum (Zed editor representative) + LuaLS ready | Supported | Neovim profile에 codeLens refresh와 watched-file relativePatternSupport를 추가합니다. 이 조합에서도 failure mode가 활성화되지 않습니다. | LuaLS companion이 healthy하면 full capability를 사용할 수 있습니다. |
| Client capability profile | Emacs minimum (Eglot representative) without workspace/LuaLS | Degraded | codeAction literal support만 있고 watched-file dynamic registration, prepareRename, publishDiagnostics versionSupport, codeLens refresh, workspaceFolders가 없습니다. `luals-unavailable`, `watched-files-client-unsupported`, `workspace-root-unresolved`가 함께 활성화될 수 있습니다. | workspaceFolders와 watched-file dynamic registration을 활성화하거나, `--workspace`/`CBS_LSP_WORKSPACE`로 root를 명시하세요. |
| Client capability profile | VS Code-family minimum (VS Code/Cursor representative) + LuaLS ready | Degraded | Zed profile과 동일한 capability에 multi-root workspaceFolders를 보냅니다. `multi-root-reduced` failure mode가 활성화됩니다. | single extracted workspace로 `workspaceFolders[0]`를 canonical root로 맞추거나, 프로세스당 하나의 workspace folder를 사용하세요. |

> **Note on representative profiles**: 위 profile은 테스트 fixture에서 사용하는 minimum capability snapshot이며, 실제 client payload는 더 많은 capability를 포함할 수 있습니다. fixture 기준 광고 결과와 graceful degradation 경로는 `packages/cbs-lsp/tests/fixtures/capability-matrix.ts`와 `tests/capability-matrix.test.ts`에서 source-of-truth로 고정되어 있습니다.

## Operator summary

- **지원 보장선**: Node 20+, single extracted workspace, user-installed LuaLS companion.
- **정직한 degraded mode**: LuaLS 미설치/충돌, startup root 미해결, multi-root 축소, watched-file 미지원은 모두 서버를 죽이지 않고 runtime payload failure mode로 노출합니다.
- **workspace/symbol 계약**: variables / CBS local funcs / lorebook entries / prompt sections를 prefix/fuzzy query로 찾되, unresolved root에서는 빈 결과로, multi-root에서는 first-workspace-folder policy 기준 state만 authoritative source로 취급합니다.
- **좌표 계약**: initialize capability와 내부 offset/position 계산은 모두 UTF-16 code unit 기준으로 고정합니다. UTF-16을 받지 않는 client는 현재 범위 밖입니다.
- **formatting 계약**: 현재 formatting은 canonical serializer + safe no-op 경계를 보장하고, on-type formatting은 newline-only 단일 fragment vertical slice까지만 제공합니다. pretty indentation, option-aware layout, block-close on-type polish는 아직 범위 밖입니다.
- **의도적 비지원**: embedded LuaLS, auto-download, productized multi-root aggregation, Node 20 미만.
- **VS Code client 경계**: 공식 client는 standalone-first contract를 따르고, explicit path override 오류는 fallback으로 숨기지 않습니다. multi-root에서는 VS Code-family initialize preview가 `workspaceFolders` 전체를 유지해도 launch path/cwd 결정은 first workspace folder만 사용하며, 이 축소 경계는 `verify:cbs-client` boundary suite와 `packages/vscode/src/lsp/cbsLanguageClientBoundary.ts`에서 함께 고정합니다. 별도의 extension-host runtime suite는 standalone explicit path override와 auto embedded fallback이 각각 실제 LanguageClient roundtrip과 cleanup contract를 유지하는지도 확인합니다.

## Related source-of-truth documents

- `packages/cbs-lsp/README.md`
- `packages/cbs-lsp/docs/AGENT_INTEGRATION.md`
- `packages/cbs-lsp/docs/LUALS_COMPANION.md`
- `packages/cbs-lsp/docs/STANDALONE_USAGE.md`
- `packages/cbs-lsp/docs/TROUBLESHOOTING.md`
- `packages/vscode/README.md`
