# text-mention

이 페이지는 lorebook 본문에서 plain text 언급을 찾는 `text-mention` analyzer만 설명합니다.

## 현재 public surface

- root browser entry에서 다시 export되는 surface는 `analyzeTextMentions`, `TextMentionEdge`입니다.
- 근거는 [`../../../../packages/core/src/domain/index.ts`](../../../../packages/core/src/domain/index.ts), [`../../targets/root-browser.md`](../../targets/root-browser.md), [`../../../../packages/core/tests/export-surface.test.ts`](../../../../packages/core/tests/export-surface.test.ts)입니다.

## 현재 truth

- `analyzeTextMentions(entries, variables, functions, lorebookEntries?)`는 lorebook content를 스캔해 세 종류 edge를 만듭니다.
  - `variable-mention`
  - `lua-mention`
  - `lorebook-mention`
- 변수명, 함수명, lorebook term은 길이 3 미만이면 오탐 방지를 위해 제외합니다.
- 정규식은 `\b` 대신 `(^|[^a-zA-Z0-9_]) ... (?=[^a-zA-Z0-9_]|$)` 형태를 써서 한글과 유니코드 텍스트에서 경계를 잡습니다.
- lorebook mention은 entry name과 `keys[]`를 모두 searchable term으로 씁니다.
- 같은 term이 여러 entry를 가리키면 ambiguous로 보고 그 term은 버립니다.
- 같은 source entry에서 같은 target으로 중복 edge가 생기지 않도록 dedupe합니다.
- 자기 자신을 가리키는 lorebook mention은 만들지 않습니다.

## 출력 계약

`TextMentionEdge`는 아래 필드만 가집니다.

- `sourceEntry`
- `target`
- `type`

이 analyzer는 mention 위치, count, score를 반환하지 않습니다.

## 현재 사용 위치

- charx analyze workflow와 module analyze workflow가 lorebook, lua, 변수 집합을 모은 뒤 이 analyzer를 호출합니다.
- relationship network와 wiki chain 문서가 이 결과를 소비합니다.
- 근거는 [`../../../../packages/core/src/cli/analyze/charx/workflow.ts`](../../../../packages/core/src/cli/analyze/charx/workflow.ts), [`../../../../packages/core/src/cli/analyze/module/workflow.ts`](../../../../packages/core/src/cli/analyze/module/workflow.ts), [`../../../../packages/core/src/cli/analyze/shared/relationship-network-builders.ts`](../../../../packages/core/src/cli/analyze/shared/relationship-network-builders.ts)입니다.

## 범위 경계

- CBS `getvar` / `setvar` 자체 추출은 text-mention 범위가 아니라 correlation, variable-flow 계열 범위입니다.
- 이 analyzer는 plain text mention만 다룹니다. activation chain 판정이나 실제 cross-artifact dependency를 단독으로 보장하지 않습니다.

## evidence anchors

- 소스: [`../../../../packages/core/src/domain/analyze/text-mention.ts`](../../../../packages/core/src/domain/analyze/text-mention.ts)
- 테스트: [`../../../../packages/core/tests/text-mention.test.ts`](../../../../packages/core/tests/text-mention.test.ts)

## 같이 읽을 문서

- [`./correlation.md`](./correlation.md)
- [`./lua-analysis.md`](./lua-analysis.md)
- [`./README.md`](./README.md)
