# 커스텀 익스텐션 탐색 (Custom Extension Discovery)

이 페이지는 Node.js 환경의 커스텀 익스텐션 워크스페이스 탐색 어댑터(Workspace Discovery Adapter)를 다룹니다. 표준 아티팩트 포맷(Canonical Artifact Format) 규칙 자체를 중복 기술하지 않으며, Node 런타임에서 어떤 파일을 수집하여 분류하는지에 집중합니다.

## 신뢰 기준 (Source of Truth)

- 구현 명세: [`../../../packages/core/src/node/custom-extension-file-discovery.ts`](../../../packages/core/src/node/custom-extension-file-discovery.ts)
- 순수 도메인 타입: [`../../../packages/core/src/domain/custom-extension/file-discovery.ts`](../../../packages/core/src/domain/custom-extension/file-discovery.ts), [`../../../packages/core/src/domain/custom-extension/contracts.ts`](../../../packages/core/src/domain/custom-extension/contracts.ts)
- 관련 테스트: [`../../../packages/core/tests/custom-extension/foundation.test.ts`](../../../packages/core/tests/custom-extension/foundation.test.ts), [`../../../packages/core/tests/export-surface.test.ts`](../../../packages/core/tests/export-surface.test.ts)
- 표준 규칙 인덱스: [`../../custom-extension/README.md`](../../custom-extension/README.md), [`../domains/custom-extension.md`](../domains/custom-extension.md)

## 노출 인터페이스

- `discoverCustomExtensionWorkspace(rootDir)`
- `listCanonicalFilesByArtifact(rootDir, artifact)`
- 탐색 결과 타입(Discovery Result Types) 재내보내기

## 탐색 분류 (Discovery Bucket)

### 1. 표준 파일 (Canonical Files)

- 확장자가 `.risu*`인 파일을 표준 아티팩트 후보로 간주합니다.
- 접미사(Suffix)는 `parseCustomExtensionArtifactFromSuffix()`를 통해 아티팩트 ID로 변환됩니다.
- 현재 명세에서 지원하는 아티팩트는 lorebook, regex, lua, prompt, toggle, variable, html입니다.

### 2. 마커 파일 (Marker Files)

- `_order.json`: 실행 순서 정의 (`order`)
- `_folders.json`: 폴더 구조 정의 (`folders`)

파일 자체를 마커 버킷(Marker Bucket)으로 수집합니다. 마커 내용의 해석이나 우선순위 규칙은 순수 도메인 및 커스텀 익스텐션 문서에서 담당합니다.

### 3. 구조화된 JSON 파일 (Structured JSON Files)

- `.json` 파일 중 `manifest.json`이 아닌 파일들을 수집합니다.
- `metadata.json`, `advanced.json`, `provider/openai.json` 등이 이 분류에 포함됩니다.

## 탐색(Walk) 규칙

- 루트 경로가 디렉토리가 아닐 경우 빈 탐색 결과를 반환합니다.
- 하위 디렉토리를 재귀적으로 순회합니다.
- 각 디렉토리 엔트리는 이름 기준 사전순으로 정렬하여 처리합니다.
- 상대 경로는 항상 POSIX 슬래시(`/`)로 정규화합니다.

`foundation.test.ts`는 위 규칙들이 표준 파일, 마커 파일, 구조화된 JSON 파일 모두에서 결정론적 순서(Deterministic Ordering)로 동작하는지 검증합니다.

## `listCanonicalFilesByArtifact` 함수

- 먼저 전체 탐색 결과를 생성합니다.
- 이후 순수 도메인의 `filterCanonicalFilesByArtifact()`를 사용하여 특정 아티팩트만을 필터링합니다.
- 즉, 필터링 의미론은 도메인 계층에 있으며, Node 헬퍼는 파일 시스템 순회(Walk)만을 담당합니다.

## 경계 명세 (Boundary)

- 이 헬퍼는 워크스페이스를 순회하며 파일을 분류하는 역할에 집중합니다.
- `.risulorebook`, `.risuregex`, `.risulua`의 파일 포맷, 왕복(Round-trip) 처리, 대상 소유권(Target Ownership) 등은 여기서 다루지 않습니다.
- 해당 표준 규칙은 [`../../custom-extension/README.md`](../../custom-extension/README.md) 및 관련 리프 문서가 신뢰 기준(Source of Truth)입니다.
- Node 하위 트리에서는 탐색 어댑터 명세만을 기술하며, 아티팩트 관련 비즈니스 로직을 중복하여 포함하지 않습니다.
