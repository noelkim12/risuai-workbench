# json-listing

이 페이지는 Node 쪽 파일 나열 helper를 다룹니다. 이 helper들은 canonical artifact의 의미를 해석하지 않고, 디렉토리에서 파일 후보를 deterministic하게 모으는 역할만 합니다.

## source of truth

- 구현: [`../../../packages/core/src/node/json-listing.ts`](../../../packages/core/src/node/json-listing.ts)
- 사용 예시: [`../../../packages/core/src/cli/analyze/shared/cross-cutting.ts`](../../../packages/core/src/cli/analyze/shared/cross-cutting.ts), [`../../../packages/core/src/cli/build/workflow.ts`](../../../packages/core/src/cli/build/workflow.ts), [`../../../packages/core/src/cli/pack/preset/workflow.ts`](../../../packages/core/src/cli/pack/preset/workflow.ts)
- 관련 테스트: [`../../../packages/core/tests/util-characterization.test.ts`](../../../packages/core/tests/util-characterization.test.ts), [`../../../packages/core/tests/cross-cutting-canonical.test.ts`](../../../packages/core/tests/cross-cutting-canonical.test.ts), [`../../../packages/core/tests/export-surface.test.ts`](../../../packages/core/tests/export-surface.test.ts)

## 현재 surface

- `listJsonFilesRecursive`
- `listJsonFilesFlat`
- `resolveOrderedFiles`
- `readJson`
- `isDir`

## helper 의미론

### `listJsonFilesRecursive(rootDir)`

- 디렉토리가 아니면 빈 배열이다.
- 하위 디렉토리를 재귀 순회한다.
- `.json`만 포함한다.
- `manifest.json`, `_order.json`은 제외한다.
- 반환값은 절대 경로 배열이다.
- 최종 정렬은 `rootDir` 기준 POSIX 상대 경로 사전순이다.

`util-characterization.test.ts`가 비존재 디렉토리, 절대 경로 반환, 정렬, marker 제외를 직접 확인한다.

### `listJsonFilesFlat(rootDir)`

- 현재 디렉토리 한 단계만 본다.
- `.json` 중 `_order.json`만 제외한다.
- `manifest.json`은 flat helper에서 제외하지 않는다.

### `resolveOrderedFiles(dir, files)`

- `_order.json`이 없으면 입력 순서를 그대로 돌려준다.
- `_order.json`이 있어도 읽기 실패나 non-array면 입력을 그대로 쓴다.
- order 배열에 있는 상대 경로를 먼저 배치한다.
- order에 없는 나머지는 POSIX 상대 경로 사전순으로 뒤에 붙인다.
- order에 적혔지만 실제 파일이 없는 항목은 무시한다.

`cross-cutting-canonical.test.ts`는 canonical `.risulorebook`, `.risuregex` 수집에서 `_order.json`이 실제 우선순위로 쓰이는지 확인한다.

### `readJson`, `isDir`

- `readJson`은 단순 `JSON.parse` wrapper다.
- `isDir`는 경로 존재와 디렉토리 여부만 본다.

## 현재 코드에서의 위치

- analyze/build path는 canonical `.risu*` 파일이 있으면 그것을 우선 쓰고, 없을 때 legacy JSON fallback을 수집한다.
- 이때 JSON fallback 집계와 `_order.json` 적용에 이 helper가 들어간다.

## boundary

- 이 helper는 파일 후보 집계와 정렬 adapter다.
- lorebook, regex, prompt-template의 canonical 포맷은 여기서 설명하지 않는다.
- custom-extension marker 의미는 [`custom-extension-discovery.md`](custom-extension-discovery.md)와 [`../../custom-extension/README.md`](../../custom-extension/README.md)를 본다.
