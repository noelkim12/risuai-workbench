# 상관관계 분석 (Correlation)

이 페이지는 분석 하위 트리의 CBS 상관관계 모음(Correlation Family)을 설명합니다. 현재 리프 범위는 `correlation.ts` 파일에 정의된 통합 그래프, 로어북↔정규식 상관관계, 요소 쌍별(Element Pair) 상관관계입니다.

## 현재 공개 인터페이스

- 루트 브라우저 엔트리에서 재내보내기되는 함수는 `buildUnifiedCBSGraph`, `buildLorebookRegexCorrelation`, `buildElementPairCorrelationFromUnifiedGraph`입니다.
- 함께 노출되는 타입은 `ElementCBSData`, `UnifiedVarEntry`, `LorebookRegexSharedVar`, `LorebookRegexCorrelation`, `ElementPairSharedVar`, `ElementPairCorrelation`입니다.
- 근거는 [`../../../../packages/core/src/domain/index.ts`](../../../../packages/core/src/domain/index.ts), [`../../targets/root-browser.md`](../../targets/root-browser.md), [`../../../../packages/core/tests/export-surface.test.ts`](../../../../packages/core/tests/export-surface.test.ts)입니다.

## 현재 구현 명세

### 통합 그래프 (Unified Graph)

- `buildUnifiedCBSGraph(allCollected, defaultVariables)`는 변수명을 키(Key)로 사용하는 `Map<string, UnifiedVarEntry>`를 생성합니다.
- 각 엔트리는 요소 타입별 읽기(`readers`) 및 쓰기(`writers`) 출처를 수집합니다.
- 기본값(`defaultValue`)은 제공된 기본값 맵에서 문자열 형식으로 채워집니다.
- 방향성(`direction`)은 단일 타입만 존재할 경우 `isolated`, 둘 이상의 타입에 걸쳐 있을 경우 `bridged`로 판정합니다.
- 반환되는 맵은 `bridged` 타입 우선, 요소 개수(`elementCount`) 내림차순, 변수명 오름차순으로 정렬됩니다.

### 로어북 ↔ 정규식 상관관계

- `buildLorebookRegexCorrelation(lorebookCBS, regexCBS)`는 두 집합의 읽기/쓰기 방향을 비교합니다.
- 공유 변수는 `lorebook->regex`, `regex->lorebook`, `bidirectional` 중 하나로 분류됩니다.
- 로어북 전용, 정규식 전용 목록과 요약 개수를 함께 반환합니다.

### 임의 요소 쌍(Pair) 상관관계

- `buildElementPairCorrelationFromUnifiedGraph(unifiedGraph, leftType, rightType)`는 통합 그래프에서 임의의 두 타입을 추출하여 공유/좌측 전용/우측 전용 내역을 계산합니다.
- 현재 캐릭터/모듈 리포팅 기능은 이 함수를 사용하여 로어북↔Lua, Lua↔정규식 쌍의 요약을 생성합니다.

## 내부 헬퍼 메모

- 동일 파일에 `extractLorebookCBSVariables`, `extractRegexCBSVariables`, `buildLorebookCorrelationFromEntries`, `buildRegexCorrelationFromScripts` 함수가 포함되어 있습니다.
- 이 헬퍼들은 현재 루트 브라우저 엔트리 공개 인터페이스로 노출되지 않습니다.
- 다만, Lua 상관관계를 생성하는 내부 근거이므로 [`./lua-analysis.md`](./lua-analysis.md)와 함께 참조하는 것을 권장합니다.

## 주요 출력 타입

- `ElementCBSData`: 요소 단위의 읽기/쓰기 집합 및 선택적인 변수별 레이블 맵
- `UnifiedVarEntry`: 통합 변수 항목의 출처 맵 및 브리지(Bridge) 요약
- `LorebookRegexCorrelation`: 로어북과 정규식 간의 공유 변수 분석 결과
- `ElementPairCorrelation`: 임의 요소 쌍의 공유 및 전용 내역 요약 결과

## 범위 경계

- 로어북 활성화 체인(Activation Chain) 분석은 이 페이지의 범위를 벗어납니다.
- 변수 이슈 판정은 [`./variable-flow.md`](./variable-flow.md)의 영역입니다.
- Lua 수집기(Collector) 및 분석기 자체는 [`./lua-analysis.md`](./lua-analysis.md)의 영역입니다.

## evidence anchors

- 소스: [`../../../../packages/core/src/domain/analyze/correlation.ts`](../../../../packages/core/src/domain/analyze/correlation.ts)
- 테스트: [`../../../../packages/core/tests/domain-phase1-extraction.test.ts`](../../../../packages/core/tests/domain-phase1-extraction.test.ts)
- 소비 위치: [`../../../../packages/core/src/cli/analyze/charx/reporting.ts`](../../../../packages/core/src/cli/analyze/charx/reporting.ts), [`../../../../packages/core/src/cli/analyze/module/reporting.ts`](../../../../packages/core/src/cli/analyze/module/reporting.ts), [`../../../../packages/core/src/cli/analyze/shared/relationship-network-builders.ts`](../../../../packages/core/src/cli/analyze/shared/relationship-network-builders.ts)

## 같이 읽을 문서

- [`./variable-flow.md`](./variable-flow.md)
- [`./text-mention.md`](./text-mention.md)
- [`./lua-analysis.md`](./lua-analysis.md)
