# 로어북 I/O (Lorebook I/O)

이 페이지는 Node.js 환경의 로어북 추출 헬퍼(Lorebook Extraction Helper) 명세만을 다룹니다. 로어북의 표준 형식이나 활성화 의미론(Activation Semantics)은 이 문서에서 다루지 않습니다.

## 신뢰 기준 (Source of Truth)

- 구현 명세: [`../../../packages/core/src/node/lorebook-io.ts`](../../../packages/core/src/node/lorebook-io.ts)
- 계획 타입(Plan Type): [`../../../packages/core/src/domain/lorebook/folders.ts`](../../../packages/core/src/domain/lorebook/folders.ts)
- 활용 사례: [`../../../packages/core/src/cli/extract/character/phases.ts`](../../../packages/core/src/cli/extract/character/phases.ts), [`../../../packages/core/src/cli/extract/module/phases.ts`](../../../packages/core/src/cli/extract/module/phases.ts)
- 관련 테스트: [`../../../packages/core/tests/lorebook-folder-layout.test.ts`](../../../packages/core/tests/lorebook-folder-layout.test.ts), [`../../../packages/core/tests/charx-extract.test.ts`](../../../packages/core/tests/charx-extract.test.ts)

## 노출 인터페이스

- `executeLorebookPlan(plan, lorebooksDir)`

반환값은 `{ count, orderList, manifestEntries }` 구조를 가집니다.

## 헬퍼 상세 의미론

- 입력값으로 순수 도메인 계층의 `LorebookExtractionPlan`을 받습니다.
- 이 헬퍼는 계획(Plan)을 실제 파일 시스템 디렉토리 구조로 전개할 준비만을 수행합니다.
- 폴더 항목(Folder item) 처리: 디렉토리를 생성하고, 중복되지 않도록 `orderList`에 폴더 경로를 추가합니다.
- 엔트리 항목(Entry item) 처리: 파일이 위치할 부모 디렉토리를 생성하고, `orderList`에 엔트리의 상대 경로를 기록합니다.
- `count`: 처리된 전체 엔트리 개수를 반환합니다.
- `manifestEntries`: 폴더 또는 엔트리의 소스 및 경로 정보를 원본 그대로 수집하여 보관합니다.

## 중요한 경계 사항

- 실제 `.risulorebook` 파일의 내용 작성은 이 헬퍼의 소관이 아닙니다. 호출자가 `writeText` 등을 통해 직접 작성해야 합니다.
- `_order.json` 파일 또한 이 헬퍼가 직접 저장하지 않습니다. CLI 추출 단계(Extract Phase)에서 반환된 `orderList`를 기반으로 별도 기록합니다.
- 로어북 폴더 식별자(Identity), 표준 프론트매터(Frontmatter), 경로 기반 왕복 규칙 등은 이 헬퍼가 아닌 도메인 기획자(Planner) 및 커스텀 익스텐션 문서에서 담당합니다.

## 현재 구현상 활용 방식

- 캐릭터/모듈 추출 단계에서 도메인 기획자 결과의 `.json` 경로를 `.risulorebook`으로 변환한 후 이 헬퍼를 호출합니다.
- 이후 호출자가 표준 내용(Canonical Content)을 직렬화하여 작성하고, `_order.json`을 별도로 기록합니다.
- `lorebook-folder-layout.test.ts` 및 `charx-extract.test.ts`는 최종 출력이 경로 기반 `_order.json` 및 실제 디렉토리 레이아웃을 정확히 따르는지 검증합니다.

## 경계 명세 (Boundary)

- 이 페이지는 Node.js 파일 시스템 준비 과정만을 설명합니다.
- 로어북 엔트리의 내용 포맷은 [`../../custom-extension/extensions/lorebook.md`](../../custom-extension/extensions/lorebook.md)를 참조하십시오.
- 파일 나열 및 `_order.json` 적용 규칙은 [`json-listing.md`](json-listing.md)를 참조하십시오.
