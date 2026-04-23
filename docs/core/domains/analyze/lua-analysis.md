# lua-analysis

이 페이지는 Lua analyzer family를 한 묶음으로 설명합니다. 현재 범위는 `lua-api.ts`, `lua-helpers.ts`, `lua-analysis-types.ts`, `lua-collector.ts`, `lua-analyzer.ts`, `lua-core.ts`입니다. helper를 여러 leaf로 쪼개지 않고 여기서 함께 다룹니다.

## 현재 public surface

root browser entry에서 다시 export되는 Lua analyze surface는 아래입니다.

- `RISUAI_API`, `LUA_STDLIB_CALLS`
- `safeArray`, `lineStart`, `lineEnd`, `lineCount`, `nodeKey`, `callArgs`, `strLit`, `exprName`, `assignName`, `directCalleeName`, `sanitizeName`, `toModuleName`, `prefixOf`, `createMaxBlankRun`, `inferLuaFunctionName`, `LuaASTNode`
- `analyzeLuaSource`, `LuaAnalysisArtifact`
- `runCollectPhase`, `runAnalyzePhase`
- `CollectedFunction`, `CollectedStateVar`, `CollectedCall`, `CollectedApiCall`, `CollectedLoreApiCall`, `CollectedData`, `AnalyzePhaseResult`, `CorrelationEntry`, `LorebookCorrelation`, `RegexCorrelation`, `StateAccessOccurrence`

근거는 [`../../../../packages/core/src/domain/index.ts`](../../../../packages/core/src/domain/index.ts), [`../../targets/root-browser.md`](../../targets/root-browser.md), [`../../../../packages/core/tests/export-surface.test.ts`](../../../../packages/core/tests/export-surface.test.ts)입니다.

## 파일별 역할

| 파일 | 현재 역할 |
|---|---|
| `lua-api.ts` | RisuAI Lua API 메타데이터와 stdlib ignore set |
| `lua-helpers.ts` | AST 읽기, 이름 정규화, blank-run, basename 추론 보조 |
| `lua-analysis-types.ts` | collect phase, analyze phase, correlation 결과 타입 |
| `lua-collector.ts` | AST 순회로 함수, call, state access, lore API, preload/require 정보를 수집 |
| `lua-analyzer.ts` | 수집 결과에서 call graph, calledBy, module grouping, registry vars를 계산 |
| `lua-core.ts` | `luaparse` 진입점, collect/analyze 실행, optional charx correlation 결합 |

## 현재 truth

### 진입점

- `analyzeLuaSource({ filePath, source, charxData? })`가 public 진입점입니다.
- 내부에서 `luaparse.parse()`를 `comments`, `locations`, `ranges`, `scope`, `luaVersion: '5.3'` 옵션으로 호출합니다.
- 결과는 `LuaAnalysisArtifact` 하나로 반환됩니다.

### collect phase

- `runCollectPhase()`는 함수 정의, API 호출, handler, data table, state variable, lore API call, preload module, require binding, module member call을 수집합니다.
- 상태 접근은 `getState`, `setState`, `getChatVar`, `setChatVar`의 static string key만 기록합니다.
- wrapper form인 `getState(chat, "key")`, `setState(chat, "key", value)`, `getChatVar(triggerId, "key")`, `setChatVar(triggerId, "key", value)`도 현재 지원합니다.
- dynamic key는 occurrence를 지어내지 않고 건너뜁니다.
- `listenEdit(...)`, `onStart`, `onInput`, `onOutput`, `onButtonClick`는 handler로 기록됩니다.
- `package.preload[...]`와 `require()` alias도 수집해 후속 call graph 해석에 넘깁니다.

### analyze phase

