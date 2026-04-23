# variable-flow

이 페이지는 `packages/core/src/domain/analyze/variable-flow.ts`와 `variable-flow-types.ts`가 만드는 CBS 변수 흐름 analyzer만 설명합니다.

## 현재 public surface

- root browser entry에서 다시 export되는 함수는 `analyzeVariableFlow`입니다.
- 함께 다시 export되는 타입은 `VarEvent`, `VarFlowEntry`, `VarFlowIssue`, `VarFlowResult`입니다.
- 근거는 [`../../../../packages/core/src/domain/index.ts`](../../../../packages/core/src/domain/index.ts), [`../../targets/root-browser.md`](../../targets/root-browser.md), [`../../../../packages/core/tests/export-surface.test.ts`](../../../../packages/core/tests/export-surface.test.ts)입니다.

## 현재 truth

- 입력은 `ElementCBSData[]`와 `defaultVariables` 맵입니다.
- analyzer는 lorebook, regex, lua 같은 element의 `reads` / `writes`를 `VarEvent`로 펼친 뒤 변수별로 묶습니다.
- phase는 `PHASE_MAP`과 `PipelinePhase`를 따라 정렬합니다.
- 같은 phase 안에서는 `executionOrder`가 있으면 큰 값이 먼저 실행되는 것으로 정렬합니다.
- write는 같은 위치 비교에서 read보다 먼저 놓입니다.

## 현재 이슈 판정

`detectIssues()`가 현재 만드는 이슈 타입은 네 가지입니다.

- `uninitialized-read`, 기본값도 없고 선행 write도 없는 read
- `write-only`, write는 있지만 read가 없는 변수
- `overwrite-conflict`, 서로 다른 writer element가 둘 이상인 변수
- `phase-order-risk`, read보다 definitively later인 write가 발견된 경우

반환 summary는 `totalVariables`, `withIssues`, `byIssueType`만 고정합니다.

## 입력과 출력

- `VarEvent`는 `varName`, `action`, `phase`, `elementType`, `elementName`, optional `executionOrder`를 가집니다.
- `VarFlowEntry`는 변수별 ordered events, `defaultValue`, `issues`를 묶습니다.
- `VarFlowIssue`는 `type`, `severity`, `message`, 관련 `events`를 담습니다.
- `VarFlowResult`는 `variables[]`와 `summary`를 담습니다.

## 범위 경계

- 이 analyzer는 CBS usage graph를 기준으로 순서 리스크를 계산합니다. 실제 런타임 전체 스케줄러를 재현하지는 않습니다.
- lorebook keyword 충돌이나 regex no-op 판정은 [`./dead-code.md`](./dead-code.md) 범위입니다.
- 여러 아티팩트를 합친 충돌 점수는 [`./composition.md`](./composition.md) 범위입니다.

## evidence anchors

- 소스: [`../../../../packages/core/src/domain/analyze/variable-flow.ts`](../../../../packages/core/src/domain/analyze/variable-flow.ts), [`../../../../packages/core/src/domain/analyze/variable-flow-types.ts`](../../../../packages/core/src/domain/analyze/variable-flow-types.ts)
- 상수: [`../../../../packages/core/src/domain/analyze/constants.ts`](../../../../packages/core/src/domain/analyze/constants.ts)
- 테스트: [`../../../../packages/core/tests/variable-flow.test.ts`](../../../../packages/core/tests/variable-flow.test.ts)

## 같이 읽을 문서

- [`./dead-code.md`](./dead-code.md)
- [`./composition.md`](./composition.md)
- [`./README.md`](./README.md)
