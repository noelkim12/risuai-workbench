# Analyze Pipeline

RisuAI 아티팩트 분석 파이프라인의 구조와 아티팩트 간 관계 패턴을 설명합니다.

## 디렉토리 구조

```
analyze/
  charx/        캐릭터 카드(.charx) 분석기
  module/       모듈(.risum) 분석기
  preset/       프리셋(.risup) 분석기
  lua/          Lua 단독 분석기
  compose/      복합 충돌 분석기
  shared/       분석기 공용 유틸 (시각화 셸, 관계 네트워크 빌더, i18n, cross-cutting 수집기)
  workflow.ts   CLI 라우터 — 아티팩트 타입을 판별하고 적절한 분석기로 위임
```

각 분석기는 공통적으로 **collect -> correlate/analyze -> report** 파이프라인을 따릅니다.

## 분석기별 역할

| 분석기 | 입력 | 핵심 산출물 |
|--------|------|-------------|
| `charx/` | 추출된 캐릭터 카드 디렉토리 | 로어북 구조, CBS 상관관계, 변수 흐름, Lua 분석, 관계 네트워크 |
| `module/` | 추출된 모듈 디렉토리 | charx와 동일한 분석 세트 (모듈 스코프) |
| `preset/` | 추출된 프리셋 디렉토리 | 프롬프트 체인 분석, regex CBS, 변수 흐름 |
| `lua/` | 단일 `.lua` 파일 또는 디렉토리 | 함수 목록, 상태 변수, 호출 그래프, 로어북/regex 상관관계 |
| `compose/` | 여러 아티팩트 조합 | 아티팩트 간 변수 충돌, 이름 중복 탐지 |


---

## RisuAI 아티팩트 관계 모델

RisuAI에서 lorebook, regex, variable, Lua는 독립적으로 존재하지 않습니다. CBS(Character Bot Scripting) 변수 시스템을 매개로 서로 데이터를 주고받으며, 하나의 유기적 네트워크를 형성합니다.

### 핵심 아티팩트 4종

| 아티팩트 | 설명 | 네트워크에서의 역할 |
|----------|------|---------------------|
| **Lorebook** | 키워드 기반 조건부 텍스트 삽입 엔트리 | CBS 변수를 읽고 쓰며, 다른 lorebook을 재귀 활성화할 수 있음 |
| **Regex Script** | 입출력 텍스트에 대한 정규식 변환 스크립트 | CBS 변수를 읽고 쓰며, lorebook과 변수를 공유 |
| **Variable** | CBS `getvar`/`setvar`/`addvar`로 관리되는 상태 값 | lorebook, regex, Lua 사이의 데이터 교환 매개체 |
| **Lua Function** | Lua 스크립트 내 함수 단위 로직 | `setState`/`getState`로 변수를 읽고 쓰며, lorebook API(`getLoreBooks`, `getLoreBooksMain`, `loadLoreBooksMain`, `upsertLocalLoreBook`)로 lorebook에 직접 접근 |

### CBS 변수 시스템

CBS 구문은 lorebook content와 regex script 안에 인라인으로 작성됩니다.

```
{{getvar::변수명}}           변수 읽기
{{setvar::변수명::값}}       변수 쓰기
{{addvar::변수명::값}}       변수 증감
```

`domain/cbs/cbs.ts`의 `extractCBSVarOps(text)` 함수가 텍스트에서 `reads`/`writes` Set을 추출합니다. 이 결과는 `ElementCBSData` 타입으로 통합됩니다.

```typescript
// domain/analyze/correlation.ts
interface ElementCBSData {
  elementType: 'lorebook' | 'regex';
  elementName: string;
  reads: Set<string>;    // getvar로 읽는 변수명
  writes: Set<string>;   // setvar/addvar로 쓰는 변수명
}
```


---

## 관계 네트워크 (Force-Graph)

`shared/relationship-network-builders.ts`의 `buildRelationshipNetworkPanel`은 수집된 분석 데이터를 D3 force-graph 시각화로 변환합니다. charx와 module 분석기의 HTML 리포트에서 사용됩니다.

### 입력 계약

```typescript
// shared/relationship-network-builders.ts
interface LorebookGraphData {
  lorebookStructure: LorebookStructureResult | null;
  lorebookActivationChain?: LorebookActivationChainResult | null;
  lorebookRegexCorrelation: LorebookRegexCorrelation;
  lorebookCBS: ElementCBSData[];
  regexCBS: ElementCBSData[];
  regexNodeNames?: string[];
  regexScriptInfos?: RegexScriptInfo[];
  luaArtifacts?: LuaAnalysisArtifact[];
  textMentions?: TextMentionEdge[];
}
```

### 노드 유형 (5종)

