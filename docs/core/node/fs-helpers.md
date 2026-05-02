# 파일 시스템 헬퍼 (FS Helpers)

이 페이지는 `risu-workbench-core/node`에 정의된 파일 시스템 헬퍼(Filesystem Helpers)만을 다룹니다. 공개 엔트리 경계는 [`../targets/node-entry.md`](../targets/node-entry.md)를, 하위 트리 분류 기준은 [`README.md`](README.md)를, 공통 문체 규칙은 [`../common/principles.md`](../common/principles.md)를 참조하십시오.

## 신뢰 기준 (Source of Truth)

- 구현 명세: [`../../../packages/core/src/node/fs-helpers.ts`](../../../packages/core/src/node/fs-helpers.ts)
- 공개 내보내기 근거: [`../../../packages/core/src/node/index.ts`](../../../packages/core/src/node/index.ts)
- 엔트리 경계 근거: [`../../../packages/core/tests/export-surface.test.ts`](../../../packages/core/tests/export-surface.test.ts), [`../../../packages/core/tests/domain-node-structure.test.ts`](../../../packages/core/tests/domain-node-structure.test.ts)

## 노출 인터페이스

- 동기 방식(Sync): `ensureDir`, `writeJson`, `writeText`, `writeBinary`, `uniquePath`, `readJsonIfExists`, `readTextIfExists`, `dirExists`
- 비동기 방식(Async): `ensureDirAsync`, `writeBinaryAsync`, `writeJsonAsync`, `writeTextAsync`, `readFileAsync`

모든 함수는 Node.js 기본 `fs` 및 `fs/promises` 모듈을 래핑한 얇은 어댑터(Adapter)입니다. 순수 도메인 의미론이나 워크스페이스 구조 규칙은 여기서 다루지 않습니다.

## 헬퍼 상세 의미론

### 디렉토리 생성 및 보장

- `ensureDir`, `ensureDirAsync`: `mkdir(..., { recursive: true })` 호출을 래핑합니다.
- 비동기 버전은 프로세스 내부의 `createdDirs` 캐시를 유지합니다. 이는 동일한 경로에 대해 반복적인 디렉토리 생성 시도를 방지하기 위한 최적화입니다.

### 쓰기 헬퍼

- `writeJson`, `writeText`, `writeBinary` 및 비동기 변체들은 모두 파일 작성 전 부모 디렉토리의 존재를 보장합니다.
- JSON 작성 시에는 항상 `JSON.stringify(data, null, 2)` 형식을 사용하여 가독성을 유지합니다.
- 원자적 쓰기(Atomic write), 파일 잠금(File lock), 롤백(Rollback) 등의 고급 보증은 제공하지 않습니다.

### 읽기 헬퍼

- `readJsonIfExists`: 파일이 존재하지 않거나 JSON 파싱에 실패할 경우 `null`을 반환합니다.
- `readTextIfExists`: 파일이 없거나 읽기 작업에 실패할 경우 빈 문자열(`""`)을 반환합니다.
- `readFileAsync`: 파일을 읽어 `Buffer`를 반환합니다. 별도의 존재 여부 확인이나 폴백 처리는 수행하지 않습니다.

### 경로 및 상태 확인

- `dirExists`: 지정된 경로가 존재하며 실제 디렉토리 타입인 경우에만 `true`를 반환합니다.
- `uniquePath`: `<이름><확장자>`, `<이름>_1<확장자>`, `<이름>_2<확장자>` 순으로 중복되지 않는 고유 경로를 탐색합니다.

## 경계 명세 (Boundary)

- 이 헬퍼들은 파일 및 디렉토리 입출력을 위한 순수 Node.js 어댑터입니다.
- JSON 페이로드의 상세 의미, 표준 워크스페이스 규칙, 아티팩트 명명 정책 등은 도메인 또는 CLI 계층에서 결정합니다.
- 예를 들어, 로어북 `_order.json`의 구체적 의미나 커스텀 익스텐션 디렉토리 구조는 이 문서의 범위가 아닙니다. 해당 내용은 [`lorebook-io.md`](lorebook-io.md), [`json-listing.md`](json-listing.md), [`custom-extension-discovery.md`](custom-extension-discovery.md)를 참조하십시오.

## 확인된 근거 및 메모

- 이 헬퍼 집합은 Node 엔트리 내보내기 스냅샷에 포함되어 있습니다.
- 루트 또는 도메인 엔트리에는 노출되지 않습니다.
- 현재 별도의 단위 테스트 근거는 다소 부족하며, 이 문서는 실제 코드 구현을 최우선 신뢰 기준(Source of Truth)으로 삼습니다.
