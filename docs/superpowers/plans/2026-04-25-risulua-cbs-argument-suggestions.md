# Risulua CBS Argument Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore CBS trigger suggestions in `.risulua` CBS argument/operator contexts such as `{{getvar::}}`, `{{addvar::}}`, and `{{#when::...::}}` without regressing the recent completion performance improvements.

**Architecture:** Keep the cheap root completion fast path limited to root macro-name contexts (`{{`, `{{#...`) and force argument/operator contexts through fragment analysis and `detectCompletionTriggerContext()`. Add regression tests around `.risulua` string-literal fragment mapping, fast-path boundaries, cached-analysis reuse, and `addvar` coverage before making the smallest targeted fix in `completion-context.ts`, `completion.ts`, or `.risulua` fragment request/mapping code.

**Tech Stack:** TypeScript, Vitest, `packages/cbs-lsp`, `risu-workbench-core` CBS parser/fragment mapper, VS Code LSP completion protocol.

---

## Findings and Current Root-Cause Hypotheses

Graph and direct code inspection located the completion flow:

- `packages/cbs-lsp/src/helpers/server-helper.ts:507-627` routes completion requests. `.risulua` requests run CBS fallback via `provideCbsCompletionItems()` and then merge LuaLS/overlay results.
- `packages/cbs-lsp/src/features/completion.ts:857-965` calls `provideCheapRootCompletions()` first, then `FragmentAnalysisService.locatePosition()`, then `detectCompletionTriggerContext()`.
- `packages/cbs-lsp/src/features/completion.ts:1293-1361` implements cheap root detection. It should only handle `{{`, `{{user`, `{{#`, `{{#w` style root contexts and must not intercept `{{getvar::`, `{{addvar::`, `{{#when::`, or `{{calc::`.
- `packages/cbs-lsp/src/core/completion-context.ts:168-187` creates `variable-names` contexts by calling `getVariableMacroArgumentKind()`.
- `packages/cbs-lsp/src/analyzer/scope/scope-macro-rules.ts:39-50` declares variable-argument macro rules, including `getvar`, `setvar`, `setdefaultvar`, `addvar`, temp/global variants, `slot`, `call`, and `arg`.
- `packages/cbs-lsp/src/features/completion.ts:1861-2010` builds local and workspace chat-variable completions.
- `packages/cbs-lsp/src/features/completion.ts:2238-2273` builds `#when` segment completions by merging operators and chat variables.
- `packages/cbs-lsp/src/core/fragment-analysis-service.ts` owns fragment analysis caching and `.risulua` fragment mapping via the WASM string-literal path.

Most likely failure seams:

1. **Fast-path boundary regression:** `provideCheapRootCompletions()` may be intercepting contexts that contain `::`, returning function/block candidates instead of variable/operator candidates.
2. **`.risulua` fragment mapping regression:** `.risulua` string-literal CBS fragments may not include the current incomplete argument/operator position after the Rust/WASM mapping changes, so `locatePosition()` returns no context.
3. **Cached-analysis stale lookup regression:** performance changes may reuse an analysis snapshot whose token/fragment ranges do not match the current trigger position after `::` typing.
4. **Coverage gap for `addvar`:** `addvar` is in the scope rule table, but no completion regression currently protects it.
5. **Workspace freshness gating:** workspace variable candidates are intentionally hidden when `workspaceFreshness.freshness === 'stale'`; a version mismatch can look like “variables disappeared,” especially after debounced workspace rebuilds.

## File Structure

**Modify only if the new failing tests prove it is necessary:**

- `packages/cbs-lsp/src/features/completion.ts`
  - Responsibility: completion provider flow, cheap root fast path, candidate construction, text edits.
  - Likely fix if fast path intercepts `::` contexts or if workspace freshness is too aggressively treated as stale.
- `packages/cbs-lsp/src/core/completion-context.ts`
  - Responsibility: token/node-path driven conversion from cursor lookup to completion context.
  - Likely fix if `{{getvar::}}`, `{{addvar::}}`, or `{{#when::...::}}` lands in `none`, `all-functions`, or wrong context.
- `packages/cbs-lsp/src/core/fragment-analysis-service.ts`
  - Responsibility: fragment mapping, analysis cache, `locatePosition()`.
  - Likely fix if `.risulua` string-literal CBS fragments are not produced or cached ranges are stale.
