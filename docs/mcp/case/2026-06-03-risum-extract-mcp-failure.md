# Case Report: `.risum` extract request failed through risuai-workbench-mcp

> Historical note, stale but useful: this case records the pre-fix behavior from 2026-06-03. Default MCP callers should now use `workbench.run_action` with `actionId: "core.run_extract"` for `.risum`, `.risuchar`, `.risup`, and `.charx` extraction/import requests. The direct `workbench.run_extract` name remains a legacy/dev-mode MCP tool name and is hidden unless `RISU_MCP_EXPOSE_LEGACY_TOOLS=1` is enabled.

Date: 2026-06-03

## Summary

The request was to extract `test_suites/🔞RPG Violated Girl_260501.risum` into `test_suites/extraction_targets/` using `risuai-workbench-mcp`. The MCP facade route did not succeed because the default facade ActionRegistry does not register an executable `run_extract` action, even though the legacy/direct MCP tool `workbench.run_extract` and its handler exist in the server code. In addition, `workbench.route_intent` did not classify the request as a core extract workflow; it returned `intent: "unknown"`, `nextStep: "clarify"`, and blocked mutation tools including `workbench.run_extract`.

## What happened in this session

1. The source `.risum` file could not be read with the normal file reader because it is binary:
   - `Read tool failed ... Cannot read binary file: .../test_suites/🔞RPG Violated Girl_260501.risum`
2. The MCP route was attempted with:
   - request: extract the `.risum` into `test_suites/extraction_targets/`
   - target: `test_suites/🔞RPG Violated Girl_260501.risum`
3. `workbench.route_intent` returned low confidence:
   - `intent: "unknown"`
   - `nextStep: "clarify"`
   - `risk: "read_only"`
   - `stopConditions: ["route_low_confidence"]`
   - `blockedTools` included `workbench.run_extract`
4. `workbench.catalog` did not find an extract action for queries like `run_extract risum module extraction to output directory`.
5. `workbench.prepare_action` with `actionId: "workbench.run_extract"` failed:
   - `code: "UNKNOWN_ACTION"`
   - suggestions: `inspect.path`, `inspect.artifact`, `validate.artifact`, `validate.path`
6. `workbench.run_action` with `actionId: "workbench.run_extract"` also failed with the same `UNKNOWN_ACTION` shape.

## Root cause

### 1. Default MCP surface exposes facade tools, not legacy direct tools

The MCP README states that default `tools/list` exposes only the facade tools:

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

The server matches that design. In `packages/risuai-workbench-mcp/src/server.ts`, facade tools are registered unconditionally, while legacy/direct domain tools are only registered when `RISU_MCP_EXPOSE_LEGACY_TOOLS=1`:

```ts
const actionRegistry = createWorkbenchActionRegistry(actionExecutionContext);
registerFacadeTools(server, actionRegistry, actionExecutionContext, contextStore);

if (process.env.RISU_MCP_EXPOSE_LEGACY_TOOLS === '1') {
  ...
  registerCoreWorkflowTools(server, startupContext);
  ...
}
```

`registerCoreWorkflowTools()` is where the direct MCP tool name `workbench.run_extract` is registered. Therefore, in default facade-only mode, calling `workbench.run_extract` directly is not available.

This is also covered by tests:

- `packages/risuai-workbench-mcp/tests/server/startup.test.ts` asserts that default `tools/list` contains exactly the eight facade tools.
- `packages/risuai-workbench-mcp/tests/tool-surface-baseline.test.ts` asserts the same baseline and treats `workbench.run_*` names, except `workbench.run_action`, as legacy/direct names excluded from the default surface.

### 2. `workbench.run_action` looks up internal action IDs only

`workbench.run_action` delegates to `handleRunAction()`, which does a direct lookup in the internal ActionRegistry:

```ts
const action = registry.get(input.actionId);

if (!action) {
  let suggestions = registry.search({ query: input.actionId, limit: 4 });
  ...
  return createUnknownActionError(input.actionId, suggestions);
}
```

This means `actionId` must be an ID registered through `src/actions/adapters/*`, such as `inspect.path` or `validate.path`. The legacy tool name `workbench.run_extract` is not automatically executable through `run_action` unless an adapter registers it as an internal action.

This explains the observed suggestions. `inspect.path`, `inspect.artifact`, `validate.artifact`, and `validate.path` are among the first internal actions registered by `packages/risuai-workbench-mcp/src/actions/adapters/inspect-validate-actions.ts`. When `run_action` cannot find a matching action, it searches the registry and then falls back to the first registered actions.

### 3. The ActionRegistry factory does not register core workflow actions

`packages/risuai-workbench-mcp/src/actions/create-registry.ts` registers inspect/validate, analyze, wiki, skills, creative, and patch actions:

```ts
registerInspectValidateActions(registry);
registerAnalyzeActions(registry);
registerWikiActions(registry);
registerSkillsActions(registry);
registerCreativeActions(registry);
registerPatchActions(registry);
```

