# risuai-workbench-mcp tools

`packages/risuai-workbench-mcp/src/tools/facade/intent-route.ts`는 외부 요청 intent를 facade/action flow로 분기하는 주요 tool router입니다.

`packages/risuai-workbench-mcp/src/tools/`는 RisuAI Workbench MCP 서버의 domain handler 구현을 도메인별로 모아 둔 영역입니다. 기본 외부 MCP surface는 `src/tools/facade/`와 `src/server.ts`가 등록하는 8개 facade tool이며, 이 디렉토리의 domain handler들은 ActionRegistry 내부 action 또는 legacy/dev-mode direct MCP tool의 구현으로 재사용됩니다.

## 구조

```text
src/tools/
├── index.ts                 # 전체 tool domain barrel
├── inspect/                 # path / artifact inspection
├── validate/                # artifact structure validation, path build, test hints
├── patch/                   # no-write patch preview + patch plan apply entry
├── mutation/                # structured source artifact mutation handlers + gated core workflows
├── analyze/                 # read-only analyze / impact query tools
└── wiki/                    # wiki search, preview, generated wiki bootstrap/refresh
```

도메인별 `index.ts`는 해당 폴더의 handler를 named export하고, 루트 `src/tools/index.ts`는 다음 도메인을 한 번에 재수출합니다.

```ts
export * from './inspect';
export * from './validate';
export * from './patch';
export * from './mutation';
export * from './analyze';
export * from './wiki';
```

## Facade registration model

Default `tools/list` exposes exactly these 8 facade tools:

```text
workbench.smoke
workbench.route_intent
workbench.catalog
workbench.prepare_action
workbench.run_action
workbench.context
workbench.patch_preview
workbench.patch_apply
```

Normal agent flow is:

```text
workbench.route_intent -> workbench.catalog -> workbench.prepare_action -> workbench.run_action
```

For extract/import requests, keep the same facade flow and call `workbench.run_action` with `actionId: "core.run_extract"`. `dryRun: true` on `workbench.run_action` is only a facade invocation dry-run. For `core.run_extract`, it confirms the action exists and args match the schema, then returns without calling `handleRunExtract()`. It does not check path safety, derive the output fallback, run `risu-core`, or create files, so do not describe it as an extraction preview.

Mutation flow is:

```text
workbench.route_intent -> workbench.catalog -> workbench.prepare_action -> workbench.patch_preview -> workbench.patch_apply
```

이 디렉토리의 domain handler는 대부분 `src/actions/adapters/*`에서 internal action으로 등록되고, facade tool이 ActionRegistry를 통해 실행합니다. 기존 direct MCP tool name(`workbench.inspect_path`, `workbench.query_*`, `workbench.apply_patch_plan` 등)은 default `tools/list`에 노출되지 않습니다. Legacy direct MCP exposure is available only when the server starts with `RISU_MCP_EXPOSE_LEGACY_TOOLS=1` for development or migration testing.

Facade tool 등록은 `packages/risuai-workbench-mcp/src/server.ts`의 facade registration path에서 수행합니다. Legacy/dev-mode direct tool 등록도 `src/server.ts`에 남아 있지만 env gate 뒤에 있습니다.

- Legacy/dev-mode MCP tool name은 `workbench.{verb}_{noun}` 형식입니다.
- Handler 함수명은 `handle{Verb}{Noun}` 형식입니다.
- Internal action `inputSchema`는 `src/actions/schemas/*`의 Zod schema를 사용합니다. Legacy/dev-mode direct MCP registration uses Zod raw shapes.
- Handler 결과는 `createJsonToolResult(result)`를 통해 MCP text JSON과 `structuredContent`를 함께 반환합니다.
- Stable envelope tools should declare `outputSchema` from `src/contracts/output-schemas.ts`.
- Tool metadata와 구현 상태는 `src/registry/index.ts`의 `WORKBENCH_REGISTRY`와 `IMPLEMENTED_ROADMAP_TOOL_NAMES`가 관리합니다.

응답은 transport exception 대신 구조화된 envelope를 반환하는 것을 기본 원칙으로 합니다.

| 용도 | 대표 envelope | 설명 |
| --- | --- | --- |
| read-only / preview | `DiagnosticEnvelope` | `schema: risuai-workbench-mcp.diagnostics`, `status`, `diagnostics`, optional `data` 포함 |
| mutation | `MutationResultEnvelope` 또는 `DiagnosticEnvelope` | `schema: risuai-workbench-mcp.mutation-result`, `changedFiles`, `postValidation`, `mutationId`, `resourceLinks` 포함 |