- `packages/cbs-lsp/src/helpers/server-workspace-helper.ts`
  - Responsibility: open document to `FragmentAnalysisRequest` conversion.
  - Likely fix if `.risulua` open documents resolve to `null` or miss CBS-bearing string fragments.

**Add or adjust tests:**

- `packages/cbs-lsp/tests/features/completion.test.ts`
  - Unit-level regression tests for fast-path boundaries, `addvar`, cached fragment-dependent completion, and stale `#when` behavior.
- `packages/cbs-lsp/tests/lsp-server-integration.test.ts`
  - Server-level `.risulua` string-literal argument/operator completion tests.
- `packages/cbs-lsp/tests/perf/large-workspace.test.ts`
  - Oversized `.risulua` negative/performance guard for fragment-dependent argument completion.

---

### Task 1: Add Fast-Path Boundary Regression Tests

**Files:**
- Modify: `packages/cbs-lsp/tests/features/completion.test.ts`

- [x] **Step 1: Write failing fast-path boundary tests**

Add this `describe` block near the existing root completion tests, before `describe('trigger context: {{getvar:: (variable names)'...)`:

```ts
describe('cheap root fast path boundaries', () => {
  it.each([
    ['{{getvar::', '{{getvar::'.length, 'mood'],
    ['{{setvar::', '{{setvar::'.length, 'mood'],
    ['{{addvar::', '{{addvar::'.length, 'mood'],
  ])('does not intercept %s variable argument completion', (source, cursorOffset, expectedLabel) => {
    const request = createInlineCompletionRequest(`{{setvar::mood::happy}}${source}`);
    const service = new FragmentAnalysisService();
    const locateSpy = vi.spyOn(service, 'locatePosition');
    const provider = createProvider(service, request, createWorkspaceChatVariableService('shared'));

    const completions = provider.provide(
      createParams(request, offsetToPosition(request.text, '{{setvar::mood::happy}}'.length + cursorOffset)),
    );

    expect(locateSpy).toHaveBeenCalled();
    expectCompletionLabels(completions, expectedLabel, 'shared');
    expectNoCompletionLabels(completions, 'getvar', 'setvar', '#when');
  });

  it('does not intercept #when segment completion after ::', () => {
    const request = createInlineCompletionRequest('{{setvar::mood::happy}}{{#when::mood::}}ok{{/}}');
    const service = new FragmentAnalysisService();
    const locateSpy = vi.spyOn(service, 'locatePosition');
    const provider = createProvider(service, request, createWorkspaceChatVariableService('target'));
    const cursorOffset = request.text.indexOf('{{#when::mood::') + '{{#when::mood::'.length;

    const completions = provider.provide(createParams(request, offsetToPosition(request.text, cursorOffset)));

    expect(locateSpy).toHaveBeenCalled();
    expectCompletionLabels(completions, 'is', 'isnot', 'and', 'or', 'target');
    expectNoCompletionLabels(completions, 'getvar', 'setvar');
  });

  it('does not intercept calc expression completion after calc::', () => {
    const request = createInlineCompletionRequest('{{setvar::mood::happy}}{{calc::}}');
    const service = new FragmentAnalysisService();
    const locateSpy = vi.spyOn(service, 'locatePosition');
    const provider = createProvider(service, request, createWorkspaceChatVariableService('score'));
    const cursorOffset = request.text.indexOf('{{calc::') + '{{calc::'.length;

    const completions = provider.provide(createParams(request, offsetToPosition(request.text, cursorOffset)));

    expect(locateSpy).toHaveBeenCalled();
    expectCompletionLabels(completions, '$mood', '$score', '&&', 'null');
    expectNoCompletionLabels(completions, 'getvar', '#when');
  });
});
```

- [x] **Step 2: Run the targeted completion tests and confirm failure/pass status**

Run:

```bash
npm run --workspace cbs-language-server test -- tests/features/completion.test.ts
```

Expected before the fix:
- If the suspected fast-path issue exists, at least one new test fails because variables/operators are missing or `locatePosition` is not called.
- If all pass, keep the tests as protection and continue to Task 2.

- [x] **Step 3: Apply minimal fast-path fix if tests fail**

