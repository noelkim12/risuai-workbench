# risuai-workbench-mcp tools

`packages/risuai-workbench-mcp/src/tools/`는 RisuAI Workbench MCP 서버가 노출하는 tool handler 구현을 도메인별로 모아 둔 영역입니다. 실제 MCP 등록은 `src/server.ts`에서 수행하고, 이 디렉토리는 handler와 도메인 barrel export를 제공합니다.

## 구조

```text
src/tools/
├── index.ts                 # 전체 tool domain barrel
├── inspect/                 # path / artifact inspection
├── validate/                # artifact structure validation, path build, test hints
├── patch/                   # no-write patch preview + patch plan apply entry
├── mutation/                # direct structured source artifact mutations + gated core workflows
├── analyze/                 # read-only analyze / impact query tools
└── wiki/                    # wiki search, preview, generated wiki refresh
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

## 등록 방식

Tool 구현은 이 디렉토리에 있지만 MCP SDK 등록은 `packages/risuai-workbench-mcp/src/server.ts`의 `server.registerTool()` 호출에서 이루어집니다.

- Tool name은 `workbench.{verb}_{noun}` 형식입니다.
- Handler 함수명은 `handle{Verb}{Noun}` 형식입니다.
- `inputSchema`는 `zod` raw shape로 등록됩니다.
- Handler 결과는 `createJsonToolResult(result)`를 통해 MCP text JSON과 `structuredContent`를 함께 반환합니다.
- Stable envelope tools should declare `outputSchema` from `src/contracts/output-schemas.ts`.
- Tool metadata와 구현 상태는 `src/registry/index.ts`의 `WORKBENCH_REGISTRY`와 `IMPLEMENTED_ROADMAP_TOOL_NAMES`가 관리합니다.

응답은 transport exception 대신 구조화된 envelope를 반환하는 것을 기본 원칙으로 합니다.

| 용도 | 대표 envelope | 설명 |
| --- | --- | --- |
| read-only / preview | `DiagnosticEnvelope` | `schema: risuai-workbench-mcp.diagnostics`, `status`, `diagnostics`, optional `data` 포함 |
| mutation | `MutationResultEnvelope` 또는 `DiagnosticEnvelope` | `schema: risuai-workbench-mcp.mutation-result`, `changedFiles`, `postValidation`, `mutationId`, `resourceLinks` 포함 |

Mutation 계열 handler는 대체로 `unknown` input을 받은 뒤 내부 parse 함수와 `createUnknownFieldDiagnosticEnvelope()`로 fail-closed 검증을 수행합니다. 실제 write는 `evaluateMutationSafetyGate()`에서 workspace boundary, mutation mode, hash precondition, confirmation gate를 통과해야 합니다.

## Tool 목록

현재 registry 기준 구현 tool은 `workbench.smoke`를 포함해 41개입니다. `workbench.smoke`는 startup smoke tool이며 `src/tools/`가 아니라 `src/server.ts`에서 직접 등록됩니다.

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
| `workbench.apply_patch_plan` | yes | `handleApplyPatchPlan` | `patch/apply-patch-plan.ts` | 저장된 `patchPlanId`를 조회해 confirmation, mutation mode, precondition을 재검증한 뒤 지원 operation을 적용합니다. |

`workbench.apply_patch_plan`이 직접 지원하는 operation은 `text.replace`, `file.create`, `order.insert`, `order.move`, `order.remove`, `frontmatter.set`, `frontmatter.remove`입니다. `file.move`, `file.delete`, `json.set`은 전용 mutation tool을 사용합니다.

### Direct mutation

| Tool | Mutates | Handler | 구현 파일 | 기능 |
| --- | ---: | --- | --- | --- |
| `workbench.edit_order` | yes | `handleEditOrder` | `mutation/edit-order.ts` | `_order.json`에 structured insert/move/remove를 preview 또는 commit으로 적용합니다. |
| `workbench.edit_frontmatter` | yes | `handleEditFrontmatter` | `mutation/edit-frontmatter.ts` | artifact body를 보존하면서 frontmatter field를 set/remove합니다. malformed commit은 `force: true` 없이 거부합니다. |
| `workbench.edit_metadata` | yes | `handleEditMetadata` | `mutation/edit-metadata.ts` | metadata/root marker JSON에 `json.set` operation을 적용하며 `allowedFields` 정책을 검사합니다. |
| `workbench.create_artifact` | yes | `handleCreateArtifact` | `mutation/create-artifact.ts` | canonical path에 새 artifact 파일을 만들고 optional `_order.json` insertion을 수행합니다. |
| `workbench.run_extract` | yes | `handleRunExtract` | `mutation/run-extract.ts` | `risu-core extract` workflow를 안전 게이트 뒤에서 실행해 charx/risum/risup 등을 canonical workspace로 추출합니다. `outDir`은 workspace-relative 신규 디렉터리여야 합니다. |
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

`analyze/query-analyze.ts`는 여러 query tool이 snapshot 처리, Lua source 해석, Map/Set JSON 정규화를 공유하기 때문에 한 파일에 모여 있습니다.

### Advanced mutation

| Tool | Mutates | Handler | 구현 파일 | 기능 |
| --- | ---: | --- | --- | --- |
| `workbench.move_artifact` | yes | `handleMoveArtifact` | `mutation/move-artifact.ts` | artifact rename/move를 수행합니다. suffix 보존, expected hash, exact confirmation, optional order update를 검사합니다. |
| `workbench.delete_artifact` | yes | `handleDeleteArtifact` | `mutation/delete-artifact.ts` | high-risk delete tool입니다. exact confirmation, optional backup, optional order cleanup, journal 기록을 수행합니다. |
| `workbench.refresh_wiki` | yes | `handleRefreshWiki` | `wiki/refresh-wiki.ts` | generated wiki allowlist 경로만 갱신합니다. core write-protect helper와 post-validation을 사용합니다. |
| `workbench.rollback_mutation` | yes | `handleRollbackMutation` | `mutation/rollback-mutation.ts` | journal에 충분한 inverse state가 있는 mutation만 rollback합니다. high-risk exact confirmation이 필요합니다. |

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
| `apply_patch_plan` | `patchPlanId`, `confirmation`, optional `options` |
| direct mutation tools | `mode: preview|commit`, optional `confirmation`, `expectedHash`, `postValidate` |
| `run_extract` | `sourcePath`, `outDir`, optional `type`, RisuLua options, `mode`, `confirmation`, `postValidate` |
| `run_scaffold` | `type`, `name`, optional `outDir`, `creator`, `namespace`, `risuluaMode`, `mode`, `confirmation`, `postValidate` |
| analyze query tools | `sourcePath` 또는 `sourceText`, optional `previousSnapshot`, `stalePolicy`, tool별 analyzer payload |

## Safety notes

- 모든 workspace path는 `resolveSafeWorkspacePath()`로 workspace-relative boundary를 통과해야 합니다.
- 기본 mutation mode는 서버 CLI의 `--mutation` 값에 따릅니다. 기본값은 `preview-only`입니다.
- source artifact write는 `enabled` mode와 confirmation이 필요합니다.
- generated wiki write는 allowlist boundary를 통과해야 합니다.
- stale hash, unknown field, invalid input, confirmation mismatch는 파일 변경 없이 structured diagnostic 또는 rejected mutation result로 반환됩니다.
- Long-running mutation handlers should accept an optional `AbortSignal` after optional progress reporter parameters.
- Handlers must check cancellation before irreversible work, pass the signal to child-process wrappers, and report cancellation through structured diagnostic or mutation envelopes.
- Handlers must not swallow cancellation by returning `ok` when a child process was terminated. Mid-child cancellation should remain visible through command cancellation diagnostics and a failed mutation result after post-validation and journal handling.

## 새 tool 추가 체크리스트

1. 적절한 도메인 폴더에 `{verb}-{noun}.ts` 파일을 추가합니다.
2. Handler 이름은 `handle{Verb}{Noun}` 형식으로 작성합니다.
3. Read-only tool은 `DiagnosticEnvelope`, mutation tool은 `DiagnosticEnvelope | MutationResultEnvelope`를 반환합니다.
4. 도메인 `index.ts`와 루트 barrel export 경로를 확인합니다.
5. `src/server.ts`의 적절한 `register*Tools()` 함수에 `server.registerTool()`과 Zod `inputSchema`를 추가합니다.
6. `src/registry/index.ts`에 tool metadata와 구현 상태를 반영합니다.
7. Mutation tool이면 unknown field rejection, safe path, mutation mode, hash precondition, confirmation gate, journal/post-validation 정책을 반드시 확인합니다.
