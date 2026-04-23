# rpack

이 페이지는 `risu-workbench-core/node`의 RPack encode helper만 다룹니다. pack workflow 전체나 asset layout까지 설명하지는 않습니다.

## source of truth

- 구현: [`../../../packages/core/src/node/rpack.ts`](../../../packages/core/src/node/rpack.ts)
- 사용 예시: [`../../../packages/core/src/cli/pack/module/workflow.ts`](../../../packages/core/src/cli/pack/module/workflow.ts), [`../../../packages/core/src/cli/pack/character/workflow.ts`](../../../packages/core/src/cli/pack/character/workflow.ts), [`../../../packages/core/src/cli/pack/preset/workflow.ts`](../../../packages/core/src/cli/pack/preset/workflow.ts)
- 공개 export 근거: [`../../../packages/core/tests/export-surface.test.ts`](../../../packages/core/tests/export-surface.test.ts)

## 현재 surface

- `encodeModuleRisum(moduleObj)`
- `encodeRPack(data)`
- `loadRPackEncodeMap()`

## encode 경계

### `encodeRPack`

- 입력은 `Buffer` 또는 문자열이다.
- `loadRPackEncodeMap()`으로 256-byte 치환표를 읽는다.
- 입력 바이트를 같은 길이의 출력 버퍼로 1:1 치환한다.
- 압축, msgpack, 암호화 같은 전처리는 이 helper가 하지 않는다.

### `encodeModuleRisum`

- `{ module: moduleObj, type: 'risuModule' }` JSON payload를 UTF-8로 만든다.
- 그 payload를 `encodeRPack`으로 치환한다.
- 결과 앞에 `[111, 0]`, little-endian 길이 4바이트를 붙이고, 마지막에 `[0]` terminator를 붙인다.

현재 구현은 module payload 하나만 넣는 최소 surface다. asset payload까지 포함한 multi-entry `.risum` 조립은 module pack workflow 내부 helper가 따로 맡는다.

## map loading 경계

### `loadRPackEncodeMap`

- 첫 호출 때만 map을 읽고 메모리에 캐시한다.
- 찾는 경로는 현재 `__dirname`, package root 기준 `assets/rpack_map.bin`, `process.cwd()/assets/rpack_map.bin` 순이다.
- 파일을 못 찾으면 예외를 던진다.
- 읽은 파일 길이가 512 미만이면 손상으로 보고 예외를 던진다.
- 실제 encode에는 앞 256바이트만 쓴다.

이 helper는 map 검색과 캐시만 맡는다. map 파일의 생성 규칙이나 upstream 포맷 역사까지는 다루지 않는다.

## 현재 코드에서의 위치

- character pack은 `module.risum`을 zip entry로 넣을 때 `encodeModuleRisum`을 쓴다.
- module pack은 asset이 포함된 자체 `.risum` 조립 과정 안에서 `encodeRPack`을 직접 재사용한다.
- preset pack은 msgpack, deflate, AES-GCM 이후 마지막 byte remap 단계로 `encodeRPack`을 쓴다.

## boundary

- 이 페이지는 byte-level encode surface만 다룬다.
- canonical workspace를 어떻게 읽어서 module/preset payload를 만드는지는 CLI pack workflow 쪽 책임이다.
- RPack decode helper는 현재 이 node entry에 없다.
