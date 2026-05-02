# PNG 및 이미지 처리 (PNG)

이 페이지는 `risu-workbench-core/node`에 구현된 PNG/JPEG 헬퍼와 PNG 텍스트 청크 어댑터(Text Chunk Adapter)만을 다룹니다. 캐릭터 카드의 비즈니스 의미론은 [`charx-io.md`](charx-io.md) 또는 패키징 워크플로우(Pack Workflow) 문서를 참조하십시오.

## 신뢰 기준 (Source of Truth)

- 구현 명세: [`../../../packages/core/src/node/png.ts`](../../../packages/core/src/node/png.ts)
- 공개 내보내기 근거: [`../../../packages/core/src/node/index.ts`](../../../packages/core/src/node/index.ts)
- 활용 사례: [`../../../packages/core/src/cli/pack/character/workflow.ts`](../../../packages/core/src/cli/pack/character/workflow.ts), [`../../../packages/core/src/cli/extract/character/phases.ts`](../../../packages/core/src/cli/extract/character/phases.ts)
- 엔트리 경계 근거: [`../../../packages/core/tests/export-surface.test.ts`](../../../packages/core/tests/export-surface.test.ts), [`../../../packages/core/tests/node-entry.test.ts`](../../../packages/core/tests/node-entry.test.ts)

## 노출 인터페이스

- 주요 상수: `PNG_SIGNATURE`, `PNG_1X1_TRANSPARENT`, `JPEG_1X1`
- 형식 판별: `isPng`, `isJpeg`
- 텍스트 청크 읽기: `parsePngTextChunks`, `decodeCharacterJsonFromChunks`
- 텍스트 청크 쓰기: `stripPngTextChunks`, `writePngTextChunks`, `encodeTextChunk`, `encodeChunk`, `crc32`

## 텍스트 청크 읽기 경계 명세

### `parsePngTextChunks` 함수

- 유효한 PNG 시그니처가 아닐 경우 예외를 발생시킵니다.
- PNG 파일을 순회하며 `tEXt` 청크만을 추출합니다.
- 키(Key)는 ASCII, 값(Value)은 Latin1 인코딩으로 해석합니다.
- `iTXt` 및 `zTXt` 청크는 현재 읽기 대상에서 제외합니다.

### `decodeCharacterJsonFromChunks` 함수

- `ccv3` 키가 존재할 경우 이를 우선적으로 사용합니다.
- 없을 경우 `chara` 키를 확인합니다.
- 해당 값은 Base64로 인코딩된 UTF-8 JSON 문자열로 디코딩합니다.
- JSON 스키마 검증이나 캐릭터 데이터의 의미론적 해석은 수행하지 않습니다.

## 텍스트 청크 쓰기 경계 명세

### `stripPngTextChunks` 함수

- 입력값이 PNG 형식이 아닐 경우 원본 버퍼를 그대로 반환합니다.
- PNG 형식일 경우 `tEXt`, `iTXt`, `zTXt` 청크를 모두 제거하고 나머지 청크들만을 유지합니다.

### `writePngTextChunks` 함수

- 커버(Cover) 이미지를 원본 PNG 청크 단위로 읽어들인 후, 기존 텍스트 계열 청크와 `IEND` 청크를 제외한 모든 데이터를 보존합니다.
- 새로운 `tEXt` 청크들을 마지막에 삽입한 후 `IEND` 청크를 다시 부착합니다.
- 커버 이미지가 유효한 PNG가 아니거나 `IEND` 청크가 없을 경우 예외를 발생시킵니다.
- 캐릭터 패키징 워크플로우는 이 헬퍼를 사용하여 `ccv3` 및 에셋 청크를 커버 PNG에 삽입합니다.

### 저수준(Low-level) 헬퍼

- `encodeTextChunk`: `key\0value` 형태의 페이로드를 Latin1 인코딩으로 생성합니다.
- `encodeChunk`: `길이 + 타입 + 데이터 + CRC` 포맷의 청크를 생성합니다.
- `crc32`: 지연 테이블(Lazy Table) 방식으로 CRC32 값을 계산합니다.

## 이미지 헬퍼 경계 명세

- `PNG_1X1_TRANSPARENT` 및 `JPEG_1X1` 상수는 커버 이미지 부재 시 사용하는 폴백용 바이너리(Fallback Binary) 데이터입니다.
- `pack/character/workflow.ts`는 PNG 커버가 없을 때 1x1 PNG 폴백을, `charx-jpg` 출력 시에는 1x1 JPEG 폴백을 사용합니다.
- 이 상수들은 이미지 자리표시자(Placeholder) 기능만을 제공하며, 카드 포맷 정책 자체를 정의하지는 않습니다.

## 경계 명세 (Boundary)

- 이 페이지는 바이트 단위의 이미지 어댑터 및 PNG 텍스트 청크 입출력 명세만을 설명합니다.
- `ccv3` 페이로드가 실제로 어떤 캐릭터 의미론을 가지는지는 여기서 다루지 않습니다.
- `.png`와 `.json` 카드 입력 선택 방식은 [`charx-io.md`](charx-io.md)를, `.charx` ZIP 처리 및 커버 폴백 정책은 CLI 워크플로우 문서를 참조하십시오.

