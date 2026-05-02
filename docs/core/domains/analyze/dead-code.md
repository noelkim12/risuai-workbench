# 데드 코드 분석 (Dead Code)

이 페이지는 `detectDeadCode` 함수가 생성하는 정리 후보 분석 명세만을 다룹니다. 변수 흐름 계산 자체는 [`./variable-flow.md`](./variable-flow.md)의 영역입니다.

## 현재 공개 인터페이스

- 루트 브라우저 엔트리에서 재내보내기되는 인터페이스는 `detectDeadCode` 함수와 `DeadCodeFinding`, `DeadCodeResult`, `DeadCodeType`, `LorebookEntryInfo`, `RegexScriptInfo` 타입입니다.
- 근거는 [`../../../../packages/core/src/domain/index.ts`](../../../../packages/core/src/domain/index.ts), [`../../targets/root-browser.md`](../../targets/root-browser.md), [`../../../../packages/core/tests/export-surface.test.ts`](../../../../packages/core/tests/export-surface.test.ts)입니다.

## 현재 구현 명세

- 입력으로 `VarFlowResult`와 다음과 같은 추가 문맥(Context)을 받습니다.
  - `lorebookEntries: LorebookEntryInfo[]`
  - `regexScripts: RegexScriptInfo[]`
- 변수 관련 발견 사항(Finding)은 변수 흐름 이슈를 재해석하여 생성합니다.
  - `write-only` 이슈 존재 시: `write-only-variable`로 분류
  - `uninitialized-read` 이슈 존재 시: `uninitialized-variable`로 분류
- 로어북 메타데이터 분석에서는 다음과 같은 판정 로직이 추가됩니다.
  - 활성화된 엔트리끼리 동일한 키워드를 공유할 경우, `insertionOrder`가 낮은 쪽을 `shadowed-lorebook-keyword`로 판정합니다.
  - 선택적 활성화(Selective) 상태이나 `secondaryKeys`가 비어 있는 경우 `unreachable-lorebook-entry`로 판정합니다.
- 정규식 메타데이터 분석에서는 `in !== '' && in === out` (입력과 출력이 동일)인 경우만을 `no-effect-regex`로 간주합니다.

## 출력 명세 (Contract)

`DeadCodeFinding`은 다음과 같은 필드로 구성됩니다.

- `type`: 데드 코드 유형
- `severity`: 현재 `info` 또는 `warning`으로 구분
- `elementType`, `elementName`: 대상 요소 정보
- `message`: 상세 메시지 (선택적으로 `detail` 포함)

`DeadCodeResult.summary`는 전체 발견 수(`totalFindings`), 유형별 집계(`byType`), 심각도별 집계(`bySeverity`)를 포함합니다.

## 범위 경계

- 이 분석기는 정리 후보를 제안할 뿐이며, 실제 삭제 시의 안전성까지 보장하지는 않습니다.
- 비어 있는 CBS 조건 검출 타입은 `DeadCodeType`에 정의되어 있으나, 현재 `detectDeadCode()` 구현에서는 해당 항목을 생성하지 않습니다. 실제 코드 구현이 신뢰 기준(Source of Truth)입니다.
- 프롬프트 체인 전용의 빈 링크 판정은 [`./prompt-chain.md`](./prompt-chain.md)의 영역입니다.

## evidence anchors

- 소스: [`../../../../packages/core/src/domain/analyze/dead-code.ts`](../../../../packages/core/src/domain/analyze/dead-code.ts)
- 테스트: [`../../../../packages/core/tests/dead-code.test.ts`](../../../../packages/core/tests/dead-code.test.ts)

## 같이 읽을 문서

- [`./variable-flow.md`](./variable-flow.md)
- [`./prompt-chain.md`](./prompt-chain.md)
- [`./README.md`](./README.md)
