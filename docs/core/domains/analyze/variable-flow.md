# 변수 흐름 분석 (Variable Flow)

이 페이지는 `packages/core/src/domain/analyze/variable-flow.ts` 및 `variable-flow-types.ts`에 정의된 CBS 변수 흐름 분석기(Variable Flow Analyzer)의 명세만을 다룹니다.

## 현재 공개 인터페이스

- 루트 브라우저 엔트리에서 재내보내기되는 함수는 `analyzeVariableFlow`입니다.
- 함께 노출되는 타입은 `VarEvent`, `VarFlowEntry`, `VarFlowIssue`, `VarFlowResult`입니다.
- 근거는 [`../../../../packages/core/src/domain/index.ts`](../../../../packages/core/src/domain/index.ts), [`../../targets/root-browser.md`](../../targets/root-browser.md), [`../../../../packages/core/tests/export-surface.test.ts`](../../../../packages/core/tests/export-surface.test.ts)입니다.

## 현재 구현 명세

- 입력으로 `ElementCBSData[]` 배열과 `defaultVariables` 맵을 받습니다.
- 분석기는 로어북, 정규식, Lua와 같은 요소(Element)의 읽기/쓰기(`reads` / `writes`) 내역을 `VarEvent`로 전개한 후 변수별로 그룹화합니다.
- 처리 단계(Phase)는 `PHASE_MAP` 및 `PipelinePhase` 정의에 따라 정렬됩니다.
- 동일 단계 내에서는 `executionOrder` 값이 클수록 먼저 실행되는 것으로 간주하여 정렬합니다.
- 동일 위치 비교 시, 쓰기(Write) 동작을 읽기(Read) 동작보다 우선하여 배치합니다.

## 현재 이슈 판정 규칙

`detectIssues()` 함수는 현재 다음과 같은 네 가지 유형의 이슈를 생성합니다.

- `uninitialized-read`: 기본값이 정의되지 않았으며 선행 쓰기 작업도 없는 상태에서 읽기가 발생하는 경우
- `write-only`: 쓰기 내역은 있으나 어디에서도 읽지 않는 변수
- `overwrite-conflict`: 서로 다른 요소(Element)에서 동일한 변수에 대해 둘 이상의 쓰기 작업을 수행하는 경우
- `phase-order-risk`: 읽기 작업보다 명백히 나중에 발생하는 쓰기 작업이 발견된 경우

반환되는 요약 정보(`summary`)는 `totalVariables`, `withIssues`, `byIssueType` 필드만을 확정합니다.

## 입력과 출력

- `VarEvent`는 `varName`, `action`, `phase`, `elementType`, `elementName` 필드와 선택적인 `executionOrder` 필드를 가집니다.
- `VarFlowEntry`는 변수별로 정렬된 이벤트 목록, `defaultValue`, `issues`를 포함합니다.
- `VarFlowIssue`는 `type`, `severity`, `message` 및 관련 `events` 정보를 담습니다.
- `VarFlowResult`는 전체 `variables[]` 목록과 `summary`를 반환합니다.

## 범위 경계

- 이 분석기는 CBS 사용 그래프(Usage Graph)를 기준으로 순서 리스크를 계산하며, 실제 런타임의 전체 스케줄러 동작을 완벽히 재현하지는 않습니다.
- 로어북 키워드 충돌이나 정규식 무효화(No-op) 판정은 [`./dead-code.md`](./dead-code.md)의 영역입니다.
- 여러 아티팩트를 통합한 충돌 점수 계산은 [`./composition.md`](./composition.md)의 영역입니다.

## evidence anchors

- 소스: [`../../../../packages/core/src/domain/analyze/variable-flow.ts`](../../../../packages/core/src/domain/analyze/variable-flow.ts), [`../../../../packages/core/src/domain/analyze/variable-flow-types.ts`](../../../../packages/core/src/domain/analyze/variable-flow-types.ts)
- 상수: [`../../../../packages/core/src/domain/analyze/constants.ts`](../../../../packages/core/src/domain/analyze/constants.ts)
- 테스트: [`../../../../packages/core/tests/variable-flow.test.ts`](../../../../packages/core/tests/variable-flow.test.ts)

## 같이 읽을 문서

- [`./dead-code.md`](./dead-code.md)
- [`./composition.md`](./composition.md)
- [`./README.md`](./README.md)
