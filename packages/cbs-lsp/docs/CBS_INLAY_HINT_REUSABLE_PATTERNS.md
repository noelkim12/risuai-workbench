# CBS 인레이 힌트(Inlay Hint) — 재사용 가능한 패턴 인벤토리

> 조사 범위: `risuai-workbench/packages/cbs-lsp` (AST 형상이 참조되는 경우에 한해 `packages/core` 포함).  
> 주요 초점: 활성 매개변수(active-parameter) 로직, 블록 헤더 파싱, 로컬 함수 인자 메타데이터, 프래그먼트 안전 범위(fragment-safe ranges), 레이블 생성.

---

## 1. 활성 매개변수 / 인자 인덱스 계산 (Active Parameter / Argument Index Computation)

이 함수들은 인레이 힌트의 가장 어려운 부분인 **어떤 매개변수 레이블이 어떤 인자 슬롯에 속하는지 결정하는 문제**를 이미 해결하고 있습니다.

### `countCompletedTopLevelSeparators`  
**파일:** `src/features/signature.ts` (66행)

```ts
function countCompletedTopLevelSeparators(
  tokens: readonly Token[],
  ownerRange: Range,
  cursorOffset: number,
  content: string,
): number
```

- 매크로 호출이나 블록 헤더 내부에서 중첩된 `{{...}}` 중괄호를 건너뛰고, **depth === 1인 지점의 `::` 구분자만** 계산합니다.
- 인레이 힌트에서 거의 그대로 재사용 가능합니다. 매크로 호출의 모든 인자에 대해 동일한 토큰 리스트를 반복하면서, 인자의 시작 오프셋에 일치하는 매개변수 레이블과 함께 힌트를 방출하면 됩니다.
- **핵심 뉘앙스:** `rangeContainsToken()`(53행)을 사용하여 계산 범위를 소유자 범위(owner range)로 제한하며, `TokenType.OpenBrace`/`CloseBrace`로 깊이(depth)를 추적합니다.

### `clampActiveParameter` / `clampExplicitParameterIndex`  
**파일:** `src/features/signature.ts` (137, 316행)

```ts
function clampActiveParameter(activeParameter: number, builtin: CBSBuiltinFunction): number
function clampExplicitParameterIndex(activeParameter: number, parameterCount: number): number
```

- 가공되지 않은(raw) 구분자 개수를 안전한 0-기반 매개변수 인덱스로 제한(bounds-check)합니다.
- `clampActiveParameter`는 **가변 마지막 매개변수(variadic last parameters)**도 고려합니다 (가변 슬롯 범위를 넘어서 제한하지 않음).
- 인자 개수가 선언된 매개변수 개수를 초과할 때 어떤 레이블을 보여줄지 결정하는 용도로 재사용할 수 있습니다.

### `resolveTokenMacroArgumentContext`  
**파일:** `src/core/completion-context.ts` (`core/index.ts`에서 export됨)

- 커서 아래에 있는 토큰에 대해 `{ macroName: string; argumentIndex: number }`를 반환합니다.
- 코드 완성(completion) 및 호버(hover)에서 현재 편집 중인 매크로 인자 슬롯이 무엇인지 파악하는 데 사용됩니다.
- 인레이 힌트에서 각 인자 노드를 매개변수 인덱스에 매핑할 때 재사용 가능합니다.

### `getMacroArgumentSpan`  
**파일:** `src/core/fragment-locator.ts` (130행)

```ts
function getMacroArgumentSpan(
  content: string,
  node: MacroCallNode,
  offset: number,
): (OffsetSpan & { argumentIndex: number; relation: Exclude<SpanRelation, 'outside'> }) | null
```

- `MacroCallNode` 내부의 주어진 오프셋에 대한 **인자 인덱스(argument index)**를 반환합니다.
- `buildNodeSpanLookup`에서 `nodeSpan.argumentIndex`를 채우는 데 사용됩니다.
- 인레이 힌트용 재사용: 매크로 호출 노드가 주어지면, 스팬(span) 로직을 다시 구현할 필요 없이 `node.arguments`를 반복하면서 각 인자 세그먼트를 해당 `argumentIndex`에 매핑할 수 있습니다.

---

## 2. 레이블 빌더 / 포맷터 (Label Builders / Formatters)

