# composition

이 페이지는 여러 아티팩트를 한 번에 비교하는 composition analyzer만 설명합니다.

## 현재 public surface

- root browser entry에서 다시 export되는 surface는 `analyzeComposition`과 `ArtifactInput`, `CompositionInput`, `CompositionResult`, `CompositionConflict`, `CompositionConflictType`입니다.
- 근거는 [`../../../../packages/core/src/domain/index.ts`](../../../../packages/core/src/domain/index.ts), [`../../targets/root-browser.md`](../../targets/root-browser.md), [`../../../../packages/core/tests/export-surface.test.ts`](../../../../packages/core/tests/export-surface.test.ts)입니다.

## 현재 truth

- 입력은 optional `charx`, `modules[]`, optional `preset`입니다.
- analyzer는 모든 artifact의 `elements`와 `defaultVariables`를 합쳐 `mergedVariableFlow`를 만든 뒤, 조합 충돌을 별도로 수집합니다.
- 현재 충돌 타입은 여섯 가지입니다.
  - `variable-name-collision`, 서로 다른 artifact가 같은 변수에 다른 default를 쓰는 경우
  - `variable-overwrite-race`, merged flow에서 여러 artifact writer가 같은 변수를 덮는 경우
  - `regex-order-conflict`, 같은 `in` pattern이 여러 artifact에 있는 경우
  - `lorebook-keyword-collision`, 같은 lorebook keyword가 여러 artifact에 있는 경우
  - `namespace-missing`, module이 namespace 없이 global variable을 write하는 경우
  - `cbs-function-deprecation`, 타입은 정의돼 있지만 현재 구현에서 생성하지 않음
- `compatibilityScore`는 100에서 `error * 20`, `warning * 5`, `info * 1`을 뺀 뒤 0 아래로 내려가지 않게 clamp합니다.

## 입력과 출력

- `ArtifactInput`은 artifact 이름, 타입, `elements`, `defaultVariables`를 기본으로 가집니다.
- lorebook collision 계산에는 optional `lorebookKeywords`를 씁니다.
- regex collision 계산에는 optional `regexPatterns`를 씁니다.
- namespace 경고는 module artifact의 optional `namespace`를 봅니다.
- 결과 `CompositionResult`는 artifact 요약, `conflicts[]`, `mergedVariableFlow`, `summary`를 반환합니다.

## CLI와의 현재 연결

- compose는 analyze CLI에서 auto-detect 대상이 아닙니다. `--type compose`로 명시해야 합니다.
- compose workflow는 markdown, html, data.js 산출물을 만듭니다. 이 페이지는 그 산출물의 레이아웃이 아니라 analyzer contract만 다룹니다.
- 근거는 [`../../../../packages/core/src/cli/analyze/workflow.ts`](../../../../packages/core/src/cli/analyze/workflow.ts), [`../../../../packages/core/tests/composition-analysis.test.ts`](../../../../packages/core/tests/composition-analysis.test.ts)입니다.

## 범위 경계

- 개별 artifact 내부의 CBS 흐름 자체는 [`./variable-flow.md`](./variable-flow.md) 범위입니다.
- lorebook, regex, lua 간 pair correlation 계산은 [`./correlation.md`](./correlation.md) 범위입니다.

## evidence anchors

- 소스: [`../../../../packages/core/src/domain/analyze/composition.ts`](../../../../packages/core/src/domain/analyze/composition.ts)
- 테스트: [`../../../../packages/core/tests/composition-analysis.test.ts`](../../../../packages/core/tests/composition-analysis.test.ts)
- CLI 라우팅: [`../../../../packages/core/src/cli/analyze/workflow.ts`](../../../../packages/core/src/cli/analyze/workflow.ts)

## 같이 읽을 문서

- [`./variable-flow.md`](./variable-flow.md)
- [`./correlation.md`](./correlation.md)
- [`./README.md`](./README.md)