There is no `registerCoreWorkflowActions(registry)` or equivalent adapter for `run_extract` / `run_scaffold`. As a result, `workbench.prepare_action` and `workbench.run_action` cannot find `workbench.run_extract` as an action.

### 4. Metadata says `workbench.run_extract` exists, but facade actions do not

`packages/risuai-workbench-mcp/src/registry/index.ts` includes metadata for `workbench.run_extract`:

```ts
{
  description: 'Extract a .risum (module), .risuchar (character), or .risup (preset) file into a canonical workspace directory...',
  mutates: true,
  name: 'workbench.run_extract',
  title: 'Run extract workflow',
}
```

This registry metadata feeds routing/filtering concepts, but it is not the same as the runtime ActionRegistry used by `workbench.run_action`. The mismatch creates a discoverability trap: route results can mention or block `workbench.run_extract`, while facade execution cannot prepare or run it.

### 5. Intent routing has no explicit extract rule

`packages/risuai-workbench-mcp/src/tools/intent-route.ts` has a scaffold rule, but no corresponding extract/import/unpack rule. Its mutation keywords are limited to values like `fix`, `apply`, `edit`, `delete`, `move`, `commit`, and Korean equivalents such as `수정`, `바꿔`; they do not include `extract`, `unpack`, `import`, or `추출`.

Therefore this request did not match a core workflow route. It fell through to the default unknown rule:

```ts
return buildRouteResult(input, {
  intent: 'unknown',
  nextStep: 'clarify',
  confidence: 0.3,
  risk: 'read_only',
  blockedTools: filterImplemented(MUTATION_TOOLS),
  ...
});
```

## Why the binary source itself was not the issue

The `.risum` file being binary is expected. The core extractor supports `.risum` via `packages/core/src/cli/extract/module/workflow.ts`, whose help text accepts `file.risum|file.json`. The MCP mutation handler `packages/risuai-workbench-mcp/src/tools/mutation/run-extract.ts` also expects a `sourcePath`, resolves it safely, and builds `risu-core extract` arguments. The failure happened before the handler was reached.

## Additional note: the requested output directory already exists

`test_suites/extraction_targets/` exists and contains `TEST_HERE`. The MCP `handleRunExtract()` implementation requires the primary output path to be create-missing, but if the requested `outDir` exists it automatically falls back to a subdirectory based on the source basename:

```ts
if (!missingOutput.ok) {
  const fallbackOutDir = path.posix.join(safeOutDir.relativePath, sourceBase);
  ...
}
```

So an actual MCP `run_extract` execution would likely target `test_suites/extraction_targets/🔞RPG Violated Girl_260501` rather than writing directly into the already-existing directory root. This was not the observed blocker, because the action was never reached.

## Recommended fix

Implement a core workflow action adapter and route rule.

1. Add a new adapter, for example `packages/risuai-workbench-mcp/src/actions/adapters/core-workflow-actions.ts`.
2. Register at least:
   - `id: 'core.run_extract'`
   - `legacyToolName: 'workbench.run_extract'`
   - `capability: 'mutation.workflow'` or similar
   - `risk: 'write_create'` or the existing risk vocabulary used by actions
   - `inputSchema` matching `sourcePath`, optional `outDir`, optional `type`, RisuLua options, and `postValidate`
   - `execute` delegating to `handleRunExtract(input, context.workspace, context.mutationMode, ...)`
3. Add the adapter call to `createWorkbenchActionRegistry()`.
4. Add an intent-route rule before the generic mutation/unknown rules:
   - trigger on `.risum`, `.risuchar`, `.risup`, `extract`, `unpack`, `import`, `추출`, `풀어`, `가져오기`
   - return a core extract intent with `nextStep: 'apply'` or a guarded/direct workflow mode, depending on the product policy
   - recommend the internal action ID (`core.run_extract`) rather than the legacy tool name
5. Update catalog/prepare tests to assert that a `.risum` extract request exposes a runnable internal action.

## Regression test ideas

1. `route_intent` test:
   - input: `extract test_suites/example.risum to test_suites/extraction_targets`
   - expected: non-unknown intent, `domainTags` includes module or workflow, recommended action includes `core.run_extract`
2. `catalog` test:
   - query: `risum extract`
   - expected: action list includes `core.run_extract`
3. `prepare_action` test:
   - actionId: `core.run_extract`
   - expected required input includes `sourcePath`
4. `run_action` dry-run test:
   - actionId: `core.run_extract`, `dryRun: true`
   - expected `ok: true`
5. Legacy-name search test:
   - query: `workbench.run_extract`
   - expected search finds `core.run_extract` via `legacyToolName`

## Conclusion

The MCP request failed because the current facade system has a metadata/handler split: `workbench.run_extract` exists as a legacy direct tool and registry metadata entry, but it is not registered as a facade ActionRegistry action. The route classifier also lacks an extract-specific rule, so the request is classified as unknown and mutation tools are blocked. The fix is to bridge `handleRunExtract()` into the facade ActionRegistry and teach the router/catalog to recommend that internal action for `.risum` extract requests.
