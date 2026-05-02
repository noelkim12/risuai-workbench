# 토큰 예산 분석 (Token Budget)

이 페이지는 `packages/core/src/domain/analyze/token-budget.ts`에 정의된 토큰 예산 분석기(Token Budget Analyzer)의 명세만을 다룹니다. CLI 리포트의 배치 방식이나 HTML 셸 구조는 이 문서의 범위가 아닙니다.

## 현재 공개 인터페이스

- 루트 브라우저 엔트리에서 재내보내기되는 인터페이스는 `estimateTokens`, `analyzeTokenBudget` 함수와 `TokenComponent`, `TokenBudgetResult`, `TokenBudgetWarning` 타입입니다. 근거는 [`../../../../packages/core/src/domain/index.ts`](../../../../packages/core/src/domain/index.ts), [`../../targets/root-browser.md`](../../targets/root-browser.md), [`../../../../packages/core/tests/export-surface.test.ts`](../../../../packages/core/tests/export-surface.test.ts)입니다.
- 현재 CLI 분석 과정에서는 캐릭터, 모듈, 프리셋 워크플로우가 이 분석기를 호출합니다. 근거는 [`../../../../packages/core/src/cli/analyze/charx/workflow.ts`](../../../../packages/core/src/cli/analyze/charx/workflow.ts), [`../../../../packages/core/src/cli/analyze/module/workflow.ts`](../../../../packages/core/src/cli/analyze/module/workflow.ts), [`../../../../packages/core/src/cli/analyze/preset/workflow.ts`](../../../../packages/core/src/cli/analyze/preset/workflow.ts)입니다.

## 현재 구현 명세

- `estimateTokens(text)` 함수는 실제 모델 호출 없이 정해진 비율에 따른 방향성 추정치만을 계산합니다.
- CBS 매크로는 `\{\{...\}\}` 패턴을 사용하여 분석 전 단계에서 먼저 제거합니다.
- CJK(한중일) 문자는 `TOKEN_RATIOS.CJK_CHARS_PER_TOKEN`, 그 외 문자는 `TOKEN_RATIOS.LATIN_CHARS_PER_TOKEN` 비율을 적용하여 나누고 결과값을 반올림합니다.
- `analyzeTokenBudget(components)` 함수는 컴포넌트별 추정치, 카테고리별 집계, 상시 활성(Always-active)/조건부(Conditional)/최악의 경우(Worst-case) 합산 결과를 반환합니다.
- 현재 두 종류의 경고를 생성합니다. 상시 활성 토큰 총량이 `TOKEN_THRESHOLDS.ERROR_ALWAYS_ACTIVE`를 초과하면 `error`, 단일 컴포넌트가 `TOKEN_THRESHOLDS.WARNING_SINGLE_COMPONENT`를 초과하면 `warning`으로 판정합니다.

## 입력과 출력

### 입력

`TokenComponent`는 다음과 같은 필드로 구성됩니다.

- `category`, `name`, `text`: 컴포넌트 메타데이터 및 텍스트 내용
- `alwaysActive`: 해당 텍스트가 조건 없이 항상 포함되는지 여부

### 출력

`TokenBudgetResult`는 다음과 같은 구조를 확정합니다.

- `components`: 각 컴포넌트별 `estimatedTokens` 추정치
- `byCategory`: 카테고리별 개수, 합계, 상시 활성 토큰 합계 집계 정보
- `totals`: `alwaysActiveTokens`, `conditionalTokens`, `worstCaseTokens` 전체 합계
- `warnings`: `severity`, `message`, 선택적인 대상 `component` 정보

이 페이지는 개별 CLI 리포트가 위 값들을 시각적으로 배치하는 방식에 대해서는 보장하지 않습니다.

## 범위 경계

- 이 분석기는 텍스트 길이에 기반한 추정치만을 다룹니다. 실제 LLM 모델별 토크나이저(Tokenizer)와의 정확한 일치 여부는 보장하지 않습니다.
- 로어북 활성화 확률, 프롬프트 체인 의존성, 데드 코드 판정은 이 분석기의 소관이 아닙니다.
- 임계값 상수의 신뢰 기준(Source of Truth)은 [`../../../../packages/core/src/domain/analyze/constants.ts`](../../../../packages/core/src/domain/analyze/constants.ts)입니다.

## evidence anchors

- 소스: [`../../../../packages/core/src/domain/analyze/token-budget.ts`](../../../../packages/core/src/domain/analyze/token-budget.ts)
- 상수: [`../../../../packages/core/src/domain/analyze/constants.ts`](../../../../packages/core/src/domain/analyze/constants.ts)
- 테스트: [`../../../../packages/core/tests/token-budget.test.ts`](../../../../packages/core/tests/token-budget.test.ts)

## 같이 읽을 문서

- [`../../common/principles.md`](../../common/principles.md)
- [`./README.md`](./README.md)
- [`./variable-flow.md`](./variable-flow.md)
