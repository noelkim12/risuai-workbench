# 캐릭터 I/O (Charx I/O)

이 페이지는 `risu-workbench-core/node`에 정의된 캐릭터 카드 입력 어댑터(Card Input Adapter)를 다룹니다. 이 문서의 범위는 파일 경로를 읽어 JSON 객체로 변환하는 단계까지를 포함하며, 카드 도메인 의미론이나 `.charx` 아카이브 워크플로우는 다루지 않습니다.

## 신뢰 기준 (Source of Truth)

- 구현 명세: [`../../../packages/core/src/node/charx-io.ts`](../../../packages/core/src/node/charx-io.ts)
- 의존 헬퍼: [`png.md`](png.md)
- CLI 활용 예시: [`../../../packages/core/src/cli/analyze/lua/workflow.ts`](../../../packages/core/src/cli/analyze/lua/workflow.ts), [`../../../packages/core/src/cli/analyze/lua/correlation.ts`](../../../packages/core/src/cli/analyze/lua/correlation.ts)
- 엔트리 경계 근거: [`../../../packages/core/tests/domain-node-structure.test.ts`](../../../packages/core/tests/domain-node-structure.test.ts), [`../../../packages/core/tests/export-surface.test.ts`](../../../packages/core/tests/export-surface.test.ts), [`../../../packages/core/tests/root-entry-contract.test.ts`](../../../packages/core/tests/root-entry-contract.test.ts)

## 노출 인터페이스

- `parseCharxFile(charxPath)`
- `parseCardFile`: 상기 함수의 별칭(Alias)

## 지원하는 입력 형식

### `.json`

- 파일을 UTF-8 인코딩으로 읽어 즉시 `JSON.parse`를 수행합니다.
- 별도의 래퍼 메타데이터(Wrapper Metadata)를 추가하지 않습니다.

### `.png`

- PNG의 텍스트 청크(Text Chunk)를 읽어들입니다.
- `ccv3` 키를 우선적으로 탐색하며, 없을 경우 `chara` 페이로드를 찾아 Base64 디코딩을 수행합니다.
- 디코딩된 문자열을 다시 `JSON.parse`하여 객체 형태로 반환합니다.

## 실패 시 동작

- 유효하지 않은 PNG 형식일 경우 `null`을 반환하고 경고 메시지를 출력합니다.
- PNG 내부에 `ccv3`나 `chara` 키가 존재하지 않으면 `null`을 반환합니다.
- 디코딩된 JSON이 파손된 상태여도 `null`을 반환합니다.
- 지원하지 않는 확장자인 경우 `null`을 반환합니다.

현재 구현은 예외를 세분화하여 던지는 대신, CLI 친화적인 경고 문자열 출력과 `null` 반환을 통한 폴백(Fallback) 방식을 사용합니다.

## 경계 명세 (Boundary)

- 이 헬퍼는 `.json` 또는 `.png` 카드 입력을 위한 전용 어댑터입니다.
- `.charx` ZIP 아카이브의 해제는 여기서 담당하지 않으며, [`../../../packages/core/src/cli/extract/character/phases.ts`](../../../packages/core/src/cli/extract/character/phases.ts)에서 처리합니다.
- PNG 텍스트 청크 조작에 대한 상세 사항은 [`png.md`](png.md)를 참조하십시오.
- 캐릭터 스키마, 모듈 병합, 로어북 추출 등은 순수 도메인 또는 CLI 워크플로우의 관심사입니다.