Mutation 계열 handler는 대체로 `unknown` input을 받은 뒤 내부 parse 함수와 `createUnknownFieldDiagnosticEnvelope()`로 fail-closed 검증을 수행합니다. 실제 write target은 `evaluateMutationSafetyGate()`에서 workspace path로 resolve됩니다.

### Canonical extract/import path

For `.risum`, `.charx`, and `.risup` extraction/import requests, the default external MCP surface uses `workbench.run_action` with internal action id `core.run_extract`. `.risuchar` is a canonical workspace root marker, not an external archive input. The legacy direct tool name `workbench.run_extract` appears in this handler catalog only for maintainer traceability and env-gated development mode.

## Legacy/dev-mode handler catalog

이 목록은 maintainer용 domain handler catalog입니다. 표의 `Tool` 값은 legacy/dev-mode direct MCP tool name 또는 historical surface name이며, default external `tools/list`가 아닙니다. Default external `tools/list`는 위의 8개 facade tool만 포함합니다.

현재 registry 기준 domain handler coverage는 legacy direct name 기준 비즈니스 로직 tool 48개와 creative tool 26개입니다. `workbench.smoke`는 facade startup smoke tool이며 `src/tools/`가 아니라 `src/server.ts`에서 직접 등록됩니다.

### Startup

| Tool | Mutates | 구현 위치 | 기능 |
| --- | ---: | --- | --- |
| `workbench.smoke` | no | `src/server.ts` | 서버 기동 상태, workspace root, mutation mode를 확인하는 최소 smoke 응답을 반환합니다. |

### Inspect

| Tool | Mutates | Handler | 구현 파일 | 기능 |
| --- | ---: | --- | --- | --- |
| `workbench.inspect_path` | no | `handleInspectPath` | `inspect/inspect-path.ts` | workspace-relative path를 안전하게 해석하고 `canonical-file`, `_order.json`, marker, directory, structured JSON 등 역할을 분류합니다. |
| `workbench.inspect_artifact` | no | `handleInspectArtifact` | `inspect/inspect-artifact.ts` | artifact root의 contract, canonical files, marker files, 관련 문서 요약을 반환합니다. |

### Validate

| Tool | Mutates | Handler | 구현 파일 | 기능 |
| --- | ---: | --- | --- | --- |
| `workbench.validate_artifact` | no | `handleValidateArtifact` | `validate/validate-artifact.ts` | artifact root 전체 구조를 core discovery로 검증하고 marker 누락 같은 구조 문제를 진단합니다. |
| `workbench.validate_path` | no | `handleValidatePath` | `validate/validate-path.ts` | canonical directory, suffix, stem policy를 검증합니다. |
| `workbench.validate_order` | no | `handleValidateOrder` | `validate/validate-order.ts` | `_order.json` 엔트리와 실제 canonical file 목록의 누락/불일치/비정상 JSON을 검증합니다. |
| `workbench.validate_root_markers` | no | `handleValidateRootMarkers` | `validate/validate-root-markers.ts` | `.risuchar`, `.risumodule` root marker의 존재, 충돌, schema 상태를 검증합니다. |
| `workbench.validate_metadata` | no | `handleValidateMetadata` | `validate/validate-metadata.ts` | structured metadata JSON의 존재, 파싱 가능 여부, 객체 형태, legacy/deferred surface를 판정합니다. |
| `workbench.validate_frontmatter` | no | `handleValidateFrontmatter` | `validate/validate-frontmatter.ts` | editor frontmatter delimiter, field schema, unknown field, round-trip 위험을 검증합니다. |
| `workbench.build_path` | no | `handleBuildPath` | `validate/build-path.ts` | `target`, `artifact`, `targetName`, `stem` 입력으로 canonical workspace-relative path를 생성합니다. |
| `workbench.suggest_tests` | no | `handleSuggestTests` | `validate/suggest-tests.ts` | 변경 path에 대한 focused test 후보를 제안하는 surface입니다. 현재는 제한적인 info diagnostic 중심 MVP입니다. |

### Wiki read / preview

