<!--
  Agent integration guide for the CBS language server package.
  @file packages/cbs-lsp/docs/AGENT_INTEGRATION.md
-->

# CBS Language Server agent integration guide

이 문서는 editor extension이 아니라 agent/automation이 `cbs-language-server`를 직접 소비할 때의 권장 contract를 정리합니다.

## Two public surfaces

### 1. Stdio LSP surface

`cbs-language-server --stdio`는 일반 LSP client처럼 붙는 public surface입니다.

- completion / hover / diagnostics / rename / formatting / code actions / document symbols / workspace symbols / CodeLens 같은 editor-style 기능이 필요할 때 사용합니다.
- workspace graph가 잡히면 definition / references / rename은 `local-first` contract로 현재 fragment 결과 뒤에 workspace chat-variable 정보를 덧붙입니다.
- LuaLS companion이 ready면 `.risulua` hover/completion도 같은 stdio 세션에서 프록시됩니다.
- agent가 현재 세션의 runtime/operator 상태만 다시 읽고 싶다면 custom request `cbs/runtimeAvailability`를 호출하면 됩니다. 이 요청은 `experimental.cbs.availabilitySnapshot` / CLI `report availability`와 같은 normalized snapshot shape를, 현재 세션의 LuaLS/runtime 상태 기준으로 다시 반환합니다.

standalone boot, config precedence, workspace root selection은 `packages/cbs-lsp/docs/STANDALONE_USAGE.md`를 기준으로 합니다.

### 2. Auxiliary JSON `report/query` surface

LSP를 열 필요 없이 read-only contract만 보고 싶다면 CLI subcommand를 사용하세요.

```bash
cbs-language-server report availability
cbs-language-server report layer1 --workspace /path/to/workspace
cbs-language-server query variable sharedVar --workspace /path/to/workspace
cbs-language-server query variable-at --path lorebooks/alpha.risulorebook --offset 42 --workspace /path/to/workspace
cbs-language-server query activation-entry Alpha --workspace /path/to/workspace
```

- `report availability` — runtime/operator contract, failure modes, companion status를 JSON으로 확인
- `report layer1` — `ElementRegistry` + `UnifiedVariableGraph` snapshot과 Layer 1 public contract descriptor(`contract`)를 함께 확인
- `query variable*` — `VariableFlowService` 결과 확인
- `query activation*` — `ActivationChainService` 결과 확인

## Contract markers and scope honesty

모든 public agent-facing JSON payload는 아래 marker를 유지합니다.

- `schema` field: `cbs-lsp-agent-contract`
- `schemaVersion` field: `1.0.0`

Scope honesty는 아래처럼 해석하면 됩니다.

- `local-only` — 현재 문서/fragment 기준 surface
- `local-first` — 현재 fragment 결과를 먼저 주고, workspace state가 있으면 제한된 cross-file 결과를 뒤에 덧붙임
- `workspace-disabled` — artifact 특성상 CBS routing 대상이 아님
- `report/query` — read-only surface만 제공하며, edit/write 동작은 없습니다.

## Layer 1 workspace snapshot trust contract

`report layer1` payload는 아래 묶음을 한 번에 반환합니다.

- `schema` / `schemaVersion` — 전체 agent-facing protocol marker
- `contract` — Layer 1 stable public contract descriptor
- `registry` — `ElementRegistrySnapshot`
- `graph` — `UnifiedVariableGraphSnapshot`

`contract`는 특히 아래를 source-of-truth로 고정합니다.

- `trust.agentsMayTrustSnapshotDirectly: true` — 이 bundle은 agent가 workspace-wide reasoning 입력으로 직접 써도 되는 read-only 계약입니다.
- `stableFields.*` — file/element/graph-seed/occurrence/node/snapshot field name과 의미가 stable public contract임을 명시합니다.
- `deterministicOrdering.*` — files / fragments / variables / occurrences / index bucket ordering을 선언합니다.
- `stableFields.runtimeDerivedFields` — 현재는 `graph.buildTimestamp`만 runtime-derived field이며, field meaning은 stable이지만 값 자체는 cache metadata라 equality identity로 쓰지 않습니다.

## Recommended agent boot sequence

1. `report availability`로 install mode, workspace root, failure mode, companion status를 먼저 확인
2. workspace-level reasoning이 필요하면 `report layer1` 또는 `query variable*` / `query activation*`를 사용
3. 실제 editor parity가 필요한 completion/hover/rename 같은 상호작용은 stdio LSP 세션으로 수행
4. 이미 stdio 세션을 붙여 둔 상태에서 runtime/operator 상태만 다시 확인하려면 `cbs/runtimeAvailability` custom request를 사용
5. `luals-unavailable`가 active면 `.risulua` 결과를 기대하지 말고 CBS fragment surface만 사용

## Official VS Code client boundary

VS Code extension embedding이 필요하면 `packages/vscode/README.md`를 보세요. 공식 client도 결국 같은 `cbs-language-server` standalone contract를 먼저 소비하고, monorepo 개발 모드에서만 embedded fallback을 허용합니다.

## Troubleshooting entry points

- install/attach 문제: `packages/cbs-lsp/docs/STANDALONE_USAGE.md`
- LuaLS companion 상태/설치: `packages/cbs-lsp/docs/LUALS_COMPANION.md`
- failure mode별 복구: `packages/cbs-lsp/docs/TROUBLESHOOTING.md`
