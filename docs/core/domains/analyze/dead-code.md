# dead-code

이 페이지는 `detectDeadCode`가 만드는 정리 후보 분석만 다룹니다. 변수 흐름 계산 자체는 [`./variable-flow.md`](./variable-flow.md) 범위입니다.

## 현재 public surface

- root browser entry에서 다시 export되는 surface는 `detectDeadCode`와 `DeadCodeFinding`, `DeadCodeResult`, `DeadCodeType`, `LorebookEntryInfo`, `RegexScriptInfo`입니다.
- 근거는 [`../../../../packages/core/src/domain/index.ts`](../../../../packages/core/src/domain/index.ts), [`../../targets/root-browser.md`](../../targets/root-browser.md), [`../../../../packages/core/tests/export-surface.test.ts`](../../../../packages/core/tests/export-surface.test.ts)입니다.

## 현재 truth

- 입력은 `VarFlowResult`와 추가 context입니다.
  - `lorebookEntries: LorebookEntryInfo[]`
  - `regexScripts: RegexScriptInfo[]`
- 변수 관련 finding은 variable-flow issue를 재해석해 만듭니다.
  - `write-only` issue가 있으면 `write-only-variable`
  - `uninitialized-read` issue가 있으면 `uninitialized-variable`
- lorebook metadata에서는 아래 판정을 추가합니다.
  - enabled entry끼리 같은 keyword를 공유하면 insertionOrder가 더 낮은 쪽을 `shadowed-lorebook-keyword`
  - selective인데 `secondaryKeys`가 비어 있으면 `unreachable-lorebook-entry`
- regex metadata에서는 `in !== '' && in === out`인 경우만 `no-effect-regex`로 봅니다.

## 출력 계약

`DeadCodeFinding`은 아래 필드를 가집니다.

- `type`
- `severity`, 현재 `info` 또는 `warning`
- `elementType`, `elementName`
- `message`, optional `detail`

`DeadCodeResult.summary`는 `totalFindings`, `byType`, `bySeverity`를 담습니다.

## 범위 경계

- 이 analyzer는 cleanup candidate를 제안합니다. 실제 삭제 안전성까지 보장하지 않습니다.
- empty CBS condition 검출 타입은 `DeadCodeType`에 포함되어 있지만, 현재 `detectDeadCode()` 구현은 그 finding을 생성하지 않습니다. 코드가 source of truth입니다.
- prompt chain 전용 빈 링크 판정은 [`./prompt-chain.md`](./prompt-chain.md) 범위입니다.

## evidence anchors

- 소스: [`../../../../packages/core/src/domain/analyze/dead-code.ts`](../../../../packages/core/src/domain/analyze/dead-code.ts)
- 테스트: [`../../../../packages/core/tests/dead-code.test.ts`](../../../../packages/core/tests/dead-code.test.ts)

## 같이 읽을 문서

- [`./variable-flow.md`](./variable-flow.md)
- [`./prompt-chain.md`](./prompt-chain.md)
- [`./README.md`](./README.md)
