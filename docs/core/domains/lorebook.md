# 로어북 도메인 (Lorebook Domain)

이 문서는 `packages/core/src/domain/lorebook/`가 담당하는 순수 로어북 구조 분석 및 활성화 체인(Activation Chain) 분석 명세만을 다룹니다.

## 이 페이지가 담당하는 범위

- 로어북 엔트리 배열을 구조 정보로 정규화하는 헬퍼
- 폴더 경로, 키워드 중첩(Overlap), 활성화 모드 계산 로직
- 로어북 내용(Content) 내의 정적 활성화 체인 발생 가능성 계산
- 로어북 내용의 CBS 읽기/쓰기 발생 내역 수집

## 구현 명세 (Current Truth)

- 루트 내보내기는 `analyzeLorebookStructure`, `analyzeLorebookStructureFromCharx`, `collectLorebookCBS`, `analyzeLorebookActivationChains`, `analyzeLorebookActivationChainsFromCharx`, `analyzeLorebookActivationChainsFromModule` 함수를 노출합니다.
- 구조 분석은 폴더 엔트리와 일반 엔트리를 구분하여 `folders`, `entries`, `stats`, `keywords` 데이터를 생성합니다.
- 활성화 모드는 `constant`, `keyword`, `keywordMulti`, `referenceOnly`의 네 가지로 정의됩니다.
- 체인 분석은 실제 런타임 실행 결과가 아닌, 내용 내 키워드 매칭을 바탕으로 한 정적 발생 가능성 분석입니다.
- 체인 에지의 상태(Edge Status)는 `possible`, `partial`, `blocked`로 분류됩니다.

## 주요 공개 인터페이스

| 구분 | 주요 인터페이스 예시 |
|---|---|
| 구조 분석 | `analyzeLorebookStructure`, `LorebookStructureEntry`, `LorebookStructureResult` |
| CBS 수집 | `collectLorebookCBS`, `collectLorebookCBSFromCharx`, `collectLorebookCBSFromCard` |
| 활성화 체인 | `analyzeLorebookActivationChains`, `analyzeLorebookActivationChainsFromCharx` |
| 체인 관련 타입 | `LorebookActivationEntry`, `LorebookActivationEdge`, `LorebookActivationChainResult` |
| 폴더 관련 헬퍼 | `buildRisuFolderMap`, `resolveRisuFolderName`, `planLorebookExtraction` |

## 현재 구현 확정 사항

- 구조 분석은 중첩된 폴더 경로를 `Root/Child/Entry` 형태의 경로 식별자(Path ID)로 보존합니다.
- 로어북 내용 중 `extractCBSVarOps` 분석 결과가 존재하는 경우, 이를 `hasCBS` 및 `collectLorebookCBS` 결과에 반영합니다.
- 활성화 체인 분석 시 `@@recursive`, `@@unrecursive`, `@@no_recursive_search` 지시어(Directive)를 해석합니다.
- 선택적 로어북(Selective Lorebook)은 보조 키(Secondary Key)가 누락된 경우 `partial` 상태로 유지됩니다.
- 캐릭터 카드 입력 시 `character_book.recursive_scanning` 값을 참조하여 전역 재귀 스캔의 활성화 여부를 반영합니다.

## 범위 명세 (Scope Boundary)

- `.risulorebook` 표준 파일 포맷 및 왕복 규칙은 이 문서의 소관이 아닙니다. 상세 사항은 [`../../custom-extension/extensions/lorebook.md`](../../custom-extension/extensions/lorebook.md)를 참조하십시오.
- 로어북 추출/패키징 워크플로우 및 디스크 레이아웃은 순수 도메인 계층의 범위를 벗어납니다.
- 로어북과 정규식, Lua를 결합한 상관관계 그래프 분석은 [`./analyze/README.md`](./analyze/README.md) 및 하위 문서에서 담당합니다.

## evidence anchors

- `../../../packages/core/src/domain/lorebook/structure.ts`
- `../../../packages/core/src/domain/lorebook/activation-chain.ts`
- `../../../packages/core/src/domain/lorebook/folders.ts`
- `../../../packages/core/tests/domain-phase1-extraction.test.ts`
- `../../../packages/core/tests/lorebook-activation-chain.test.ts`
- `../../../packages/core/tests/lorebook-folder-layout.test.ts`
- `../../../packages/core/tests/export-surface.test.ts`

## 같이 읽을 문서

- [`../targets/root-browser.md`](../targets/root-browser.md)
- [`./charx.md`](./charx.md)
- [`./module.md`](./module.md)
- [`../../custom-extension/extensions/lorebook.md`](../../custom-extension/extensions/lorebook.md)
