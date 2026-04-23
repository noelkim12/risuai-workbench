# fs-helpers

이 페이지는 `risu-workbench-core/node`의 파일시스템 helper만 다룹니다. 공개 entry 경계는 [`../targets/node-entry.md`](../targets/node-entry.md), subtree 기준은 [`README.md`](README.md), 공통 문체 규칙은 [`../common/principles.md`](../common/principles.md)를 먼저 봅니다.

## source of truth

- 구현: [`../../../packages/core/src/node/fs-helpers.ts`](../../../packages/core/src/node/fs-helpers.ts)
- 공개 export 근거: [`../../../packages/core/src/node/index.ts`](../../../packages/core/src/node/index.ts)
- entry 경계 근거: [`../../../packages/core/tests/export-surface.test.ts`](../../../packages/core/tests/export-surface.test.ts), [`../../../packages/core/tests/domain-node-structure.test.ts`](../../../packages/core/tests/domain-node-structure.test.ts)

## 현재 surface

- sync: `ensureDir`, `writeJson`, `writeText`, `writeBinary`, `uniquePath`, `readJsonIfExists`, `readTextIfExists`, `dirExists`
- async: `ensureDirAsync`, `writeBinaryAsync`, `writeJsonAsync`, `writeTextAsync`, `readFileAsync`

모두 Node `fs`와 `fs/promises` 위의 얇은 adapter다. pure domain 의미론이나 workspace 규칙은 여기서 소유하지 않는다.

## helper 의미론

### 디렉토리 보장

- `ensureDir`, `ensureDirAsync`는 `mkdir(..., { recursive: true })`만 감싼다.
- async 버전은 process 내부 `createdDirs` 캐시를 둔다. 같은 경로를 다시 만들지 않으려는 최적화다.

### 쓰기 helper

- `writeJson`, `writeText`, `writeBinary`와 async variants는 모두 부모 디렉토리를 먼저 만든 뒤 파일을 쓴다.
- JSON은 항상 `JSON.stringify(data, null, 2)`로 저장한다.
- 별도 atomic write, file lock, rollback 보장은 없다.

### 읽기 helper

- `readJsonIfExists`는 파일이 없거나 JSON 파싱에 실패하면 `null`을 돌려준다.
- `readTextIfExists`는 파일이 없거나 읽기 실패면 빈 문자열을 돌려준다.
- `readFileAsync`는 그대로 `Buffer`를 읽는다. 존재 확인이나 fallback은 하지 않는다.

### 경로 helper

- `dirExists`는 경로가 있고 실제 디렉토리일 때만 `true`다.
- `uniquePath`는 `<name><ext>`, `<name>_1<ext>`, `<name>_2<ext>` 순으로 비어 있는 경로를 찾는다.

## boundary

- 이 helper는 파일과 디렉토리를 읽고 쓰는 Node adapter다.
- JSON payload의 의미, canonical workspace 규칙, artifact naming 정책은 각 domain/CLI 쪽에서 결정한다.
- 예를 들어 lorebook `_order.json`의 의미나 custom-extension 디렉토리 구조는 이 페이지 범위가 아니다. 그런 내용은 [`lorebook-io.md`](lorebook-io.md), [`json-listing.md`](json-listing.md), [`custom-extension-discovery.md`](custom-extension-discovery.md)에서 본다.

## 현재 확인된 근거 메모

- 이 helper 집합은 node entry export snapshot에 포함된다.
- root/domain entry에는 노출되지 않는다.
- 별도 단위 테스트 근거는 아직 얕고, 현재 문서는 코드 구현을 우선 truth로 쓴다.
