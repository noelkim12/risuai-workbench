# 프롬프트 체인 분석 (Prompt Chain)

이 페이지는 프리셋 계열에서 순서가 지정된 프롬프트/템플릿 연결 내역을 검증하는 프롬프트 체인 분석기(Prompt Chain Analyzer)의 명세만을 다룹니다.

## 현재 공개 인터페이스

- 루트 브라우저 엔트리에서 재내보내기되는 인터페이스는 `analyzePromptChain` 함수와 `PromptChainLink`, `PromptChainIssue`, `PromptChainResult` 타입입니다.
- 근거는 [`../../../../packages/core/src/domain/index.ts`](../../../../packages/core/src/domain/index.ts), [`../../targets/root-browser.md`](../../targets/root-browser.md), [`../../../../packages/core/tests/export-surface.test.ts`](../../../../packages/core/tests/export-surface.test.ts)입니다.

## 현재 구현 명세

- 입력으로 순서가 지정된 템플릿 배열을 받습니다. 각 항목은 `name`, `text`, `type` 필드를 가집니다.
- 분석기는 각 링크(Link)에서 `extractCBSVarOps()`를 사용하여 CBS 읽기(`cbsReads`) 및 쓰기(`cbsWrites`) 내역을 수집합니다.
- 토큰 수 계산은 `estimateTokens()` 함수를 재사용합니다.
- `{{#if::...}}` 또는 `{{#when::...}}` 구문 발견 시 `hasConditional` 플래그를 활성화합니다.
- `writtenSoFar` 상태를 기준으로 각 링크의 충족된 의존성(`satisfiedDeps`)과 미충족 의존성(`unsatisfiedDeps`)을 계산합니다.

## 현재 이슈 판정

- `unsatisfied-dependency`: 체인 내부에서 아직 작성(Write)되지 않은 변수를 읽기(Read) 하려는 링크
- `late-write`: 특정 변수를 먼저 읽은 후, 나중에 첫 번째 쓰기 작업이 발생하는 경우
- `redundant-write`: 이전 쓰기 작업 이후 읽기 작업 없이 다시 쓰기가 발생하는 경우
- `empty-link`: 공백 제거(Trim) 결과가 빈 텍스트인 링크

## 출력 명세 (Contract)

`PromptChainResult`는 다음과 같은 필드로 구성됩니다.

- `chain`: 링크별 상세 분석 결과
- `totalVariables`: 전체 변수 개수
- `selfContainedVars`: 읽기와 쓰기가 모두 체인 내부에서 완결되는 변수
- `externalDeps`: 읽기 내역은 있으나 체인 내부의 쓰기 내역이 없는 변수
- `totalEstimatedTokens`: 전체 추정 토큰 수
- `issues`: 감지된 이슈 목록

## 현재 사용 위치

- 프리셋 분석 워크플로우가 `buildPromptChainInputs(collected)`의 결과를 이 분석기에 전달합니다.
- 프리셋 Markdown, HTML, Wiki 산출물에서 이 결과를 소비합니다.
- 테스트 코드는 Markdown/HTML에 프롬프트 체인 섹션이 존재함만을 보증하며, 구체적인 화면 레이아웃은 이 페이지의 소관이 아닙니다.

## 범위 경계

- 이 분석기는 프리셋 전용의 순차 체인만을 다룹니다. 캐릭터나 모듈의 로어북/정규식/Lua 상관관계는 분석하지 않습니다.
- 전체 토큰 예산 합산 및 임계값 경고는 [`./token-budget.md`](./token-budget.md)의 영역입니다.

## evidence anchors

- 소스: [`../../../../packages/core/src/domain/analyze/prompt-chain.ts`](../../../../packages/core/src/domain/analyze/prompt-chain.ts)
- preset workflow: [`../../../../packages/core/src/cli/analyze/preset/workflow.ts`](../../../../packages/core/src/cli/analyze/preset/workflow.ts)
- 테스트: [`../../../../packages/core/tests/prompt-chain.test.ts`](../../../../packages/core/tests/prompt-chain.test.ts), [`../../../../packages/core/tests/preset-analyze-workflow.test.ts`](../../../../packages/core/tests/preset-analyze-workflow.test.ts)

## 같이 읽을 문서

- [`./token-budget.md`](./token-budget.md)
- [`./dead-code.md`](./dead-code.md)
- [`./README.md`](./README.md)
