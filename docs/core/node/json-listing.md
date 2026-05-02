# JSON 리스팅 (JSON Listing)

이 페이지는 Node.js 환경의 파일 나열 헬퍼(File Listing Helper)들을 다룹니다. 이 헬퍼들은 표준 아티팩트(Canonical Artifact)의 의미를 해석하지 않으며, 디렉토리 내에서 파일 후보를 결정론적(Deterministic)으로 수집하는 역할만을 수행합니다.

## 신뢰 기준 (Source of Truth)

- 구현 명세: [`../../../packages/core/src/node/json-listing.ts`](../../../packages/core/src/node/json-listing.ts)
- 활용 사례: [`../../../packages/core/src/cli/analyze/shared/cross-cutting.ts`](../../../packages/core/src/cli/analyze/shared/cross-cutting.ts), [`../../../packages/core/src/cli/build/workflow.ts`](../../../packages/core/src/cli/build/workflow.ts), [`../../../packages/core/src/cli/pack/preset/workflow.ts`](../../../packages/core/src/cli/pack/preset/workflow.ts)
- 관련 테스트: [`../../../packages/core/tests/util-characterization.test.ts`](../../../packages/core/tests/util-characterization.test.ts), [`../../../packages/core/tests/cross-cutting-canonical.test.ts`](../../../packages/core/tests/cross-cutting-canonical.test.ts), [`../../../packages/core/tests/export-surface.test.ts`](../../../packages/core/tests/export-surface.test.ts)

## 노출 인터페이스

- `listJsonFilesRecursive`
- `listJsonFilesFlat`
- `resolveOrderedFiles`
- `readJson`
- `isDir`

## 헬퍼 상세 의미론

### `listJsonFilesRecursive(rootDir)` 함수

- 대상 경로가 디렉토리가 아닐 경우 빈 배열을 반환합니다.
- 하위 디렉토리를 재귀적으로 순회합니다.
- `.json` 확장자 파일만을 포함합니다.
- `manifest.json` 및 `_order.json` 파일은 수집 대상에서 제외합니다.
- 반환값은 절대 경로 배열입니다.
- 최종 정렬 순서는 `rootDir` 기준 POSIX 상대 경로의 사전순입니다.

`util-characterization.test.ts`는 존재하지 않는 디렉토리 처리, 절대 경로 반환, 정렬 규칙, 마커 파일 제외 여부를 직접 검증합니다.

### `listJsonFilesFlat(rootDir)` 함수

- 현재 디렉토리 한 단계만을 탐색합니다.
- `.json` 파일 중 `_order.json`만을 수집에서 제외합니다.
- `manifest.json`은 플랫(Flat) 헬퍼의 제외 대상이 아닙니다.

### `resolveOrderedFiles(dir, files)` 함수

- `_order.json` 파일이 없을 경우 입력받은 파일 순서를 그대로 반환합니다.
- `_order.json` 파일이 존재하더라도 읽기에 실패하거나 배열 형식이 아닐 경우 입력을 그대로 유지합니다.
- 우선순위 파일: `_order.json` 배열에 명시된 상대 경로들을 우선적으로 배치합니다.
- 나머지 파일: 순서 목록에 없는 파일들은 POSIX 상대 경로 사전순으로 뒤에 추가합니다.
- 유효성 검사: 목록에 명시되어 있으나 실제 파일이 존재하지 않는 항목은 무시합니다.

`cross-cutting-canonical.test.ts`는 표준 `.risulorebook`, `.risuregex` 파일 수집 시 `_order.json`이 실제 우선순위로 올바르게 적용되는지 검증합니다.

### `readJson`, `isDir` 함수

- `readJson`: 단순한 `JSON.parse` 래퍼 함수입니다.
- `isDir`: 경로의 존재 여부 및 디렉토리 타입 여부만을 판별합니다.

## 현재 구현상 위치

- 분석(Analyze) 및 빌드(Build) 경로는 표준 `.risu*` 파일이 존재할 경우 이를 최우선으로 사용하며, 없을 경우 레거시(Legacy) JSON 폴백을 수집합니다.
- 이 과정에서 JSON 폴백 집계 및 `_order.json` 적용 시 해당 헬퍼가 활용됩니다.

## 경계 명세 (Boundary)

- 이 헬퍼는 파일 후보의 집계 및 정렬을 담당하는 어댑터입니다.
- 로어북, 정규식, 프롬프트 템플릿의 표준 포맷 상세는 여기서 다루지 않습니다.
- 커스텀 익스텐션 마커의 상세 의미는 [`custom-extension-discovery.md`](custom-extension-discovery.md) 및 [`../../custom-extension/README.md`](../../custom-extension/README.md)를 참조하십시오.
