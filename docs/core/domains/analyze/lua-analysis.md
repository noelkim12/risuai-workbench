# Lua 분석 (Lua Analysis)

이 페이지는 Lua 분석기 모음(Lua Analyzer Family)을 통합하여 설명합니다. 현재 다루는 범위는 `lua-api.ts`, `lua-helpers.ts`, `lua-analysis-types.ts`, `lua-collector.ts`, `lua-analyzer.ts`, `lua-core.ts`입니다. 헬퍼 모듈들을 개별 리프 페이지로 나누지 않고 이 문서에서 일괄 기술합니다.

## 현재 공개 인터페이스

루트 브라우저 엔트리에서 재내보내기되는 Lua 분석 인터페이스는 다음과 같습니다.

- `RISUAI_API`, `LUA_STDLIB_CALLS`
- `safeArray`, `lineStart`, `lineEnd`, `lineCount`, `nodeKey`, `callArgs`, `strLit`, `exprName`, `assignName`, `directCalleeName`, `sanitizeName`, `toModuleName`, `prefixOf`, `createMaxBlankRun`, `inferLuaFunctionName`, `LuaASTNode`
- `analyzeLuaSource`, `LuaAnalysisArtifact`
- `runCollectPhase`, `runAnalyzePhase`
- `CollectedFunction`, `CollectedStateVar`, `CollectedCall`, `CollectedApiCall`, `CollectedLoreApiCall`, `CollectedData`, `AnalyzePhaseResult`, `CorrelationEntry`, `LorebookCorrelation`, `RegexCorrelation`, `StateAccessOccurrence`

근거는 [`../../../../packages/core/src/domain/index.ts`](../../../../packages/core/src/domain/index.ts), [`../../targets/root-browser.md`](../../targets/root-browser.md), [`../../../../packages/core/tests/export-surface.test.ts`](../../../../packages/core/tests/export-surface.test.ts)입니다.

## 파일별 역할 명세

| 파일 | 주요 역할 |
|---|---|
| `lua-api.ts` | RisuAI Lua API 메타데이터 및 표준 라이브러리(Stdlib) 무시 집합 관리 |
| `lua-helpers.ts` | AST 읽기, 이름 정규화, 공백 실행(Blank-run), 기본 이름(Basename) 추론 보조 |
| `lua-analysis-types.ts` | 수집 단계(Collect Phase), 분석 단계(Analyze Phase), 상관관계 결과 타입 정의 |
| `lua-collector.ts` | AST 순회를 통한 함수, 호출, 상태 접근, 로어북 API, 프리로드/Require 정보 수집 |
| `lua-analyzer.ts` | 수집 결과 기반 호출 그래프(Call Graph), 피호출 정보(CalledBy), 모듈 그룹화, 레지스트리 변수 계산 |
| `lua-core.ts` | `luaparse` 진입점 관리, 수집/분석 실행, 선택적인 캐릭터 상관관계 결합 |

## 현재 구현 명세

### 진입점

- `analyzeLuaSource({ filePath, source, charxData? })`가 공개 진입점입니다.
- 내부적으로 `luaparse.parse()`를 `comments`, `locations`, `ranges`, `scope`, `luaVersion: '5.3'` 옵션으로 호출합니다.
- 결과물은 단일 `LuaAnalysisArtifact` 객체로 반환됩니다.

### 수집 단계 (Collect Phase)

- `runCollectPhase()`는 함수 정의, API 호출, 핸들러, 데이터 테이블, 상태 변수, 로어북 API 호출, 프리로드 모듈, Require 바인딩, 모듈 멤버 호출 내역을 수집합니다.
- 상태 접근(State Access)은 `getState`, `setState`, `getChatVar`, `setChatVar` 함수의 정적 문자열 키(Static String Key)만을 기록합니다.
- `getState(chat, "key")`, `setState(chat, "key", value)`, `getChatVar(triggerId, "key")`, `setChatVar(triggerId, "key", value)`와 같은 래퍼 형식도 지원합니다.
- 동적 키(Dynamic Key) 접근은 실제 발생 내역을 추론하지 않고 건너뜁니다.
- `listenEdit(...)`, `onStart`, `onInput`, `onOutput`, `onButtonClick`은 핸들러로 분류하여 기록합니다.
- `package.preload[...]` 및 `require()` 별칭 정보를 수집하여 후속 호출 그래프 해석에 활용합니다.

### 분석 단계 (Analyze Phase)

