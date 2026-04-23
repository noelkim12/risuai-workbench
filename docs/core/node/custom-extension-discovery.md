# custom-extension-discovery

이 페이지는 Node 쪽 custom-extension workspace discovery adapter를 다룹니다. canonical artifact format 규칙 자체를 다시 적지 않고, Node 런타임에서 어떤 파일을 어떤 bucket으로 수집하는지만 정리합니다.

## source of truth

- 구현: [`../../../packages/core/src/node/custom-extension-file-discovery.ts`](../../../packages/core/src/node/custom-extension-file-discovery.ts)
- pure domain 타입: [`../../../packages/core/src/domain/custom-extension/file-discovery.ts`](../../../packages/core/src/domain/custom-extension/file-discovery.ts), [`../../../packages/core/src/domain/custom-extension/contracts.ts`](../../../packages/core/src/domain/custom-extension/contracts.ts)
- 관련 테스트: [`../../../packages/core/tests/custom-extension/foundation.test.ts`](../../../packages/core/tests/custom-extension/foundation.test.ts), [`../../../packages/core/tests/export-surface.test.ts`](../../../packages/core/tests/export-surface.test.ts)
- canonical 규칙 인덱스: [`../../custom-extension/README.md`](../../custom-extension/README.md), [`../domains/custom-extension.md`](../domains/custom-extension.md)

## 현재 surface

- `discoverCustomExtensionWorkspace(rootDir)`
- `listCanonicalFilesByArtifact(rootDir, artifact)`
- discovery result types re-export

## discovery bucket

### 1. canonical files

- 확장자가 `.risu*`인 파일을 canonical candidate로 본다.
- suffix는 `parseCustomExtensionArtifactFromSuffix()`로 artifact id로 바꾼다.
- 현재 contract가 이해하는 artifact는 lorebook, regex, lua, prompt, toggle, variable, html이다.

### 2. marker files

- `_order.json`은 `order`
- `_folders.json`은 `folders`

파일 자체를 marker bucket으로만 모은다. marker 내용의 의미나 우선순위 규칙은 pure domain과 custom-extension 문서가 소유한다.

### 3. structured json files

- `.json` 파일 중 `manifest.json`이 아닌 것은 structured JSON bucket에 넣는다.
- 예를 들어 `metadata.json`, `advanced.json`, `provider/openai.json` 같은 파일이 여기에 들어간다.

## walk 규칙

- 루트가 디렉토리가 아니면 빈 discovery를 돌려준다.
- 하위 디렉토리를 재귀 순회한다.
- 각 디렉토리 엔트리는 이름 기준 사전순으로 정렬한 뒤 처리한다.
- 상대 경로는 항상 POSIX slash로 정규화한다.

`foundation.test.ts`는 이 결정이 canonical files, marker files, structured JSON files 모두에서 deterministic ordering으로 보이는지 확인한다.

## `listCanonicalFilesByArtifact`

- 먼저 전체 discovery를 만든다.
- 그다음 pure domain `filterCanonicalFilesByArtifact()`로 artifact 하나만 걸러낸다.
- 따라서 filtering 의미론은 domain에 있고, Node helper는 filesystem walk만 맡는다.

## boundary

- 이 helper는 workspace를 걷고 파일을 분류한다.
- `.risulorebook`, `.risuregex`, `.risulua`의 file format, round-trip, target ownership은 여기서 설명하지 않는다.
- 그런 canonical 규칙은 [`../../custom-extension/README.md`](../../custom-extension/README.md)와 관련 leaf 문서가 source of truth다.
- Node subtree에서는 discovery adapter만 설명한다. artifact business rule은 duplicate하지 않는다.