### `formatBlockParameterLabel`  
**파일:** `src/features/signature.ts` (106행)

```ts
function formatBlockParameterLabel(parameter: CBSBuiltinFunction['arguments'][number]): string
```

- 가변 인자에는 `...` 접두사를, 선택적 인자에는 `?` 접미사를 추가합니다.
- `...items?`와 같이 사람이 읽기 좋은 매개변수 레이블을 생성합니다.
- 내장 블록(builtin block) 힌트와 로컬 함수 힌트 모두에서 재사용 가능합니다.

### `buildParameterInfos`  
**파일:** `src/features/signature.ts` (112행)

```ts
function buildParameterInfos(
  builtin: CBSBuiltinFunction,
  signatureLabel: string,
): ParameterInformation[]
```

- 시그니처 레이블 내부에서 각 매개변수를 **부분 문자열 범위(substring range)**에 매핑합니다 (시그니처 도움말의 밑줄 표시용).
- 인자 텍스트 옆에 레이블을 표시하고 싶은 경우, 부분 문자열 매칭 로직(`indexOf(displayLabel, searchFrom)`)을 재사용하여 인레이 힌트용 인라인 레이블을 빌드할 수 있습니다.

### `formatParameterSlotSummary` / `formatParameterDefinitionSummary`  
**파일:** `src/features/hover.ts` (211, 223행)

```ts
function formatParameterSlotSummary(parameters: readonly { name: string }[]): string
function formatParameterDefinitionSummary(parameters: readonly { name: string; range: Range }[]): string
```

- `formatParameterSlotSummary`: `` `arg::0` → `foo`, `arg::1` → `bar` ``와 같은 문자열을 생성합니다.
- `formatParameterDefinitionSummary`: `` `foo` (3행, 5자) ``와 같은 문자열을 생성합니다.
- 두 함수 모두 호버와 유사한 인레이 힌트 툴팁이나 상세 정보 문자열에 직접 재사용할 수 있습니다.

### `createNamedParameterInformation`  
**파일:** `src/features/signature.ts` (169행)

```ts
function createNamedParameterInformation(label: string, documentation: string): ParameterInformation
```

- 단순한 레이블 + 문서(documentation) 쌍 빌더입니다.
- 선택적 툴팁 문서가 포함된 인레이 힌트 레이블을 구성할 때 재사용 가능합니다.

---

## 3. 블록 헤더 / 함수 메타데이터 추출 (Block Header / Function Metadata Extraction)

### `extractBlockHeaderInfo`  
**파일:** `src/analyzer/block-header/block-header.ts` (94행)

```ts
export function extractBlockHeaderInfo(node: BlockNode, sourceText: string): BlockHeaderInfo | null
```

- 블록 시작 태그를 `rawName` (예: `#each`)과 `tail` (그 이후의 모든 것)로 분리합니다.
- 모든 블록 헤더 파싱의 기초가 됩니다.

### `extractBlockNameRange`  
**파일:** `src/analyzer/block-header/block-header.ts` (122행)

```ts
export function extractBlockNameRange(node: BlockNode, sourceText: string): Range | null
```

- `{{#when ...}}` 내부의 블록 이름 토큰에 대한 **정확한 범위(exact range)**를 반환합니다.
- 인자가 아니라 블록 이름 **앞**이나 **뒤**에 인레이 힌트를 배치하고 싶을 때 재사용합니다.

### `extractEachLoopBinding`  
**파일:** `src/analyzer/block-header/block-header.ts` (152행)

```ts
export function extractEachLoopBinding(node: BlockNode, sourceText: string): EachLoopBinding | null
```

- `#each iteratorExpression as alias` 구문을 파싱하여 `bindingName`과 `bindingRange`를 반환합니다.
- 에일리어스(alias) 매개변수 위에 인레이 힌트를 표시할 때 재사용 가능합니다 (예: `as` 구절 옆의 `item`).

### `extractFunctionDeclaration` / `collectLocalFunctionDeclarations`  
**파일:** `src/analyzer/block-header/function-declaration.ts` (26행)  
**파일:** `src/core/local-functions.ts` (36행)

```ts
export function extractFunctionDeclaration(node: BlockNode, sourceText: string): FunctionDeclaration | null
export function collectLocalFunctionDeclarations(document: Pick<CBSDocument, 'nodes'>, sourceText: string): LocalFunctionDeclaration[]
```