- `runAnalyzePhase()`는 수집된 호출 내역을 바탕으로 `callGraph`, `calledBy`, `resolvedModuleCalls`를 계산합니다.
- RisuAI API 및 Lua 표준 라이브러리 호출은 호출 그래프의 에지(Edge)에서 제외합니다.
- 현재 모듈 그룹화는 휴리스틱(Heuristic)을 통해 하나의 주 모듈을 선정하는 단일 모듈 중심의 결과만을 제공합니다.
- `stateOwnership` 및 `registryVars` 필드는 상태 변수의 사용 패턴을 요약합니다.
- `registryVars`는 현재 `setChatVar` / `getChatVar` 계열을 기준으로 권장 기본값 및 초기화 패턴을 정리합니다.

### 핵심 결과물 (Core Result)

`LuaAnalysisArtifact`는 다음과 같은 핵심 필드를 포함합니다.

- `filePath`, `baseName`, `sourceText`, `totalLines`
- `collected`: 수집 단계의 원본 결과
- `analyzePhase`: 분석 단계의 가공 결과
- `lorebookCorrelation`, `regexCorrelation` (선택적)
- `serialized`: 상태 변수, 함수, 핸들러 등의 JSON 직렬화 가능 뷰
- `elementCbs`: 현재 기본 이름을 요소명으로 사용하는 Lua CBS 브리지 엔트리

## 캐릭터 연동 경계

- `charxData`가 제공될 경우, `lua-core.ts`는 로어북 및 정규식 상관관계를 추가로 계산합니다.
- 로어북 상관관계는 최상위 `character_book.entries`를, 정규식 상관관계는 `extensions.risuai.customScripts`를 참조합니다.
- 데이터가 없을 경우 해당 상관관계 필드는 `null`로 유지됩니다.

## CLI 라우팅 명세

- 분석 CLI는 `.lua` 및 `.risulua` 파일을 Lua 분석 워크플로우로 전달합니다.
- 디렉토리 자동 판별은 Lua 파일이 아닌 캐릭터/모듈/프리셋 마커를 기준으로 수행됩니다.
- `--all` 옵션은 별도의 집계 모드이며 `workspace.yaml`에 선언된 아티팩트들을 순회합니다.
- 따라서 이 문서는 파일 단위 분석기 명세만을 다루며, 워크스페이스 전체 자동 판별 규칙은 [`./README.md`](./README.md) 및 [`../../targets/cli.md`](../../targets/cli.md)를 참조하십시오.

## 범위 경계

- 이 분석기 제품군은 정적 분석 결과만을 생성합니다. 실제 Lua 코드의 실행, 샌드박스 구동, 부수 효과(Side Effect) 재현은 수행하지 않습니다.
- 관계 네트워크 및 상호작용 흐름(Interaction Flow)의 HTML 셸 상세 구조는 이 문서의 보장 범위가 아닙니다.
- 다만, Lua 분석 결과가 브리지 에지(Bridge Edge) 및 상호작용 흐름의 원천 데이터로 활용됨은 실제 구현과 테스트를 통해 확정된 사항입니다.

## evidence anchors

- 소스: [`../../../../packages/core/src/domain/analyze/lua-api.ts`](../../../../packages/core/src/domain/analyze/lua-api.ts), [`../../../../packages/core/src/domain/analyze/lua-helpers.ts`](../../../../packages/core/src/domain/analyze/lua-helpers.ts), [`../../../../packages/core/src/domain/analyze/lua-analysis-types.ts`](../../../../packages/core/src/domain/analyze/lua-analysis-types.ts), [`../../../../packages/core/src/domain/analyze/lua-collector.ts`](../../../../packages/core/src/domain/analyze/lua-collector.ts), [`../../../../packages/core/src/domain/analyze/lua-analyzer.ts`](../../../../packages/core/src/domain/analyze/lua-analyzer.ts), [`../../../../packages/core/src/domain/analyze/lua-core.ts`](../../../../packages/core/src/domain/analyze/lua-core.ts)
- 테스트: [`../../../../packages/core/tests/lua-core.test.ts`](../../../../packages/core/tests/lua-core.test.ts), [`../../../../packages/core/tests/relationship-network-lua.test.ts`](../../../../packages/core/tests/relationship-network-lua.test.ts), [`../../../../packages/core/tests/lua-interaction-builder.test.ts`](../../../../packages/core/tests/lua-interaction-builder.test.ts)
- CLI 라우팅: [`../../../../packages/core/src/cli/analyze/workflow.ts`](../../../../packages/core/src/cli/analyze/workflow.ts)

## 같이 읽을 문서

- [`./correlation.md`](./correlation.md)
- [`./text-mention.md`](./text-mention.md)
- [`./README.md`](./README.md)
