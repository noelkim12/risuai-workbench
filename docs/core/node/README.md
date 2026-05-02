# Node.js 하위 트리 (Node Subtree)

이 문서는 `packages/core/src/node/` 인덱스입니다. Node.js 전용 인터페이스의 현재 경계와 하위 리프(Leaf) 문서 탐색 순서를 정의합니다.

## 이 하위 트리가 담당하는 범위

- `packages/core/src/node/`는 Node.js 런타임 의존 어댑터를 포함합니다.
- 공개 임포트 경로는 `risu-workbench-core/node`이며, 명세 요약은 [`../targets/node-entry.md`](../targets/node-entry.md)를 참조하십시오.
- 이 페이지는 Node.js 하위 트리 내부의 파일군과 현재 리프 페이지 간의 연결 구조를 정의합니다.
- 순수 도메인 의미론은 여기서 다루지 않습니다. 해당 내용은 [`../targets/root-browser.md`](../targets/root-browser.md) 또는 도메인 리프 문서를 참조하십시오.

## 현재 내보내기 인터페이스

`packages/core/src/node/index.ts` 기준, 현재 Node 엔트리는 아래와 같은 기능들을 재내보내기합니다.

| 분류 | 주요 함수/상수 예시 |
|---|---|
| 파일 시스템 헬퍼 | `ensureDir`, `writeJson`, `writeText`, `writeBinary`, `uniquePath`, 비동기 변체, `readFileAsync` |
| PNG/카드 파싱 | `parsePngTextChunks`, `stripPngTextChunks`, `decodeCharacterJsonFromChunks`, `parseCharxFile`, `parseCardFile`, PNG/JPEG 관련 상수 |
| 로어북/JSON 리스팅 | `executeLorebookPlan`, `listJsonFilesRecursive`, `listJsonFilesFlat`, `resolveOrderedFiles`, `readJson`, `isDir` |
| 패키징 (Packaging) | `encodeModuleRisum`, `encodeRPack`, `loadRPackEncodeMap` |
| 커스텀 익스텐션 탐색 | `discoverCustomExtensionWorkspace`, `listCanonicalFilesByArtifact` 및 탐색 타입 정의 |

정확한 내보내기 키 집합은 `../../packages/core/tests/export-surface.test.ts` 스냅샷에서 확정합니다.

## 공개 엔트리 보장 명세

- `../../packages/core/package.json`은 `./node` 하위 경로 내보내기를 공개합니다.
- `../../packages/core/tests/node-entry.test.ts`는 이 하위 경로가 실제 선언되어 있으며 빌드된 Node 엔트리에서 `stripPngTextChunks`를 정상적으로 노출하는지 검증합니다.
- `../../packages/core/tests/domain-node-structure.test.ts`는 Node.js 전용 헬퍼가 도메인 엔트리에 혼입되지 않음을 검증합니다.

위 세 가지 사항이 현재 Node.js 경계 명세의 핵심 근거입니다.

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
