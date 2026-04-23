# charx-io

이 페이지는 `risu-workbench-core/node`의 카드 입력 adapter를 다룹니다. 여기서 말하는 범위는 파일 경로를 읽어 JSON object로 바꾸는 것까지다. 카드 도메인 의미론이나 `.charx` archive workflow는 범위 밖이다.

## source of truth

- 구현: [`../../../packages/core/src/node/charx-io.ts`](../../../packages/core/src/node/charx-io.ts)
- 의존 helper: [`png.md`](png.md)
- CLI 사용 예시: [`../../../packages/core/src/cli/analyze/lua/workflow.ts`](../../../packages/core/src/cli/analyze/lua/workflow.ts), [`../../../packages/core/src/cli/analyze/lua/correlation.ts`](../../../packages/core/src/cli/analyze/lua/correlation.ts)
- entry 경계 근거: [`../../../packages/core/tests/domain-node-structure.test.ts`](../../../packages/core/tests/domain-node-structure.test.ts), [`../../../packages/core/tests/export-surface.test.ts`](../../../packages/core/tests/export-surface.test.ts), [`../../../packages/core/tests/root-entry-contract.test.ts`](../../../packages/core/tests/root-entry-contract.test.ts)

## 현재 surface

- `parseCharxFile(charxPath)`
- `parseCardFile`, 위 함수의 alias

## 지원 입력

### `.json`

- 파일을 UTF-8로 읽고 바로 `JSON.parse`한다.
- wrapper metadata를 더하지 않는다.

### `.png`

- PNG text chunk를 읽는다.
- `ccv3`, 없으면 `chara` payload를 찾아 base64 decode한다.
- decode된 문자열을 다시 `JSON.parse`해서 object를 돌려준다.

## 실패 동작

- 유효하지 않은 PNG면 `null`을 돌려주고 경고를 출력한다.
- PNG에 `ccv3`나 `chara`가 없으면 `null`을 돌려준다.
- decode된 JSON이 깨져 있어도 `null`을 돌려준다.
- 지원하지 않는 확장자면 `null`을 돌려준다.

현재 구현은 예외를 세분화하지 않고 CLI 친화적인 경고 문자열과 `null` fallback을 쓴다.

## boundary

- 이 helper는 `.json` 또는 `.png` 카드 입력 adapter다.
- `.charx` zip archive 해제는 여기서 하지 않는다. 그 경로는 [`../../../packages/core/src/cli/extract/character/phases.ts`](../../../packages/core/src/cli/extract/character/phases.ts)가 맡는다.
- PNG text chunk 조작 세부는 [`png.md`](png.md)에서 본다.
- character schema, module merge, lorebook extraction은 pure domain 또는 CLI workflow 관심사다.