| Tool | Mutates | Handler | 구현 파일 | 기능 |
| --- | ---: | --- | --- | --- |
| `workbench.search_wiki` | no | `handleSearchWiki` | `wiki/search-wiki.ts` | docs/wiki/rules 검색 surface입니다. 현재는 제한적인 info diagnostic 중심 MVP입니다. |
| `workbench.plan_wiki_update` | no | `handlePlanWikiUpdate` | `wiki/wiki-patch-preview.ts` | generated wiki refresh 대상과 write scope를 preview하고 patch plan resource link를 제공합니다. |
| `workbench.diff_wiki` | no | `handleDiffWiki` | `wiki/wiki-patch-preview.ts` | generated wiki diff 요청 경로가 write-protect boundary 안인지 확인하고 차이 요약 surface를 반환합니다. |

### Patch preview / apply

| Tool | Mutates | Handler | 구현 파일 | 기능 |
| --- | ---: | --- | --- | --- |
| `workbench.suggest_patch` | no | `handleSuggestPatch` | `patch/suggest-patch.ts` | 여러 structured patch operation을 no-write `PatchPlan`으로 감싸고 patch store에 저장합니다. |
| `workbench.suggest_order_patch` | no | `handleSuggestOrderPatch` | `patch/suggest-order-patch.ts` | `_order.json`에 대한 `order.insert`, `order.move`, `order.remove` preview와 unified diff를 생성합니다. |
| `workbench.suggest_frontmatter_patch` | no | `handleSuggestFrontmatterPatch` | `patch/suggest-frontmatter-patch.ts` | body를 보존하는 frontmatter `set`/`remove` preview를 생성하고 malformed frontmatter repair preview를 diagnostic과 함께 반환합니다. |
| `workbench.suggest_root_marker_patch` | no | `handleSuggestRootMarkerPatch` | `patch/suggest-root-marker-patch.ts` | `.risuchar`/`.risumodule` 등 root marker 생성 또는 복구 patch preview를 만듭니다. |
| `workbench.apply_patch_plan` | yes | `handleApplyPatchPlan` | `patch/apply-patch-plan.ts` | 저장된 `patchPlanId`를 조회한 뒤 지원 operation을 적용합니다. |

Default callers should use `workbench.patch_preview` followed by `workbench.patch_apply`. The legacy/dev-mode `workbench.apply_patch_plan` handler directly supports `text.replace`, `file.create`, `order.insert`, `order.move`, `order.remove`, `frontmatter.set`, and `frontmatter.remove`. `file.move`, `file.delete`, and `json.set` use the matching internal mutation action or legacy/dev-mode dedicated tool.

### Direct mutation

| Tool | Mutates | Handler | 구현 파일 | 기능 |
| --- | ---: | --- | --- | --- |
| `workbench.edit_order` | yes | `handleEditOrder` | `mutation/edit-order.ts` | `_order.json`에 structured insert/move/remove를 preview 또는 commit으로 적용합니다. |
| `workbench.edit_frontmatter` | yes | `handleEditFrontmatter` | `mutation/edit-frontmatter.ts` | artifact body를 보존하면서 frontmatter field를 set/remove합니다. malformed commit은 `force: true` 없이 거부합니다. |
| `workbench.edit_metadata` | yes | `handleEditMetadata` | `mutation/edit-metadata.ts` | metadata/root marker JSON에 `json.set` operation을 적용하며 `allowedFields` 정책을 검사합니다. |
| `workbench.create_artifact` | yes | `handleCreateArtifact` | `mutation/create-artifact.ts` | canonical path에 새 artifact 파일을 만들고 optional `_order.json` insertion을 수행합니다. |
| `workbench.run_extract` | yes | `handleRunExtract` | `mutation/run-extract.ts` | `risu-core extract` workflow를 안전 게이트 뒤에서 실행해 charx/risum/risup 등을 canonical workspace로 추출한 뒤, `risu-core analyze <outDir> --wiki --wiki-root <outDir>/wiki`를 이어 실행해 analysis 리포트와 wiki를 갱신합니다. `outDir`은 workspace-relative 신규 디렉터리여야 하며, 기본 wiki root는 `outDir` 하위의 `wiki/`입니다. |
| `workbench.run_scaffold` | yes | `handleRunScaffold` | `mutation/run-scaffold.ts` | `risu-core scaffold` workflow를 안전 게이트 뒤에서 실행해 charx/module/preset 프로젝트 골격을 생성합니다. |

