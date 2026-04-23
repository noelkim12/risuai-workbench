# RPack 처리 (RPack)

이 페이지는 `risu-workbench-core/node`에 구현된 RPack 인코딩 헬퍼(RPack Encode Helper)만을 다룹니다. 전체 패키징 워크플로우나 에셋 레이아웃에 대한 상세 설명은 포함하지 않습니다.

## 신뢰 기준 (Source of Truth)

- 구현 명세: [`../../../packages/core/src/node/rpack.ts`](../../../packages/core/src/node/rpack.ts)
- 활용 사례: [`../../../packages/core/src/cli/pack/module/workflow.ts`](../../../packages/core/src/cli/pack/module/workflow.ts), [`../../../packages/core/src/cli/pack/character/workflow.ts`](../../../packages/core/src/cli/pack/character/workflow.ts), [`../../../packages/core/src/cli/pack/preset/workflow.ts`](../../../packages/core/src/cli/pack/preset/workflow.ts)
- 공개 내보내기 근거: [`../../../packages/core/tests/export-surface.test.ts`](../../../packages/core/tests/export-surface.test.ts)

## 노출 인터페이스

- `encodeModuleRisum(moduleObj)`
- `encodeRPack(data)`
- `loadRPackEncodeMap()`

## 인코딩 경계 명세

### `encodeRPack` 함수

- 입력값으로 `Buffer` 또는 문자열을 받습니다.
- `loadRPackEncodeMap()`을 통해 256바이트 크기의 치환표를 읽어들입니다.
- 입력 바이트를 동일한 길이의 출력 버퍼로 1:1 치환합니다.
- 압축, Msgpack, 암호화 등 별도의 전처리는 이 헬퍼에서 수행하지 않습니다.

### `encodeModuleRisum` 함수

- `{ module: moduleObj, type: 'risuModule' }` 형태의 JSON 페이로드를 생성(UTF-8 인코딩)합니다.
- 해당 페이로드를 `encodeRPack`을 사용하여 치환합니다.
- 결과물 앞에 `[111, 0]` 매직 넘버와 리틀 엔디언(Little-endian) 방식의 4바이트 길이를 부착하고, 마지막에 `[0]` 터미네이터(Terminator)를 추가합니다.

현재 구현은 모듈 페이로드 하나만을 포함하는 최소한의 인터페이스입니다. 에셋 페이로드를 포함한 멀티 엔트리(Multi-entry) `.risum` 조립은 모듈 패키징 워크플로우 내부의 별도 헬퍼가 담당합니다.

## 맵 로딩 경계 명세

### `loadRPackEncodeMap` 함수

- 최초 호출 시에만 치환표를 읽어 메모리에 캐싱합니다.
- 탐색 경로는 현재 `__dirname`, 패키지 루트 기준 `assets/rpack_map.bin`, `process.cwd()/assets/rpack_map.bin` 순서를 따릅니다.
- 파일을 찾을 수 없거나 읽어들인 파일의 길이가 512바이트 미만일 경우(데이터 손상 간주) 예외를 발생시킵니다.
- 실제 인코딩 작업에는 앞쪽의 256바이트만을 사용합니다.

이 헬퍼는 맵 파일의 검색 및 캐싱 역할만을 담당합니다. 맵 파일의 구체적인 생성 규칙이나 상위(Upstream) 포맷의 역사는 다루지 않습니다.

## 현재 구현상 위치

- 캐릭터 패키징: `module.risum` 파일을 ZIP 엔트리로 삽입할 때 `encodeModuleRisum`을 사용합니다.
- 모듈 패키징: 에셋이 포함된 독자적인 `.risum` 조립 과정에서 `encodeRPack`을 직접 재사용합니다.
- 프리셋 패키징: Msgpack, Deflate, AES-GCM 처리 이후 마지막 단계의 바이트 재매핑(Byte Remap)을 위해 `encodeRPack`을 사용합니다.

## 경계 명세 (Boundary)

- 이 페이지는 바이트 단위의 인코딩 인터페이스만을 다룹니다.
- 표준 워크스페이스를 해석하여 모듈/프리셋 페이로드를 구성하는 로직은 CLI 패키징 워크플로우의 책임입니다.
- RPack 디코딩 헬퍼는 현재 Node 엔트리에 포함되어 있지 않습니다.
