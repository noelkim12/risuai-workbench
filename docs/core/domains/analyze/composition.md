# 구성 분석 (Composition)

이 페이지는 여러 아티팩트를 통합 비교하는 구성 분석기(Composition Analyzer)의 명세만을 다룹니다.

## 현재 공개 인터페이스

- 루트 브라우저 엔트리에서 재내보내기되는 인터페이스는 `analyzeComposition` 함수와 `ArtifactInput`, `CompositionInput`, `CompositionResult`, `CompositionConflict`, `CompositionConflictType` 타입입니다.
- 근거는 [`../../../../packages/core/src/domain/index.ts`](../../../../packages/core/src/domain/index.ts), [`../../targets/root-browser.md`](../../targets/root-browser.md), [`../../../../packages/core/tests/export-surface.test.ts`](../../../../packages/core/tests/export-surface.test.ts)입니다.

## 현재 구현 명세

- 입력으로 선택적인 `charx`, `modules[]`, `preset`을 받습니다.
- 분석기는 모든 아티팩트의 요소(Elements)와 기본 변수(Default Variables)를 병합하여 `mergedVariableFlow`를 생성한 후, 조합 과정에서의 충돌 사항을 별도로 수집합니다.
- 현재 감지하는 충돌 타입은 다음과 같습니다.
  - `variable-name-collision`: 서로 다른 아티팩트가 동일한 변수에 서로 다른 기본값을 정의한 경우
  - `variable-overwrite-race`: 병합된 흐름에서 여러 아티팩트의 작성자(Writer)가 동일한 변수를 덮어쓰는 경우
  - `regex-order-conflict`: 동일한 `in` 패턴이 여러 아티팩트에서 발견되는 경우
  - `lorebook-keyword-collision`: 동일한 로어북 키워드가 여러 아티팩트에서 발견되는 경우
  - `namespace-missing`: 모듈이 네임스페이스(Namespace) 지정 없이 전역 변수를 작성하는 경우
  - `cbs-function-deprecation`: 타입은 정의되어 있으나 현재 구현에서 생성하지 않는 경우
- `compatibilityScore`는 100점 만점에서 `error * 20`, `warning * 5`, `info * 1` 점을 차감하며, 0점 미만으로 내려가지 않도록 제한(Clamp)합니다.

## 입력과 출력

- `ArtifactInput`은 아티팩트 이름, 타입, 요소 리스트, 기본 변수 맵을 포함합니다.
- 로어북 충돌 계산에는 선택적인 `lorebookKeywords` 필드를 사용합니다.
- 정규식 충돌 계산에는 선택적인 `regexPatterns` 필드를 사용합니다.
- 네임스페이스 경고는 모듈 아티팩트의 선택적인 `namespace` 필드를 참조합니다.
- 최종 결과물인 `CompositionResult`는 아티팩트 요약, 충돌 목록(`conflicts[]`), 병합된 변수 흐름(`mergedVariableFlow`), 요약 정보(`summary`)를 반환합니다.

## CLI와의 연결

- `compose` 명령어는 분석 CLI에서 자동 감지 대상이 아닙니다. 반드시 `--type compose` 옵션으로 명시해야 합니다.
- 구성 분석 워크플로우는 Markdown, HTML, `data.js` 형태의 산출물을 생성합니다. 이 페이지는 산출물의 레이아웃이 아닌 분석기 명세(Contract)만을 다룹니다.
- 근거는 [`../../../../packages/core/src/cli/analyze/workflow.ts`](../../../../packages/core/src/cli/analyze/workflow.ts), [`../../../../packages/core/tests/composition-analysis.test.ts`](../../../../packages/core/tests/composition-analysis.test.ts)입니다.

## 범위 경계

- 개별 아티팩트 내부의 CBS 흐름 분석은 [`./variable-flow.md`](./variable-flow.md)의 영역입니다.
- 로어북, 정규식, Lua 간의 쌍별 상관관계(Pair Correlation) 계산은 [`./correlation.md`](./correlation.md)의 영역입니다.

## evidence anchors

- 소스: [`../../../../packages/core/src/domain/analyze/composition.ts`](../../../../packages/core/src/domain/analyze/composition.ts)
- 테스트: [`../../../../packages/core/tests/composition-analysis.test.ts`](../../../../packages/core/tests/composition-analysis.test.ts)
- CLI 라우팅: [`../../../../packages/core/src/cli/analyze/workflow.ts`](../../../../packages/core/src/cli/analyze/workflow.ts)

## 같이 읽을 문서

- [`./variable-flow.md`](./variable-flow.md)
- [`./correlation.md`](./correlation.md)
- [`./README.md`](./README.md)
