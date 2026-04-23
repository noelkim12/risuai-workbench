# token-budget

이 페이지는 `packages/core/src/domain/analyze/token-budget.ts`가 다루는 토큰 예산 analyzer만 설명합니다. CLI 리포트 배치나 HTML 셸 구조는 여기서 다루지 않습니다.

## 현재 public surface

- root browser entry에서 다시 export되는 surface는 `estimateTokens`, `analyzeTokenBudget`, `TokenComponent`, `TokenBudgetResult`, `TokenBudgetWarning`입니다. 근거는 [`../../../../packages/core/src/domain/index.ts`](../../../../packages/core/src/domain/index.ts), [`../../targets/root-browser.md`](../../targets/root-browser.md), [`../../../../packages/core/tests/export-surface.test.ts`](../../../../packages/core/tests/export-surface.test.ts)입니다.
- 현재 CLI analyze에서는 charx, module, preset workflow가 이 analyzer를 호출합니다. 근거는 [`../../../../packages/core/src/cli/analyze/charx/workflow.ts`](../../../../packages/core/src/cli/analyze/charx/workflow.ts), [`../../../../packages/core/src/cli/analyze/module/workflow.ts`](../../../../packages/core/src/cli/analyze/module/workflow.ts), [`../../../../packages/core/src/cli/analyze/preset/workflow.ts`](../../../../packages/core/src/cli/analyze/preset/workflow.ts)입니다.

## 현재 truth

- `estimateTokens(text)`는 모델 호출 없이 방향성 추정치만 계산합니다.
- CBS 매크로는 `\{\{...\}\}` 패턴으로 먼저 제거합니다.
- CJK 문자는 `TOKEN_RATIOS.CJK_CHARS_PER_TOKEN`, 그 외 문자는 `TOKEN_RATIOS.LATIN_CHARS_PER_TOKEN` 비율로 나눠 반올림합니다.
- `analyzeTokenBudget(components)`는 컴포넌트별 추정치, category 집계, always-active / conditional / worst-case 합계를 함께 반환합니다.
- 경고는 현재 두 종류뿐입니다. always-active 총량이 `TOKEN_THRESHOLDS.ERROR_ALWAYS_ACTIVE`를 넘으면 `error`, 단일 컴포넌트가 `TOKEN_THRESHOLDS.WARNING_SINGLE_COMPONENT`를 넘으면 `warning`입니다.

## 입력과 출력

### 입력

`TokenComponent`는 아래 필드를 가집니다.

- `category`, `name`, `text`
- `alwaysActive`, 항상 켜지는 텍스트인지 여부

### 출력

`TokenBudgetResult`는 아래 구조를 고정합니다.

- `components`, 컴포넌트별 `estimatedTokens`
- `byCategory`, category별 count / total / always-active 합계
- `totals`, `alwaysActiveTokens`, `conditionalTokens`, `worstCaseTokens`
- `warnings`, `severity`, `message`, optional `component`

이 페이지는 각 CLI report가 이 값을 어떻게 배치하는지까지는 보장하지 않습니다.

## 범위 경계

- 이 analyzer는 텍스트 길이 기반 추정만 다룹니다. 실제 모델 tokenizer 정확도는 보장하지 않습니다.
- lorebook 활성화 확률, prompt chain dependency, dead code 판정은 여기서 다루지 않습니다.
- threshold 상수의 source of truth는 [`../../../../packages/core/src/domain/analyze/constants.ts`](../../../../packages/core/src/domain/analyze/constants.ts)입니다.

## evidence anchors

- 소스: [`../../../../packages/core/src/domain/analyze/token-budget.ts`](../../../../packages/core/src/domain/analyze/token-budget.ts)
- 상수: [`../../../../packages/core/src/domain/analyze/constants.ts`](../../../../packages/core/src/domain/analyze/constants.ts)
- 테스트: [`../../../../packages/core/tests/token-budget.test.ts`](../../../../packages/core/tests/token-budget.test.ts)

## 같이 읽을 문서

- [`../../common/principles.md`](../../common/principles.md)
- [`./README.md`](./README.md)
- [`./variable-flow.md`](./variable-flow.md)
