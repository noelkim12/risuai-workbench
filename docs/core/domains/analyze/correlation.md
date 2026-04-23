# correlation

이 페이지는 analyze subtree의 CBS correlation family를 설명합니다. 현재 leaf 범위는 `correlation.ts` 한 파일에 모인 통합 그래프, lorebook↔regex 상관관계, element pair 상관관계입니다.

## 현재 public surface

- root browser entry에서 다시 export되는 함수는 `buildUnifiedCBSGraph`, `buildLorebookRegexCorrelation`, `buildElementPairCorrelationFromUnifiedGraph`입니다.
- 함께 다시 export되는 타입은 `ElementCBSData`, `UnifiedVarEntry`, `LorebookRegexSharedVar`, `LorebookRegexCorrelation`, `ElementPairSharedVar`, `ElementPairCorrelation`입니다.
- 근거는 [`../../../../packages/core/src/domain/index.ts`](../../../../packages/core/src/domain/index.ts), [`../../targets/root-browser.md`](../../targets/root-browser.md), [`../../../../packages/core/tests/export-surface.test.ts`](../../../../packages/core/tests/export-surface.test.ts)입니다.

## 현재 truth

### 통합 그래프

- `buildUnifiedCBSGraph(allCollected, defaultVariables)`는 변수명을 key로 하는 `Map<string, UnifiedVarEntry>`를 만듭니다.
- 각 entry는 element type별 `readers`, `writers` source를 모읍니다.
- `defaultValue`는 provided default map에서 문자열로 채웁니다.
- `direction`은 단일 type만 있으면 `isolated`, 둘 이상 type에 걸치면 `bridged`입니다.
- 반환 map은 `bridged` 우선, `elementCount` 내림차순, 변수명 오름차순으로 정렬됩니다.

### lorebook ↔ regex 상관관계

- `buildLorebookRegexCorrelation(lorebookCBS, regexCBS)`는 두 집합의 read/write 방향을 비교합니다.
- 공유 변수는 `lorebook->regex`, `regex->lorebook`, `bidirectional` 중 하나로 정리됩니다.
- lorebook only, regex only 목록과 summary count를 함께 반환합니다.

### 임의 pair 상관관계

- `buildElementPairCorrelationFromUnifiedGraph(unifiedGraph, leftType, rightType)`는 통합 그래프에서 임의의 두 type을 뽑아 shared / left-only / right-only를 계산합니다.
- 현재 charx/module reporting은 이 함수를 lorebook↔lua, lua↔regex pair 요약에 재사용합니다.

## internal helper 메모

- 같은 파일에는 `extractLorebookCBSVariables`, `extractRegexCBSVariables`, `buildLorebookCorrelationFromEntries`, `buildRegexCorrelationFromScripts`도 있습니다.
- 이 helper들은 현재 root browser entry public surface로 다시 export되지 않습니다.
- 다만 Lua correlation을 만드는 내부 근거이므로 [`./lua-analysis.md`](./lua-analysis.md)와 함께 읽는 편이 좋습니다.

## 출력 타입 핵심

- `ElementCBSData`, element 단위 read/write 집합과 optional per-var label map
- `UnifiedVarEntry`, 통합 변수 한 건의 source map과 bridge 요약
- `LorebookRegexCorrelation`, lorebook↔regex 공유 변수 결과
- `ElementPairCorrelation`, 임의 pair의 shared / only / summary 결과

## 범위 경계

- lorebook activation chain은 이 페이지 범위가 아닙니다.
- variable issue 판정은 [`./variable-flow.md`](./variable-flow.md) 범위입니다.
- Lua collector / analyzer 자체는 [`./lua-analysis.md`](./lua-analysis.md) 범위입니다.

## evidence anchors

- 소스: [`../../../../packages/core/src/domain/analyze/correlation.ts`](../../../../packages/core/src/domain/analyze/correlation.ts)
- 테스트: [`../../../../packages/core/tests/domain-phase1-extraction.test.ts`](../../../../packages/core/tests/domain-phase1-extraction.test.ts)
- 소비 위치: [`../../../../packages/core/src/cli/analyze/charx/reporting.ts`](../../../../packages/core/src/cli/analyze/charx/reporting.ts), [`../../../../packages/core/src/cli/analyze/module/reporting.ts`](../../../../packages/core/src/cli/analyze/module/reporting.ts), [`../../../../packages/core/src/cli/analyze/shared/relationship-network-builders.ts`](../../../../packages/core/src/cli/analyze/shared/relationship-network-builders.ts)

## 같이 읽을 문서

- [`./variable-flow.md`](./variable-flow.md)
- [`./text-mention.md`](./text-mention.md)
- [`./lua-analysis.md`](./lua-analysis.md)