| 노드 ID 패턴 | 유형 | 색상 | Layout Band | 설명 |
|--------------|------|------|-------------|------|
| `lb:{id}` | lorebook | 활성화 모드별 상이 | `lorebook` | 로어북 엔트리. 폴더별 그룹화 |
| `rx:{name}` | regex | `#a78bfa` (보라) | `regex` | Regex 스크립트 |
| `var:{name}` | variable | `#fbbf24` (황색) | `variable` | CBS/Lua 상태 변수 |
| `lua-fn:{file}:{fn}` | lua-function | `#2dd4bf` (청록) | `lua` | Lua 함수. 코어 핸들러는 `#ec4899` (핑크) |
| `trig:{keyword}` | trigger-keyword | `#f43f5e` (적색) | `trigger` | 로어북 활성화 키워드 |

로어북 노드 색상은 활성화 모드에 따라 결정됩니다:

| 활성화 모드 | 색상 | 의미 |
|------------|------|------|
| `constant` | `#f87171` (적색) | 항상 활성화 |
| `keyword` | `#60a5fa` (청색) | 단일 키워드 OR 매칭 |
| `keywordMulti` | `#34d399` (녹색) | 1차 + 2차 키워드 AND 매칭 |
| `referenceOnly` | `#94a3b8` (회색) | 키워드 없음, 참조 전용 |

### 엣지 유형 (6종)

관계 네트워크에는 6가지 엣지 유형이 존재합니다. 각 유형은 아티팩트 간 서로 다른 관계 패턴을 나타냅니다.

#### Edge 1: Activation Chain (lorebook -> lorebook)

```
lb:A --[activation-chain]--> lb:B
```

Lorebook A의 content에 lorebook B의 키워드가 포함되어 있으면, A가 활성화될 때 B도 재귀적으로 활성화될 수 있습니다.

- **분석 소스**: `domain/lorebook/activation-chain.ts` (`LorebookActivationChainResult`)
- **엣지 상태**: `possible` (완전 매칭), `partial` (일부 2차 키워드 미충족), `blocked` (그래프에서 제외)
- **레이블**: 매칭된 키워드 목록. partial인 경우 `missing: <키워드>`가 추가됨
- **Fallback**: activation chain 데이터가 없으면 keyword overlap 기반 legacy 방식으로 대체

#### Edge 2: Variable Flow (lorebook/regex <-> variable)

```
lb:Entry --[variable]--> var:X     (setvar/addvar: 엔트리가 변수에 쓰기)
var:X    --[variable]--> rx:Script (getvar: 스크립트가 변수를 읽기)
```

CBS `getvar`/`setvar`/`addvar` 구문을 통해 lorebook과 regex가 variable 노드와 연결됩니다. 방향은 데이터 흐름을 따릅니다:

- **Writer -> Variable**: `setvar`/`addvar`를 사용하는 요소에서 variable 노드로 향하는 엣지
- **Variable -> Reader**: variable 노드에서 `getvar`를 사용하는 요소로 향하는 엣지
- **Bidirectional**: `LorebookRegexCorrelation.sharedVars`의 `direction` 필드에 따라 양방향 엣지 생성

Variable 노드의 `details`에는 해당 변수를 읽는 요소(Readers)와 쓰는 요소(Writers) 목록이 포함됩니다.

#### Edge 3: Lua Function <-> Variable (lua-fn <-> variable)

```
lua-fn:file:fn --[variable]--> var:X    (setState: 함수가 변수에 쓰기)
var:X          --[variable]--> lua-fn:file:fn (getState: 함수가 변수를 읽기)
```

Lua 함수의 `stateReads`/`stateWrites` (= `getState`/`setState` API 호출)를 통해 variable 노드와 연결됩니다. CBS 변수와 동일한 variable 노드를 공유하므로, Lua와 lorebook/regex 사이의 간접 데이터 교환이 그래프에 자연스럽게 표현됩니다.

#### Edge 4: Lua -> Lorebook Direct (lua-fn -> lorebook)

```
lua-fn:file:fn --[lore-direct]--> lb:Entry
```

Lua 함수가 lorebook API를 호출하여 특정 lorebook 엔트리에 직접 접근하거나, bulk lorebook load를 수행하는 관계입니다.

- **분석 소스**: `LuaAnalysisArtifact.lorebookCorrelation.loreApiCalls`
- **레이블**: direct lookup/upsert는 target lorebook name, bulk load는 API 이름

#### Edge 5: Text Mention (lorebook -> variable/lua-fn/lorebook)

```
lb:A --[text-mention]--> var:X          (변수명 언급)
lb:A --[text-mention]--> lua-fn:file:fn (함수명 언급)
lb:A --[text-mention]--> lb:B           (다른 lorebook 이름 언급)
```

