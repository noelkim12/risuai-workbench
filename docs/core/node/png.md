# png

이 페이지는 `risu-workbench-core/node`의 PNG, JPEG helper와 PNG text chunk adapter만 다룹니다. charx business 의미론은 [`charx-io.md`](charx-io.md)나 pack workflow 쪽에서 다룹니다.

## source of truth

- 구현: [`../../../packages/core/src/node/png.ts`](../../../packages/core/src/node/png.ts)
- 공개 export 근거: [`../../../packages/core/src/node/index.ts`](../../../packages/core/src/node/index.ts)
- 사용 예시: [`../../../packages/core/src/cli/pack/character/workflow.ts`](../../../packages/core/src/cli/pack/character/workflow.ts), [`../../../packages/core/src/cli/extract/character/phases.ts`](../../../packages/core/src/cli/extract/character/phases.ts)
- entry 경계 근거: [`../../../packages/core/tests/export-surface.test.ts`](../../../packages/core/tests/export-surface.test.ts), [`../../../packages/core/tests/node-entry.test.ts`](../../../packages/core/tests/node-entry.test.ts)

## 현재 surface

- 상수: `PNG_SIGNATURE`, `PNG_1X1_TRANSPARENT`, `JPEG_1X1`
- 판별: `isPng`, `isJpeg`
- text chunk read: `parsePngTextChunks`, `decodeCharacterJsonFromChunks`
- text chunk write: `stripPngTextChunks`, `writePngTextChunks`, `encodeTextChunk`, `encodeChunk`, `crc32`

## text chunk read 경계

### `parsePngTextChunks`

- 유효한 PNG signature가 아니면 예외를 던진다.
- PNG를 순회하면서 `tEXt` 청크만 읽는다.
- key는 ASCII, value는 latin1로 해석한다.
- `iTXt`, `zTXt`는 읽지 않는다.

### `decodeCharacterJsonFromChunks`

- `ccv3`가 있으면 그것을 먼저 쓴다.
- 없으면 `chara`를 본다.
- 값은 base64를 UTF-8 JSON 문자열로 디코딩한다.
- JSON schema 검증이나 charx 의미 해석은 하지 않는다.

## text chunk write 경계

### `stripPngTextChunks`

- PNG가 아니면 입력 버퍼를 그대로 돌려준다.
- PNG면 `tEXt`, `iTXt`, `zTXt`를 모두 제거하고 나머지 청크만 유지한다.

### `writePngTextChunks`

- cover 이미지를 raw PNG chunk로 읽은 뒤, 기존 text 계열 청크와 `IEND`를 제외한 청크를 보존한다.
- 새 `tEXt` 청크들을 마지막에 다시 넣고 `IEND`를 새로 붙인다.
- cover가 유효한 PNG가 아니거나 `IEND`가 없으면 예외를 던진다.
- pack character workflow는 이 helper로 `ccv3`와 asset chunk를 cover PNG에 다시 심는다.

### low-level helper

- `encodeTextChunk`는 `key\0value` payload를 latin1로 만든다.
- `encodeChunk`는 `length + type + data + crc` 포맷을 만든다.
- `crc32`는 lazy table 방식으로 CRC32를 계산한다.

## 이미지 helper 경계

- `PNG_1X1_TRANSPARENT`, `JPEG_1X1`는 cover fallback binary다.
- `pack/character/workflow.ts`는 PNG cover가 없을 때 1x1 PNG fallback을, `charx-jpg` 출력에서는 1x1 JPEG fallback을 쓴다.
- 이 상수는 이미지 placeholder만 제공한다. 카드 포맷 정책을 설명하지는 않는다.

## boundary

- 이 페이지는 바이트 단위 image adapter와 PNG text chunk 입출력만 설명한다.
- `ccv3` payload가 실제로 어떤 character semantics를 가지는지는 여기서 다루지 않는다.
- `.png`와 `.json` 카드 입력 선택은 [`charx-io.md`](charx-io.md), `.charx` zip 처리와 cover fallback 정책은 CLI workflow 문서를 봐야 한다.
