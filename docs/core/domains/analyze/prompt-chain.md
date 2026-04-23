# prompt-chain

이 페이지는 preset 계열에서 ordered prompt/template 링크를 검사하는 prompt-chain analyzer만 설명합니다.

## 현재 public surface

- root browser entry에서 다시 export되는 surface는 `analyzePromptChain`, `PromptChainLink`, `PromptChainIssue`, `PromptChainResult`입니다.
- 근거는 [`../../../../packages/core/src/domain/index.ts`](../../../../packages/core/src/domain/index.ts), [`../../targets/root-browser.md`](../../targets/root-browser.md), [`../../../../packages/core/tests/export-surface.test.ts`](../../../../packages/core/tests/export-surface.test.ts)입니다.

## 현재 truth

- 입력은 ordered template 배열입니다. 각 항목은 `name`, `text`, `type`을 가집니다.
- analyzer는 각 링크에서 `extractCBSVarOps()`로 `cbsReads`, `cbsWrites`를 수집합니다.
- 토큰 수는 `estimateTokens()`를 재사용합니다.
- `{{#if::...}}` 또는 `{{#when::...}}`가 있으면 `hasConditional`을 켭니다.
- `writtenSoFar` 기준으로 각 링크의 `satisfiedDeps`, `unsatisfiedDeps`를 계산합니다.

## 현재 issue 판정

- `unsatisfied-dependency`, 아직 chain 내부에서 write되지 않은 변수를 read하는 링크
- `late-write`, 어떤 변수가 먼저 read되고 나중에 첫 write가 오는 경우
- `redundant-write`, 이전 write 뒤에 intervening read 없이 다시 write되는 경우
- `empty-link`, trim 결과가 빈 텍스트인 링크

## 출력 계약

`PromptChainResult`는 아래 필드를 가집니다.

- `chain`, 링크별 분석 결과
- `totalVariables`
- `selfContainedVars`, read와 write가 체인 내부에 모두 있는 변수
- `externalDeps`, read만 있고 chain 내부 write가 없는 변수
- `totalEstimatedTokens`
- `issues`

## 현재 사용 위치

- preset analyze workflow가 `buildPromptChainInputs(collected)` 결과를 이 analyzer에 넣습니다.
- preset markdown, html, wiki 산출물이 이 결과를 소비합니다.
- 테스트는 markdown/html에 Prompt Chain 섹션이 존재한다는 점까지만 고정합니다. 화면 레이아웃 세부는 이 페이지 범위가 아닙니다.

## 범위 경계

- 이 analyzer는 preset용 ordered chain만 다룹니다. charx, module의 lorebook/regex/lua correlation은 다루지 않습니다.
- token budget 전체 합계와 threshold 경고는 [`./token-budget.md`](./token-budget.md) 범위입니다.

## evidence anchors

- 소스: [`../../../../packages/core/src/domain/analyze/prompt-chain.ts`](../../../../packages/core/src/domain/analyze/prompt-chain.ts)
- preset workflow: [`../../../../packages/core/src/cli/analyze/preset/workflow.ts`](../../../../packages/core/src/cli/analyze/preset/workflow.ts)
- 테스트: [`../../../../packages/core/tests/prompt-chain.test.ts`](../../../../packages/core/tests/prompt-chain.test.ts), [`../../../../packages/core/tests/preset-analyze-workflow.test.ts`](../../../../packages/core/tests/preset-analyze-workflow.test.ts)

## 같이 읽을 문서

- [`./token-budget.md`](./token-budget.md)
- [`./dead-code.md`](./dead-code.md)
- [`./README.md`](./README.md)