Lorebook content 텍스트에서 변수명, Lua 함수명, 다른 lorebook 이름을 탐지합니다.

- **분석 소스**: `domain/analyze/text-mention.ts` (`TextMentionEdge`)
- **3가지 서브타입**: `variable-mention`, `lua-mention`, `lorebook-mention`
- CBS 구문(`getvar`/`setvar`)과 별개로, 평문 텍스트에서의 언급을 포착하는 보조 관계

#### Edge 6: Lua Internal Call (lua-fn -> lua-fn)

```
lua-fn:file:caller --[lua-call]--> lua-fn:file:callee
```

동일 파일 내 Lua 함수 간 호출 그래프입니다.

- **분석 소스**: `LuaAnalysisArtifact.analyzePhase.callGraph`
- 코어 핸들러(`listenerEdit`, `onOutput`, `onInput`, `onButtonClick`)에서 유틸리티 함수로의 호출 흐름을 시각화


---

## 관계 패턴 요약

아티팩트 간 데이터 교환은 주로 variable 노드를 매개로 이루어집니다:

```
Lorebook ──setvar──> Variable ──getvar──> Regex
Lorebook ──setvar──> Variable ──getState──> Lua Function
Lua Function ──setState──> Variable ──getvar──> Lorebook
```

Variable이 아닌 직접 관계:

```
Lorebook ──activation-chain──> Lorebook    (키워드 기반 재귀 활성화)
Lorebook ──text-mention──> Lorebook        (텍스트 내 이름 언급)
Lua Function ──lore-direct──> Lorebook     (lorebook API 호출 / bulk load)
Lua Function ──lua-call──> Lua Function    (함수 간 호출)
Trigger Keyword ──keyword──> Lorebook      (키워드 → 엔트리 활성화)
```


---

## 도메인 타입 참조

관계 네트워크에서 사용하는 핵심 도메인 타입과 정의 위치입니다.

| 타입 | 위치 | 역할 |
|------|------|------|
| `ElementCBSData` | `domain/analyze/correlation.ts` | lorebook/regex의 CBS 변수 읽기/쓰기 집합 |
| `LorebookRegexCorrelation` | `domain/analyze/correlation.ts` | lorebook-regex 간 CBS 변수 공유 관계 (방향 포함) |
| `LorebookActivationChainResult` | `domain/lorebook/activation-chain.ts` | lorebook 간 재귀 활성화 체인 |
| `LorebookStructureResult` | `domain/lorebook/structure.ts` | lorebook 폴더 구조, 활성화 모드별 분류, 키워드 중첩 |
| `LuaAnalysisArtifact` | `domain/analyze/lua-core.ts` | Lua 분석 결과 (함수, 상태 변수, 호출 그래프, lorebook 상관관계) |
| `TextMentionEdge` | `domain/analyze/text-mention.ts` | lorebook 텍스트 내 변수/함수/lorebook 이름 언급 탐지 |
| `RegexScriptInfo` | `domain/analyze/dead-code.ts` | regex 스크립트 이름, in/out 패턴 메타 |
| `ForceGraphNode` / `ForceGraphEdge` | `shared/visualization-types.ts` | force-graph 시각화 노드/엣지 페이로드 |
| `ForceGraphPayload` | `shared/visualization-types.ts` | force-graph 전체 페이로드 (nodes, edges, groups, layout) |


---

## 파이프라인 흐름 (charx/module 기준)

```
1. collect     lorebook/regex/lua 원시 데이터 수집
                 ├── lorebookStructure    (폴더 구조, 활성화 모드)
                 ├── lorebookCBS          (CBS 변수 추출)
                 ├── regexCBS             (CBS 변수 추출)
                 ├── luaArtifacts         (Lua 정적 분석)
                 └── regexScriptInfos     (regex 메타)

2. correlate   아티팩트 간 상관관계 분석
                 ├── lorebookRegexCorrelation  (CBS 변수 공유)
                 ├── lorebookActivationChain   (재귀 활성화)
                 └── textMentions              (텍스트 언급)

3. report      HTML/Markdown 리포트 생성
                 └── buildRelationshipNetworkPanel(LorebookGraphData)
                       → ForceGraphPayload (nodes + edges + groups)
                       → VisualizationPanel (DiagramPanel, kind: 'force-graph')
```

## 호출 지점

`buildRelationshipNetworkPanel`은 다음 두 곳에서 호출됩니다:

- `charx/reporting/htmlRenderer.ts` — 캐릭터 카드 HTML 리포트
- `module/reporting/htmlRenderer.ts` — 모듈 HTML 리포트

preset/lua/compose 분석기는 관계 네트워크를 생성하지 않습니다. preset은 별도의 프롬프트 체인 그래프(`buildPromptChainGraphPanel`)를 사용합니다.