- `extractFunctionDeclaration`: 단일 블록 노드에서 `#func name param1 param2`를 파싱합니다.
- `collectLocalFunctionDeclarations`: 문서 AST 전체를 순회하며 모든 `#func` 선언을 수집합니다.
- 두 함수 모두 이름, 매개변수, 범위를 반환합니다.
- `#func` 헤더 내부의 인레이 힌트(함수 이름 뒤에 매개변수 이름 표시)와 `{{call::...}}` 내부( `arg::N → paramName` 레이블 표시)에서 재사용 가능합니다.

### `collectParameterDeclarations`  
**파일:** `src/core/local-functions.ts` (187행)

```ts
function collectParameterDeclarations(
  sourceText: string,
  headerStartOffset: number,
  headerText: string,
  functionName: string,
  rawParameterText: string,
): LocalFunctionParameterDeclaration[]
```

- `#func` 헤더에서 **각 매개변수의 정확한 이름과 범위(Range)**를 추출합니다.
- 헤더 내부의 매개변수 토큰 위에 직접 인레이 힌트를 배치할 때 재사용 가능합니다.

### `parseLocalFunctionHeaderDeclaration`  
**파일:** `src/features/signature.ts` (415행)

```ts
function parseLocalFunctionHeaderDeclaration(
  headerRange: Range,
  content: string,
): LocalFunctionDeclaration | null
```

- `#func` 헤더 텍스트를 위한 정규식 기반 파서입니다. `name`, `parameters`, `range`를 반환합니다.
- `collectParameterDeclarations`보다 간단하지만 정밀도는 낮습니다. 빠른 헤더 수준 힌트에 유용합니다.

---

## 4. 스코프 / 변수 분석 (Scope / Variable Resolution)

### `resolveActiveLocalFunctionContext`  
**파일:** `src/core/local-functions.ts` (73행)

```ts
export function resolveActiveLocalFunctionContext(
  lookup: FragmentCursorLookupResult,
): ActiveLocalFunctionContext | null
```

- 커서가 `#func` 본문(`source: 'func-body'`) 내부에 있는지 아니면 `{{call::...}}` 매크로(`source: 'call-macro'`) 내부에 있는지 알려줍니다.
- 전체 `LocalFunctionDeclaration`(이름, 매개변수, 매개변수 선언부)을 반환합니다.
- **인레이 힌트에 필수적임:** `arg::N` 참조나 `call::` 인자에 레이블을 붙일 때 어떤 매개변수 리스트를 사용할지 결정합니다.

### `findEnclosingFunctionBodyContext` / `findCallMacroContext`  
**파일:** `src/core/local-functions.ts` (228, 269행)

- `resolveActiveLocalFunctionContext`에서 사용하는 내부 헬퍼입니다.
- `lookup.nodePath`를 역순으로 탐색하여 감싸고 있는 `Block` (`kind === 'func'`) 또는 `MacroCall` (`name === 'call'`)을 찾습니다.
- 탐색 로직을 다시 구현하지 않고 인레이 힌트 스코프를 위해 노드 경로를 순회해야 할 때 재사용 가능합니다.

### `resolveVisibleLoopBindingFromNodePath` / `collectVisibleLoopBindingsFromNodePath`  
**파일:** `src/analyzer/scope/visible-loop-bindings.ts` (`src/analyzer/scopeAnalyzer.ts`를 통해 export됨)

```ts
export function resolveVisibleLoopBindingFromNodePath(
  nodePath: readonly CBSNode[],
  sourceText: string,
  bindingName: string,
  offset: number,
 ): { binding: EachLoopBinding; scopeDepth: number } | null
```

- 주어진 위치에서 어떤 `#each ... as alias` 바인딩이 가시적인지(visible) 분석합니다.
- `slot::alias` 인자에 대한 인레이 힌트에서 원본 `#each` 표현식을 보여주는 용도로 재사용 가능합니다.

### `extractNumberedArgumentReference`  
**파일:** `src/core/local-functions.ts` (92행)

```ts
export function extractNumberedArgumentReference(
  node: MacroCallNode,
  sourceText: string,
): NumberedArgumentReference | null
```