### Analyze / impact query

| Tool | Mutates | Handler | 구현 파일 | 기능 |
| --- | ---: | --- | --- | --- |
| `workbench.refresh_analyze_snapshot` | no | `handleRefreshAnalyzeSnapshot` | `analyze/refresh-analyze-snapshot.ts` | source artifact를 수정하지 않고 source hash 기반 analyze snapshot metadata를 재계산합니다. |
| `workbench.query_variable_flow` | no | `handleQueryVariableFlow` | `analyze/query-analyze.ts` | core variable-flow analyzer 결과와 snapshot metadata를 반환합니다. |
| `workbench.query_variable` | no | `handleQueryVariable` | `analyze/query-analyze.ts` | 단일 변수의 존재 여부, readers, writers, events, diagnostics를 조회합니다. |
| `workbench.query_lua_analysis` | no | `handleQueryLuaAnalysis` | `analyze/query-analyze.ts` | Lua source를 분석해 functions, handlers, API calls, state access, correlation summary를 JSON-friendly view로 반환합니다. |
| `workbench.query_lua_call_graph` | no | `handleQueryLuaCallGraph` | `analyze/query-analyze.ts` | Lua handler/function call graph와 called-by 관계를 정규화해 반환합니다. |
| `workbench.query_lua_state_access` | no | `handleQueryLuaStateAccess` | `analyze/query-analyze.ts` | Lua state/chat variable read/write occurrence와 read/write summary를 조회합니다. |
| `workbench.query_button_actions` | no | `handleQueryButtonActions` | `analyze/query-analyze.ts` | `onButtonClick` handler 후보와 handler 내부 호출 목록을 조회합니다. |
| `workbench.query_relationship_network` | no | `handleQueryRelationshipNetwork` | `analyze/query-analyze.ts` | CBS/Lua variable flow를 graph-like nodes/edges view로 정규화합니다. |
| `workbench.query_prompt_chain` | no | `handleQueryPromptChain` | `analyze/query-analyze.ts` | prompt template dependency, issue, token estimate, self-contained variables를 조회합니다. |
| `workbench.query_composition_conflicts` | no | `handleQueryCompositionConflicts` | `analyze/query-analyze.ts` | charx/module/preset composition conflict와 compatibility summary를 조회합니다. |
| `workbench.query_dead_code_findings` | no | `handleQueryDeadCodeFindings` | `analyze/query-analyze.ts` | variable-flow, lorebook, regex metadata 기반 dead-code/cleanup 후보를 반환합니다. |
| `workbench.query_token_budget` | no | `handleQueryTokenBudget` | `analyze/query-analyze.ts` | token component별 budget summary와 threshold warning을 조회합니다. |
| `workbench.query_risulua_api` | no | `handleQueryRisuLuaApi` | `analyze/query-risulua-api.ts` | RisuLua host function catalog에서 category, access tier, signature, docs, related functions, reference URI를 조회합니다. |

`analyze/query-analyze.ts`는 여러 query tool이 snapshot 처리, Lua source 해석, Map/Set JSON 정규화를 공유하기 때문에 한 파일에 모여 있습니다.

### Advanced mutation

| Tool | Mutates | Handler | 구현 파일 | 기능 |
| --- | ---: | --- | --- | --- |
| `workbench.move_artifact` | yes | `handleMoveArtifact` | `mutation/move-artifact.ts` | artifact rename/move를 수행합니다. suffix 보존, optional order update, journal 기록을 수행합니다. |
| `workbench.delete_artifact` | yes | `handleDeleteArtifact` | `mutation/delete-artifact.ts` | artifact delete tool입니다. optional backup, optional order cleanup, journal 기록을 수행합니다. |
| `workbench.ensure_wiki_root` | yes | `handleEnsureWikiRoot` | `wiki/ensure-wiki-root.ts` | wiki가 없거나 bootstrap 파일이 누락된 경우 generated-only allowlist 안의 최소 wiki root 파일만 생성합니다. |
| `workbench.refresh_wiki` | yes | `handleRefreshWiki` | `wiki/refresh-wiki.ts` | generated wiki allowlist 경로만 갱신합니다. core write-protect helper와 post-validation을 사용합니다. |
| `workbench.rollback_mutation` | yes | `handleRollbackMutation` | `mutation/rollback-mutation.ts` | journal에 충분한 inverse state가 있는 mutation만 rollback합니다. |

