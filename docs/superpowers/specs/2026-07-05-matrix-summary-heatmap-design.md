# Matrix 요약 히트맵 + 콤보 에셋 모달 설계

날짜: 2026-07-05
상태: 설계 확정 대기 (사용자 리뷰 전)
대상: `packages/webview` Asset Manager Matrix 뷰

## 배경 / 문제

3슬롯 스키마에서 MatrixView는 s1 pin이 필수다(`computeMissingMatrixClient`가 s1 없이는 `null` 반환). 그래서 "어느 s1(캐릭터)이 덜 채워졌나"를 가로질러 비교할 방법이 없다. 에셋 파일은 수천 개 규모까지 가므로, 상세 셀을 s1 전체에 대해 펼치는 방식(small multiples, s1×s2 복합 행)은 스케일이 안 된다.

또한 기존 상세 매트릭스의 셀 클릭은 Grid 탭으로 점프(`onJumpToCombo`)하는데, 컨텍스트를 잃고 이동하는 UX라 보완이 필요하다.

## 결정 요약

1. **요약 히트맵 추가** — 3슬롯에서 s1 미선택("전체") 시 `행=s1 × 열=s2` 완성도 집계 매트릭스를 보여준다. 기존 상세 매트릭스(행=s2 × 열=s3, s1 pin)는 그대로 유지하고 둘 다 사용한다.
2. **셀 클릭 = 콤보 에셋 모달** — 요약/상세 매트릭스 공통으로, 셀 클릭 시 해당 조합에 매칭되는 에셋을 썸네일 그리드로 보여주는 모달을 띄운다. 모달 범위는 **보기 + 상세 진입**: 썸네일 클릭 시 기존 `AssetDetailModal`로 진입, "Grid 탭에서 열기" 버튼으로 기존 점프 기능 유지. 모달 안에서 할당 편집은 하지 않는다.

## 1. 데이터 계층 (gridModel.ts)

### SummaryMatrixClient (신규 타입)

기존 `MissingMatrixClient`는 셀 의미가 "파일 존재 상태"이므로, 집계 의미인 요약 매트릭스는 별도 타입으로 분리한다.

```ts
export type SummaryCellState = 'complete' | 'partial' | 'empty' | 'excluded';

export interface SummaryCellClient {
  readonly row: string;            // s1 값
  readonly col: string;            // s2 값
  readonly state: SummaryCellState;
  readonly presentCount: number;   // 존재하는 expected s3 조합 수
  readonly expectedCount: number;  // expected s3 조합 수
  readonly duplicateCount: number; // 중복 파일이 있는 조합 수
  readonly missingValues: readonly string[]; // 빠진 s3 값 (툴팁용)
}

export interface SummaryMatrixClient {
  readonly rows: readonly string[]; // vocab.s1
  readonly cols: readonly string[]; // vocab.s2
  readonly cells: readonly (readonly SummaryCellClient[])[];
}
```

### computeSummaryMatrixClient(catalog) (신규 함수)

- 3슬롯 스키마 전용. 행 = `vocab.s1`, 열 = `vocab.s2`.
- 셀 (s1, s2) 집계:
  - `expectedListForClient(catalog, s1, 's2')`에 s2가 없으면 → `excluded`. 단, 실제 할당 파일이 존재하면 excluded가 아니라 집계 표시(2슬롯 `computeTwoSlotMatrix`의 excluded 의미론과 동일).
  - expected s3 목록 = `expectedListForClient(catalog, s1, 's3')`. 각 s3에 대해 `(s1, s2, s3)` 조합 파일 수를 세어 present/missing/duplicate 집계.
  - 상태: `presentCount === expectedCount` → complete, `0 < presentCount < expectedCount` → partial, `presentCount === 0` → empty.
- 구현: `groupAssignments(catalog, ['s1','s2','s3'])` 재사용 — 파일 전체를 1회 순회하므로 수천 개 파일에서도 저비용. 렌더 셀 수는 |s1|×|s2|로만 결정.