- `{{arg::N}}`을 `{ index, rawText, range }`로 파싱합니다.
- `arg::N` 매크로를 감지하고 활성 로컬 함수 컨텍스트의 해당 매개변수 이름으로 레이블을 붙일 때 재사용 가능합니다.

---

## 5. 프래그먼트 안전 범위 매핑 (Fragment-Safe Range Mapping)

### `FragmentOffsetMapper`  
**파일:** `src/core/fragment-position.ts` (전반적으로 사용됨)

핵심 메서드:
- `toHostRange(documentContent: string, localRange: Range): Range | null`
- `toHostRangeFromOffsets(documentContent: string, startOffset: number, endOffset: number): Range | null`
- `toLocalOffset(hostOffset: number): number | null`
- `containsHostOffset(hostOffset: number): boolean`

- 모든 프로바이더가 이미 이 패턴을 사용하고 있습니다 (`documentHighlight.ts`의 `mapRanges()` 및 `completion.ts`의 범위 적용 참조).
- 인레이 힌트 재사용: 모든 레이블을 **프래그먼트 로컬 오프셋(fragment-local offsets)**으로 계산한 다음, `mapper.toHostRangeFromOffsets()`를 통해 호스트 범위로 일괄 변환합니다.

### `locateFragmentAtHostPosition`  
**파일:** `src/core/fragment-locator.ts` (378행)

```ts
export function locateFragmentAtHostPosition(
  documentAnalysis: DocumentFragmentAnalysis,
  documentContent: string,
  hostPosition: Position,
): FragmentCursorLookupResult | null
```

- 정석적인 진입점: 호스트 문서 위치가 주어지면 다음을 반환합니다:
  - `fragment` / `fragmentAnalysis`
  - `fragmentLocalOffset`
  - `nodePath` / `nodeSpan` / `token`
  - `mapper`
- 인레이 힌트 프로바이더의 **최상위 분석기(top-level resolver)**로 재사용 가능합니다. 위치를 파악한 다음 어떤 힌트 로직을 호출할지 결정합니다.

### `rangeToOffsetSpan`  
**파일:** `src/core/fragment-locator.ts` (81행)

```ts
function rangeToOffsetSpan(text: string, range: Range): OffsetSpan
```

- `Range`를 `{ localRange, localStartOffset, localEndOffset }`으로 변환합니다.
- 인레이 힌트 배치 시 빠른 오프셋 연산을 위해 재사용 가능합니다.

### `getSpanRelation`  
**파일:** `src/core/fragment-locator.ts` (89행)

```ts
function getSpanRelation(startOffset: number, endOffset: number, offset: number): SpanRelation
```

- `'strict' | 'boundary' | 'outside'`를 반환합니다.
- 특정 오프셋이 주어진 인자 스팬이나 블록 헤더 내부에 떨어지는지 테스트할 때 재사용 가능합니다.

---

## 6. 기존 프로바이더 연결 패턴 (Existing Provider Wiring Patterns)

### 기능 선언 (Capability Declaration)  
**파일:** `src/server/capabilities.ts`

현재 `inlayHintProvider`는 선언되어 있지 **않습니다**. 추가하려면 다음과 같이 합니다:

```ts
capabilities: {
  // ... 기존 프로바이더들
  inlayHintProvider: true,
}
```

패턴은 이미 존재하는 `documentHighlightProvider: true`나 `hoverProvider: true`와 동일합니다.

### 프로바이더 클래스 구조 (Provider Class Structure)  
**파일:** `src/features/documentHighlight.ts` (53–107행)

```ts
export class DocumentHighlightProvider {
  private readonly analysisService: FragmentAnalysisService;
  private readonly resolveRequest: DocumentHighlightRequestResolver;

  provide(params: DocumentHighlightParams, cancellationToken?: CancellationToken): DocumentHighlight[] {
    // 1. 취소 체크 (Cancel check)
    // 2. resolveRequest(params) → FragmentAnalysisRequest
    // 3. analysisService.locatePosition(...) → FragmentCursorLookupResult
    // 4. 취소 체크
    // 5. 프래그먼트 로컬 데이터를 사용하여 결과 빌드
    // 6. mapper.toHostRange()를 통해 범위를 호스트 문서로 매핑
    // 7. 반환
  }
}
```

