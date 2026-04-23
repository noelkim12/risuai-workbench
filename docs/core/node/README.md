# node subtree

이 문서는 `packages/core/src/node/` 인덱스다. Node 전용 surface의 현재 경계와 leaf 탐색 순서를 여기서 고정한다.

## 이 subtree가 맡는 범위

- `packages/core/src/node/`는 Node 런타임 의존 어댑터를 둔다.
- public import 경로는 `risu-workbench-core/node`이며, 계약 요약은 [`../targets/node-entry.md`](../targets/node-entry.md)에 둔다.
- 이 페이지는 Node subtree 내부의 파일군과 현재 leaf 페이지 연결을 정한다.
- pure domain 의미론은 여기서 소유하지 않는다. 그런 내용은 [`../targets/root-browser.md`](../targets/root-browser.md)나 domain leaf 문서로 보낸다.

## 현재 export 묶음

`packages/core/src/node/index.ts` 기준 현재 Node entry는 아래 묶음을 다시 export한다.

| 묶음 | 현재 export 예시 |
|---|---|
| filesystem helper | `ensureDir`, `writeJson`, `writeText`, `writeBinary`, `uniquePath`, async variants, `readFileAsync` |
| PNG/card parsing | `parsePngTextChunks`, `stripPngTextChunks`, `decodeCharacterJsonFromChunks`, `parseCharxFile`, `parseCardFile`, PNG/JPEG constants |
| lorebook/json listing | `executeLorebookPlan`, `listJsonFilesRecursive`, `listJsonFilesFlat`, `resolveOrderedFiles`, `readJson`, `isDir` |
| packaging | `encodeModuleRisum`, `encodeRPack`, `loadRPackEncodeMap` |
| custom-extension workspace discovery | `discoverCustomExtensionWorkspace`, `listCanonicalFilesByArtifact`와 discovery types |

정확한 exported key set은 `../../packages/core/tests/export-surface.test.ts` snapshot이 고정한다.

## 현재 보장 범위

- `../../packages/core/package.json`은 `./node` subpath export를 공개한다.
- `../../packages/core/tests/node-entry.test.ts`는 이 subpath가 실제로 선언되어 있고 built node entry에서 `stripPngTextChunks`를 노출하는지 확인한다.
- `../../packages/core/tests/domain-node-structure.test.ts`는 Node 전용 helper가 domain entry에 섞이지 않는다는 점을 같이 확인한다.

이 셋이 현재 Node boundary 설명의 핵심 근거다.

## 현재 leaf 페이지

| 주제 | 페이지 |
|---|---|
| filesystem helper | [`fs-helpers.md`](fs-helpers.md) |
| PNG helper | [`png.md`](png.md) |
| charx/card I/O | [`charx-io.md`](charx-io.md) |
| lorebook I/O | [`lorebook-io.md`](lorebook-io.md) |
| JSON listing | [`json-listing.md`](json-listing.md) |
| rpack | [`rpack.md`](rpack.md) |
| custom-extension workspace discovery | [`custom-extension-discovery.md`](custom-extension-discovery.md) |

## subagent 권장 로드 조합

| 작업 유형 | 먼저 읽을 문서 |
|---|---|
| Node 공개 import 문구 수정 | [`../common/principles.md`](../common/principles.md) + [`../common/testing-and-evidence.md`](../common/testing-and-evidence.md) + [`../targets/node-entry.md`](../targets/node-entry.md) + 이 문서 |
| filesystem/PNG/helper leaf 문서 작성 | 이 문서 + `../../packages/core/src/node/index.ts` + 관련 구현 파일 |
| root와 node 경계 검증 | [`../targets/root-browser.md`](../targets/root-browser.md) + [`../targets/node-entry.md`](../targets/node-entry.md) + `../../packages/core/tests/domain-node-structure.test.ts` |
| CLI와의 관계 확인 | [`../targets/cli.md`](../targets/cli.md) + `../../packages/core/src/cli/main.ts` |

## leaf 사용 규칙

- 이 인덱스는 export 묶음과 탐색 순서만 다룬다.
- 개별 함수 입출력, buffer 형식, 파일 포맷 세부는 leaf 문서로 넘긴다.
- subtree 인덱스는 leaf가 이미 있을 때 링크를 유지하고, leaf 본문을 다시 복사하지 않는다.

## 같이 읽을 문서

- [`../common/principles.md`](../common/principles.md)
- [`../common/testing-and-evidence.md`](../common/testing-and-evidence.md)
- [`../targets/node-entry.md`](../targets/node-entry.md)
- [`../targets/cli.md`](../targets/cli.md)
- [`../targets/root-browser.md`](../targets/root-browser.md)
- [`../domains/analyze/README.md`](../domains/analyze/README.md)