- `runAnalyzePhase()`는 수집된 call을 바탕으로 `callGraph`, `calledBy`, `resolvedModuleCalls`를 계산합니다.
- RisuAI API와 Lua stdlib call은 call graph edge에서 제외합니다.
- 현재 module grouping은 primary module 하나를 heuristic으로 잡는 single-module 중심 결과입니다.
- `stateOwnership`과 `registryVars`는 state var 사용 패턴을 요약합니다.
- `registryVars`는 현재 `setChatVar` / `getChatVar` 계열을 기준으로 권장 default와 init pattern을 정리합니다.

### core result

`LuaAnalysisArtifact`는 아래 핵심 필드를 가집니다.

- `filePath`, `baseName`, `sourceText`, `totalLines`
- `collected`, collect phase 원본 결과
- `analyzePhase`, analyze phase 결과
- `lorebookCorrelation`, optional
- `regexCorrelation`, optional
- `serialized`, stateVars / functions / handlers / apiCalls / stateAccessOccurrences의 JSON-safe view
- `elementCbs`, 현재 baseName 하나를 elementName으로 쓰는 Lua CBS bridge entry

## charx 연동 경계

- `charxData`를 넘기면 `lua-core.ts`가 lorebook, regex correlation을 추가로 계산합니다.
- lorebook correlation은 top-level `character_book.entries`, regex correlation은 `extensions.risuai.customScripts`를 읽습니다.
- `charxData`가 없으면 두 correlation 필드는 `null`입니다.

## CLI 라우팅 메모

- analyze CLI는 `.lua`와 `.risulua` 파일을 Lua analyze로 보냅니다.
- directory auto-detect는 lua가 아니라 charx/module/preset marker 기반입니다.
- `--all`은 별도 aggregate mode이며 `workspace.yaml`에 선언된 artifact를 순회합니다.
- 따라서 Lua family 문서는 file-level analyzer contract만 다루고, workspace auto-detect 규칙 전체는 [`./README.md`](./README.md)와 [`../../targets/cli.md`](../../targets/cli.md)에서 봅니다.

## 범위 경계

- 이 family는 static analysis 결과를 만듭니다. Lua 실행, sandbox, side effect 재현은 하지 않습니다.
- relationship network HTML, interaction flow HTML의 셸 세부는 여기서 보장하지 않습니다.
- 다만 Lua 결과가 bridge edge와 interaction flow의 source가 된다는 점은 코드와 테스트로 확인됩니다.

## evidence anchors

- 소스: [`../../../../packages/core/src/domain/analyze/lua-api.ts`](../../../../packages/core/src/domain/analyze/lua-api.ts), [`../../../../packages/core/src/domain/analyze/lua-helpers.ts`](../../../../packages/core/src/domain/analyze/lua-helpers.ts), [`../../../../packages/core/src/domain/analyze/lua-analysis-types.ts`](../../../../packages/core/src/domain/analyze/lua-analysis-types.ts), [`../../../../packages/core/src/domain/analyze/lua-collector.ts`](../../../../packages/core/src/domain/analyze/lua-collector.ts), [`../../../../packages/core/src/domain/analyze/lua-analyzer.ts`](../../../../packages/core/src/domain/analyze/lua-analyzer.ts), [`../../../../packages/core/src/domain/analyze/lua-core.ts`](../../../../packages/core/src/domain/analyze/lua-core.ts)
- 테스트: [`../../../../packages/core/tests/lua-core.test.ts`](../../../../packages/core/tests/lua-core.test.ts), [`../../../../packages/core/tests/relationship-network-lua.test.ts`](../../../../packages/core/tests/relationship-network-lua.test.ts), [`../../../../packages/core/tests/lua-interaction-builder.test.ts`](../../../../packages/core/tests/lua-interaction-builder.test.ts)
- CLI 라우팅: [`../../../../packages/core/src/cli/analyze/workflow.ts`](../../../../packages/core/src/cli/analyze/workflow.ts)

## 같이 읽을 문서

- [`./correlation.md`](./correlation.md)
- [`./text-mention.md`](./text-mention.md)
- [`./README.md`](./README.md)