If a boundary test fails because cheap root intercepts a `::` context, update `packages/cbs-lsp/src/features/completion.ts` in `detectCheapRootCompletionContext()` so any typed prefix containing argument/operator delimiters returns `null` before building cheap completions:

```ts
const typedPrefix = prefixText.slice(macroStartCharacter + 2);
if (typedPrefix.includes('::') || typedPrefix.includes('?') || typedPrefix.startsWith(':')) {
  return null;
}
if (!CBS_ROOT_PREFIX_PATTERN.test(typedPrefix) || typedPrefix.startsWith('/')) {
  return null;
}
```

Do not broaden root fast path to variable/operator contexts.

- [x] **Step 4: Re-run targeted completion tests**

Run:

```bash
npm run --workspace cbs-language-server test -- tests/features/completion.test.ts
```

Expected: PASS.

---

### Task 2: Add Missing `addvar` Argument Completion Coverage

**Files:**
- Modify: `packages/cbs-lsp/tests/features/completion.test.ts`
- Modify only if failing: `packages/cbs-lsp/src/analyzer/scope/scope-macro-rules.ts` or `packages/cbs-lsp/src/core/completion-context.ts`

- [x] **Step 1: Write failing `addvar` tests**

Add this block near the `getvar`/`setvar` argument completion tests:

```ts
describe('trigger context: {{addvar:: (chat variable names)', () => {
  it('offers fragment-local and workspace chat variables for addvar first-argument completion', () => {
    const request = createInlineCompletionRequest('{{setvar::mood::happy}}{{addvar::}}');
    const provider = createProvider(
      new FragmentAnalysisService(),
      request,
      createWorkspaceChatVariableService('shared'),
    );
    const cursorOffset = request.text.indexOf('{{addvar::') + '{{addvar::'.length;

    const completions = provider.provide(createParams(request, offsetToPosition(request.text, cursorOffset)));

    expectCompletionLabels(completions, 'mood', 'shared');
    expect(completions.find((completion) => completion.label === 'shared')?.sortText).toBe(
      'zzzz-workspace-shared',
    );
  });

  it('does not offer chat variables for addvar value arguments', () => {
    const request = createInlineCompletionRequest('{{setvar::mood::happy}}{{addvar::mood::}}');
    const provider = createProvider(
      new FragmentAnalysisService(),
      request,
      createWorkspaceChatVariableService('shared'),
    );
    const cursorOffset = request.text.indexOf('{{addvar::mood::') + '{{addvar::mood::'.length;

    const completions = provider.provide(createParams(request, offsetToPosition(request.text, cursorOffset)));

    expectNoCompletionLabels(completions, 'mood', 'shared');
  });
});
```

- [x] **Step 2: Run targeted completion tests**

Run:

```bash
npm run --workspace cbs-language-server test -- tests/features/completion.test.ts
```

Expected: `addvar` first argument returns `mood` and `shared`; second argument returns no variable names.

- [x] **Step 3: Apply minimal `addvar` rule fix if tests fail**

If the first test fails, verify `packages/cbs-lsp/src/analyzer/scope/scope-macro-rules.ts` contains this rule:

```ts
addvar: [
  { kind: 'define-variable', variableKind: 'chat', argumentIndex: 0 },
  { kind: 'reference-variable', variableKind: 'chat', argumentIndex: 0 },
],
```

If the rule exists but detection still fails, inspect `inferArgumentIndexFromOpenBrace()` and `nodeSpan.argumentIndex` handling in `packages/cbs-lsp/src/core/completion-context.ts`.

- [x] **Step 4: Re-run targeted completion tests**

Run:

```bash
npm run --workspace cbs-language-server test -- tests/features/completion.test.ts
```

Expected: PASS.

---

### Task 3: Add `.risulua` CBS String-Literal Argument/Operator Integration Tests

**Files:**
- Modify: `packages/cbs-lsp/tests/lsp-server-integration.test.ts`
- Modify only if failing: `packages/cbs-lsp/src/core/fragment-analysis-service.ts`, `packages/cbs-lsp/src/helpers/server-workspace-helper.ts`, `packages/cbs-lsp/src/features/completion.ts`

- [x] **Step 1: Write `.risulua` `getvar::` integration test**

Add near the existing `.risulua` completion fallback tests around `keeps CBS hover and completion available in .risulua when LuaLS is unavailable`:

```ts
it('routes CBS variable argument completion inside .risulua string literals when LuaLS is unavailable', async () => {
  const connection = new FakeConnection();
  const documents = new FakeDocuments();
  const uri = 'file:///tmp/risulua-cbs-getvar-completion.risulua';
  const text = 'local cbs = "{{setvar::mood::happy}} {{getvar::}}"\n';

  registerServer(connection as any, documents as any);
  documents.open(uri, text, 1);

  const completionItems = getCompletionItems(
    connection.completionHandler?.(
      {
        textDocument: { uri },
        position: positionAt(text, '{{getvar::', '{{getvar::'.length),
      },
      createCancellationToken(false),
    ),
  );

  expect(completionItems.some((item) => item.label === 'mood')).toBe(true);
  expect(completionItems.every((item) => item.kind === CompletionItemKind.Variable)).toBe(true);
});
```

- [x] **Step 2: Write `.risulua` `#when` operator integration test**

Add below the previous test:

```ts
it('routes CBS #when operator completion inside .risulua string literals when LuaLS is unavailable', async () => {
  const connection = new FakeConnection();
  const documents = new FakeDocuments();
  const uri = 'file:///tmp/risulua-cbs-when-completion.risulua';
  const text = 'local cbs = "{{setvar::mood::happy}} {{#when::mood::}}ok{{/}}"\n';

  registerServer(connection as any, documents as any);
  documents.open(uri, text, 1);

  const completionItems = getCompletionItems(
    connection.completionHandler?.(
      {
        textDocument: { uri },
        position: positionAt(text, '{{#when::mood::', '{{#when::mood::'.length),
      },
      createCancellationToken(false),
    ),
  );

  expect(completionItems.some((item) => item.label === 'is')).toBe(true);
  expect(completionItems.some((item) => item.label === 'isnot')).toBe(true);
  expect(completionItems.some((item) => item.label === 'mood')).toBe(true);
});
```

- [x] **Step 3: Run targeted integration tests**

Run:

```bash
npm run --workspace cbs-language-server test -- tests/lsp-server-integration.test.ts -t "risulua-cbs"
```

If the `-t` filter does not match because test names differ, run:

```bash
npm run --workspace cbs-language-server test -- tests/lsp-server-integration.test.ts
```

Expected: `.risulua` CBS string-literal argument/operator contexts return CBS completions even when LuaLS is unavailable.

- [x] **Step 4: Apply minimal `.risulua` mapping fix if tests fail**

If completions are empty, inspect these in order:

1. `packages/cbs-lsp/src/helpers/server-workspace-helper.ts:createFragmentRequest()` must return a non-null `FragmentAnalysisRequest` for normal-sized `.risulua` opened documents.
2. `packages/cbs-lsp/src/core/fragment-analysis-service.ts:analyzeDocument()` must map `.risulua` CBS-bearing Lua string literals into fragments that include incomplete `{{getvar::` and `{{#when::mood::` content.
3. `packages/cbs-lsp/src/core/fragment-analysis-service.ts:locatePosition()` must return a fragment-local lookup for the cursor inside the Lua string literal.
4. `packages/cbs-lsp/src/core/completion-context.ts:detectCompletionTriggerContext()` must return `variable-names` or `when-operators`, not `all-functions` or `none`.

Do not route these contexts through LuaLS overlay; they are CBS completions inside `.risulua` string literals.

- [x] **Step 5: Re-run targeted integration tests**

Run:

```bash
npm run --workspace cbs-language-server test -- tests/lsp-server-integration.test.ts -t "risulua-cbs"
```

Expected: PASS.

---

### Task 4: Extend Cached-Analysis Regression to Fragment-Dependent Completion

**Files:**
- Modify: `packages/cbs-lsp/tests/lsp-server-integration.test.ts`
- Modify only if failing: `packages/cbs-lsp/src/core/fragment-analysis-service.ts`, `packages/cbs-lsp/src/core/completion-context.ts`

- [x] **Step 1: Extend existing cache reuse test or add a focused test**

Add this focused test near the existing cached provider bundle test:

```ts
it('reuses cached analysis without losing getvar argument completion context', () => {
  const connection = new FakeConnection();
  const documents = new FakeDocuments();
  const parseSpy = vi.spyOn(core.CBSParser.prototype, 'parse');
  const uri = 'file:///fixtures/server-cached-getvar-completion.risulorebook';
  const text = lorebookDocument(['{{setvar::mood::happy}}', '{{getvar::}}']);

  registerServer(connection as any, documents as any);
  documents.open(uri, text, 1);

  const firstCompletion = getCompletionItems(
    connection.completionHandler?.(
      {
        textDocument: { uri },
        position: positionAt(text, '{{getvar::', '{{getvar::'.length),
      },
      createCancellationToken(false),
    ),
  );
  const parseCountAfterFirstCompletion = parseSpy.mock.calls.length;

  const secondCompletion = getCompletionItems(
    connection.completionHandler?.(
      {
        textDocument: { uri },
        position: positionAt(text, '{{getvar::', '{{getvar::'.length),
      },
      createCancellationToken(false),
    ),
  );

  expect(firstCompletion.some((item) => item.label === 'mood')).toBe(true);
  expect(secondCompletion.some((item) => item.label === 'mood')).toBe(true);
  expect(parseSpy.mock.calls.length).toBe(parseCountAfterFirstCompletion);
});
```

- [x] **Step 2: Add matching cached `#when` operator test**

```ts
it('reuses cached analysis without losing #when operator completion context', () => {
  const connection = new FakeConnection();
  const documents = new FakeDocuments();
  const parseSpy = vi.spyOn(core.CBSParser.prototype, 'parse');
  const uri = 'file:///fixtures/server-cached-when-completion.risulorebook';
  const text = lorebookDocument(['{{setvar::mood::happy}}', '{{#when::mood::}}ok{{/}}']);

  registerServer(connection as any, documents as any);
  documents.open(uri, text, 1);

  const firstCompletion = getCompletionItems(
    connection.completionHandler?.(
      {
        textDocument: { uri },
        position: positionAt(text, '{{#when::mood::', '{{#when::mood::'.length),
      },
      createCancellationToken(false),
    ),
  );
  const parseCountAfterFirstCompletion = parseSpy.mock.calls.length;

  const secondCompletion = getCompletionItems(
    connection.completionHandler?.(
      {
        textDocument: { uri },
        position: positionAt(text, '{{#when::mood::', '{{#when::mood::'.length),
      },
      createCancellationToken(false),
    ),
  );

  expect(firstCompletion.some((item) => item.label === 'is')).toBe(true);
  expect(firstCompletion.some((item) => item.label === 'mood')).toBe(true);
  expect(secondCompletion.some((item) => item.label === 'is')).toBe(true);
  expect(secondCompletion.some((item) => item.label === 'mood')).toBe(true);
  expect(parseSpy.mock.calls.length).toBe(parseCountAfterFirstCompletion);
});
```

- [x] **Step 3: Run targeted integration tests**

Run:

```bash
npm run --workspace cbs-language-server test -- tests/lsp-server-integration.test.ts -t "cached"
```

Expected: second completion uses cache and still returns variable/operator candidates.

- [x] **Step 4: Apply minimal cache/lookup fix if tests fail**

If second completion misses labels, inspect:

- `packages/cbs-lsp/src/core/fragment-analysis-service.ts:getCacheKey()` and text/version signature handling.
- `packages/cbs-lsp/src/core/fragment-analysis-service.ts:locatePosition()` and fragment-local offset conversion.
- `packages/cbs-lsp/src/core/completion-context.ts` branches that depend on `nodeSpan` and token positions.

- [x] **Step 5: Re-run targeted integration tests**

Run:

```bash
npm run --workspace cbs-language-server test -- tests/lsp-server-integration.test.ts -t "cached"
```

Expected: PASS.

---

### Task 5: Add Oversized `.risulua` Fragment-Dependent Completion Guard

**Files:**
- Modify: `packages/cbs-lsp/tests/perf/large-workspace.test.ts`
- Modify only if failing: `packages/cbs-lsp/src/utils/oversized-lua.ts`, `packages/cbs-lsp/src/core/fragment-analysis-service.ts`, `packages/cbs-lsp/src/helpers/server-helper.ts`

- [x] **Step 1: Write oversized negative/performance test**

Add this near the existing oversized `.risulua` completion budget test:

```ts
it('returns quickly for fragment-dependent CBS completions in oversized .risulua documents', async () => {
  const root = await createLargeWorkspaceRoot();
  const connection = new FakeConnection();
  const documents = new FakeDocuments();
  const uri = pathToFileURL(path.join(root, 'lua/super-huge.risulua')).toString();
  const text = await fs.promises.readFile(path.join(root, 'lua/super-huge.risulua'), 'utf8');

  registerServer(connection as any, documents as any);
  documents.open(uri, text, 1);

  const start = performance.now();
  const completionItems = getCompletionItems(
    await connection.completionHandler?.(
      {
        textDocument: { uri },
        position: positionAt(text, '{{getvar::', '{{getvar::'.length),
      },
      createCancellationToken(false),
    ),
  );
  const durationMs = performance.now() - start;

  expect(durationMs).toBeLessThan(250);
  expect(completionItems).toEqual([]);
});
```

If `super-huge.risulua` does not contain `{{getvar::`, inject one near the start of the fixture text in the test before `documents.open()` while preserving total size above `MAX_LUA_ANALYSIS_TEXT_LENGTH`.

- [x] **Step 2: Run targeted perf test**

Run:

```bash
npm run --workspace cbs-language-server test -- tests/perf/large-workspace.test.ts
```

Expected: oversized `.risulua` argument completion returns quickly and does not attempt full fragment analysis.

- [x] **Step 3: Apply minimal oversized guard fix if test hangs or returns expensive results**

If the test exceeds 250ms or triggers full analysis, ensure oversized `.risulua` still returns a lightweight empty fragment analysis in `FragmentAnalysisService.analyzeDocument()` and still skips LuaLS proxy via `shouldSkipLuaLsProxyForRequest()`.

- [x] **Step 4: Re-run targeted perf test**

Run:

```bash
npm run --workspace cbs-language-server test -- tests/perf/large-workspace.test.ts
```

Expected: PASS.

---

### Task 6: Run Verification Matrix

**Files:**
- No new files.

- [x] **Step 1: Run completion unit suite**

Run:

```bash
npm run --workspace cbs-language-server test -- tests/features/completion.test.ts
```

Expected: PASS.

- [x] **Step 2: Run server integration suite targeted to completion/cache/Lua routes**

Run:

```bash
npm run --workspace cbs-language-server test -- tests/lsp-server-integration.test.ts -t "completion|cached|risulua"
```

Expected: PASS. If Vitest filtering is unreliable for this file, run the whole file and document any pre-existing unrelated failures.

Evidence: the narrower `-t "risulua-cbs"` and `-t "cached"` integration slices passed. The wider `-t "completion|cached|risulua"` slice still includes pre-existing workspace-state/LuaLS bridge failures already tracked in root `TODO.md` under `#### Backlog`; those failures are unrelated to the new CBS argument/operator regression tests.

Review follow-up: added live-typing recovery coverage for unclosed value arguments (`{{setvar::mood::`, `{{addvar::mood::`) so PlainText recovery no longer treats them as first-argument variable-name contexts, while unclosed `{{getvar::mo` still returns variable-name completions.

- [x] **Step 3: Run large workspace perf guard**

Run:

```bash
npm run --workspace cbs-language-server test -- tests/perf/large-workspace.test.ts
```

Expected: PASS.

- [x] **Step 4: Run package build**

Run:

```bash
npm run --workspace cbs-language-server build
```

Expected: PASS.

- [x] **Step 5: Update TODO and implementation evidence**

Move the relevant `TODO.md` backlog item to `Done` only after the tests and build above pass. Keep any unrelated existing backlog entries under `### Remaining` grouped by `#### Backlog`.

---

## Self-Review

**Spec coverage:** The plan covers `{{getvar::}}` in `.risulua`, variable-argument macro areas, operator areas, recent performance fast path, cached analysis, and oversized `.risulua` guards.

**Placeholder scan:** No implementation step uses “TBD” or asks for generic tests without concrete code. Each task includes paths, code snippets, and commands.

**Type consistency:** All cited providers and helper names match the inspected code: `CompletionProvider`, `FragmentAnalysisService`, `detectCompletionTriggerContext`, `createWorkspaceChatVariableService`, `getCompletionItems`, `positionAt`, and `createCancellationToken`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-25-risulua-cbs-argument-suggestions.md`.

Two execution options:

1. **Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