## 2. MatrixView.svelte

- 3슬롯에서도 s1 드롭다운에 `전체` 옵션을 추가하고 **기본값을 전체로** 변경 (26행의 강제 선택 reactive 제거).
- `selectedS1 === ''` && 3슬롯 → 요약 히트맵 렌더:
  - 셀 텍스트: `7/9` 형태 (`presentCount/expectedCount`). excluded는 `·`.
  - 셀 색: complete=success, partial=focus 계열, empty=error, excluded=muted (기존 `.cell--*` 팔레트 재사용). duplicateCount > 0이면 ⚠ 배지 병기.
  - 툴팁: 빠진 s3 목록 (`missingValues`, 길면 앞 N개 + "외 n개").
  - 행 헤더(s1) 클릭 시 `selectedS1 = 행` → 상세 매트릭스로 드릴다운 (드롭다운과 동일 동작의 지름길).
- 셀 클릭 동작 변경 (요약/상세 공통): `onJumpToCombo` 직접 호출 대신 신규 콜백 `onOpenCombo(values: (string | undefined)[])` 호출.
  - 상세 셀: `[s1, s2, s3]` (완전 조합)
  - 요약 셀: `[s1, s2, undefined]` (부분 조합 — s3 전체)
- Expected 편집 사이드패널: 변경 없음.

## 3. 콤보 에셋 모달 (신규 ComboAssetsModal.svelte)

모달 상태와 렌더는 **AssetManagerApp.svelte가 소유**한다. MatrixView는 `onOpenCombo`만 emit — MatrixView가 entries/이미지 소스를 몰라도 되게 유지.

- Props: `entries`(콤보 매칭 필터링된 목록), `catalog`, `assetImageSrc`, `comboLabel`, `onClose`, `onOpenDetail(path)`, `onJumpToGrid()`.
- 내용:
  - 헤더: 조합 라벨 (예: `앨리스 / 캐주얼 / *`) + 매칭 수.
  - 썸네일 그리드 (스크롤, 가상화 없음 — 콤보 매칭 수는 작음. 부분 조합이 커질 경우 대비 상한 없이 스크롤로 처리).
  - 매칭 0개(missing 셀)인 경우: 빈 상태 문구 + "Grid 탭에서 열기"로 유도.
  - 썸네일 클릭 → 기존 `AssetDetailModal` 오픈 (prev/next 네비게이션은 콤보 매칭 부분집합 내에서 순환).
  - "Grid 탭에서 열기" 버튼 → 기존 `jumpToCombo` 호출 후 모달 닫기 (완전/부분 조합 모두 preset query로 전달).
- AssetManagerApp: 콤보 → entries 필터는 `entry.assignment`의 슬롯 값 매칭(undefined 슬롯은 와일드카드)으로 수행.

## 4. 스케일 가드

- 집계는 파일 1회 순회. 히트맵 렌더는 |s1|×|s2| 셀 — 수백×수십 규모까지는 기존 `matrix-scroll` + sticky 헤더로 감당. 수만 셀이 실측으로 문제되면 그때 가상화 도입 (초기 구현 제외).
- 콤보 모달 썸네일은 매칭 부분집합만 렌더하므로 파일 총량과 무관.

## 5. 테스트

- `gridModel.test.ts`:
  - 요약 집계: complete/partial/empty 판정, expected s3 override 반영.
  - excluded 판정: expected s2 밖 + 파일 없음 → excluded, 파일 있으면 집계 표시.
  - duplicateCount 집계, 빈 vocab(행 없음 → 빈 매트릭스).
- 콤보 필터: 완전 조합/부분 조합(undefined 와일드카드) 매칭 유닛 테스트 (AssetManagerApp에서 순수 함수로 분리해 gridModel에 두고 테스트).

## 범위 제외 (YAGNI)

- 모달 내 할당 편집·선택·tokenize (Grid 탭 책임 유지)
- 히트맵 가상화
- 2슬롯 스키마 동작 변경 (셀 클릭 → 모달 전환만 공통 적용)