- 이 정확한 7단계 패턴은 **completion, hover, signature, documentHighlight**에 모두 나타납니다.
- `InlayHintProvider`의 보일러플레이트(boilerplate)로 재사용 가능합니다.

### 취소 및 요청 분석 (Cancellation & Request Resolution)  
**파일:** `src/utils/request-cancellation.ts`, `src/core/index.ts`

- `isRequestCancelled(cancellationToken)`는 이미 모든 프로바이더에서 사용 중입니다.
- `fragmentAnalysisService`는 기본 공유 서비스 인스턴스입니다. 프로바이더는 의존성 주입(DI)을 위해 `options.analysisService`를 받습니다.

---

## 7. 빠른 참조: 임포트 위치 (Which File to Import From)

| 재사용 항목 | 내보내기 위치 (Export) | 임포트 경로 (Import From) |
|---------------|-----------------|-----------|
| `countCompletedTopLevelSeparators` | `src/features/signature.ts` | 내부용; 복사하거나 노출 필요 |
| `clampActiveParameter` | `src/features/signature.ts` | 내부용; 복사하거나 노출 필요 |
| `resolveActiveLocalFunctionContext` | `src/core/local-functions.ts` | `../core` |
| `collectLocalFunctionDeclarations` | `src/core/local-functions.ts` | `../core` |
| `resolveLocalFunctionDeclaration` | `src/core/local-functions.ts` | `../core` |
| `extractNumberedArgumentReference` | `src/core/local-functions.ts` | `../core` |
| `collectVisibleLoopBindingsFromNodePath` | `src/analyzer/scope/visible-loop-bindings.ts` | `../analyzer/scopeAnalyzer` |
| `resolveVisibleLoopBindingFromNodePath` | `src/analyzer/scope/visible-loop-bindings.ts` | `../analyzer/scopeAnalyzer` |
| `extractBlockHeaderInfo` | `src/analyzer/block-header/block-header.ts` | `../analyzer/block-header` |
| `extractEachLoopBinding` | `src/analyzer/block-header/block-header.ts` | `../analyzer/block-header` |
| `extractFunctionDeclaration` | `src/analyzer/block-header/function-declaration.ts` | `../analyzer/block-header` |
| `locateFragmentAtHostPosition` | `src/core/fragment-locator.ts` | `../core` |
| `fragmentAnalysisService` | `src/core/fragment-analysis-service.ts` | `../core` |
| `FragmentOffsetMapper` | `src/core/fragment-position.ts` | `../core` |
| `isRequestCancelled` | `src/utils/request-cancellation.ts` | `../utils/request-cancellation` |

---

## 8. 권장 인레이 힌트 프로바이더 아키텍처 (패턴 기반)

기존 프로바이더 패턴을 바탕으로 한 최소한의 `InlayHintProvider` 구성은 다음과 같습니다:

1. **위치 파악 (Locate):** `analysisService.locatePosition(request, position)` → `FragmentCursorLookupResult`
2. **분류 (Classify):** `lookup.nodeSpan.category`와 `lookup.nodeSpan.owner.type`을 사용 (signature/hover와 동일):
   - `'argument'` + `MacroCall` → 매크로 인자 힌트
   - `'block-header'` + `Block` → 블록 헤더 힌트
   - `'argument-reference'` + `MacroCall(name === 'arg')` → arg::N 힌트
3. **메타데이터 분석 (Resolve metadata):**
   - 매크로 인자 → `resolveBuiltinForPosition()` 또는 `resolveActiveLocalFunctionContext()`
   - `#func` 헤더 → `extractFunctionDeclaration()` 또는 `parseLocalFunctionHeaderDeclaration()`
   - `#each` 헤더 → `extractEachLoopBinding()`
4. **레이블 빌드 (Build labels):**
   - 내장 기능에는 `formatBlockParameterLabel()` 사용
   - 로컬 함수에는 `formatParameterSlotSummary()` 사용
5. **범위 매핑 (Map ranges):** 모든 힌트에 대해 `lookup.fragmentAnalysis.mapper.toHostRangeFromOffsets()` 적용
6. **반환 (Return):** `label: string | InlayHintLabelPart[]`와 `position: Position`을 가진 `InlayHint[]` 반환