## 입력 스키마 요약

자세한 Zod schema는 `src/server.ts`가 source of truth입니다. 대표 입력은 다음과 같습니다.

| Tool | 주요 입력 |
| --- | --- |
| `inspect_path`, `validate_path`, `validate_metadata`, `validate_frontmatter` | `path` |
| `inspect_artifact`, `validate_artifact` | `artifactRoot` |
| `validate_order` | `directory` |
| `build_path` | `target`, `artifact`, optional `targetName`, `stem` |
| `suggest_patch` | `intent`, `operations` |
| `suggest_order_patch`, `edit_order` | order path/directory, `insert`/`move`/`remove` operations |
| `suggest_frontmatter_patch` | `path`, optional `set`, `remove`, `preserveBody` |
| `apply_patch_plan` | `patchPlanId`, optional `options` |
| mutation handlers / legacy-dev-mode direct tools | Most structured mutation tools accept `mode: preview|commit`, optional `expectedHash`, `postValidate`; core workflows below execute directly and do not accept `mode`. |
| `ensure_wiki_root` | optional `wikiRoot`(현재 `wiki`만 지원), `mode`, `postValidate` |
| `run_extract` | `sourcePath`, `outDir`, optional `type`, RisuLua options, `postValidate` |
| `run_scaffold` | `type`, `name`, optional `outDir`, `creator`, `namespace`, `risuluaMode`, `postValidate` |
| analyze query tools | `sourcePath` 또는 `sourceText`, optional `previousSnapshot`, `stalePolicy`, tool별 analyzer payload |

## Safety notes

- path input은 `resolveSafeWorkspacePath()`로 absolute path로 해석됩니다. 상대 경로는 startup context 기준으로 해석합니다.
- Legacy/dev-mode direct handler name `workbench.run_extract` executes the extract handler, which creates the extract output directory and then creates or updates the child `wiki/` directory. This is handler behavior documentation, not default callable guidance; the wiki update scope is listed in `postExtractAnalyze.defaultWikiRoot`.
- `workbench.run_action` dry-run for `core.run_extract` stops before this handler path. It validates only ActionRegistry lookup and input schema, not workspace path safety, output fallback, command availability, `risu-core` execution, or file creation.
- generated wiki write는 allowlist boundary를 통과해야 합니다.
- stale state, unknown field, invalid input은 파일 변경 없이 structured diagnostic 또는 rejected mutation result로 반환됩니다.
- Long-running mutation handlers should accept an optional `AbortSignal` after optional progress reporter parameters.
- Handlers must check cancellation before irreversible work, pass the signal to child-process wrappers, and report cancellation through structured diagnostic or mutation envelopes.
- Handlers must not swallow cancellation by returning `ok` when a child process was terminated. Mid-child cancellation should remain visible through command cancellation diagnostics and a failed mutation result after post-validation and journal handling.

## 새 기능 추가 체크리스트

1. 적절한 도메인 폴더에 `{verb}-{noun}.ts` 파일을 추가합니다.
2. Handler 이름은 `handle{Verb}{Noun}` 형식으로 작성합니다.
3. Read-only handler는 `DiagnosticEnvelope`, mutation handler는 `DiagnosticEnvelope | MutationResultEnvelope`를 반환합니다.
4. 도메인 `index.ts`와 루트 barrel export 경로를 확인합니다.
5. `src/actions/schemas/*`에 ActionRegistry input schema를 추가하고, `src/actions/adapters/*`에서 internal action ID, capability, risk, handler execute mapping을 등록합니다.
6. Facade flow에서 discoverable해야 하므로 `workbench.route_intent`, `workbench.catalog`, `workbench.prepare_action`, `workbench.run_action` 또는 mutation의 `workbench.patch_preview`/`workbench.patch_apply` 경로로 사용할 수 있는지 확인합니다.
7. `src/registry/index.ts`에 metadata와 구현 상태를 반영합니다.
8. Legacy direct MCP exposure가 꼭 필요한 migration/dev compatibility case에만 `src/server.ts`의 env-gated legacy registration path에 `server.registerTool()`을 추가합니다. Default exposure로 추가하지 마세요.
9. Mutation handler이면 unknown field rejection, safe path, journal/post-validation 정책을 반드시 확인합니다.
