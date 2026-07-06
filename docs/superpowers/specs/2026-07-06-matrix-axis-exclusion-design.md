# Matrix View — 축 제외(axis exclusion) 필터

**Date:** 2026-07-06
**File touched (primary):** `packages/webview/src/lib/components/asset-manager/MatrixView.svelte`, `packages/webview/src/lib/asset-manager/gridModel.ts`

## 배경 / 문제

MatrixView 우측 사이드바의 "Expected 편집"은 선택한 s1 마다 s2/s3 vocab 값을 체크박스로 큐레이션해 기대 집합(override)을 만드는 UI다. 실사용에서 이 편집 기능은 사실상 쓸모가 없어졌다("편집 기능이 없는 것과 비슷"). 사용자는 **비교 축을 좁혀 보는** 기능을 원한다: 특정 S1/S2/S3 값을 골라 **매트릭스 축에서 아예 제외(숨김)**.

## 목표

- S1·S2·S3 값을 선택해 매트릭스 행/열 축에서 제외한다.
- 제외는 **임시 뷰 상태**다: 컴포넌트 로컬 `Set`, 새로고침하면 초기화. (`hideBareS1` 토글과 동일한 수명. catalog 영구 저장 아님.)
- 기존 "Expected 편집" 체크박스 사이드바를 **"축 제외" 패널로 완전히 교체**한다.
- 모든 뷰 모드(2슬롯, 3슬롯 상세, 요약, 교차, s1×s2)에서 일관 적용.

## 비목표 (YAGNI)

- 제외 설정 영구 저장/공유 안 함.
- expected override **편집 UI**는 제거. (모델의 `catalog.expected`와 `onUpdateExpected` 배관 자체는 missing/excluded 셀 판정에 계속 쓰이지만, 이 컴포넌트에서 편집하지 않는다. `MatrixView.svelte`에서 `onUpdateExpected` prop 및 관련 헬퍼 `toggleExpected` 제거.)
- 셀 클릭/콤보 열기, 정렬, drill 등 기존 동작 변경 없음.

## 데이터 흐름

### 컴포넌트 상태 (임시)

```ts
let excludedS1 = new Set<string>();
let excludedS2 = new Set<string>();
let excludedS3 = new Set<string>();
```

토글 시 새 `Set`으로 **재할당**해 Svelte 반응성을 트리거한다 (`excludedS1 = new Set(excludedS1)` 후 add/delete, 또는 delete/add 후 재할당). in-place 변이는 `$:`를 깨우지 못하므로 금지.

### gridModel — `MatrixViewOptions` 확장

```ts
export interface MatrixViewOptions {
  readonly hideBareS1?: boolean;
  readonly includePartialCombos?: boolean;
  /** 각 슬롯 축에서 제외할 값. 해당 슬롯이 행/열 축으로 등장하는 곳에서 제거된다. */
  readonly excluded?: {
    readonly s1?: ReadonlySet<string>;
    readonly s2?: ReadonlySet<string>;
    readonly s3?: ReadonlySet<string>;
  };
}
```

제외는 **각 슬롯이 축(행/열)으로 등장하는 지점**에서 적용한다:

| compute 함수 | 행 축 | 열 축 | 제외 적용 |
|---|---|---|---|
| `computeTwoSlotMatrix` (2슬롯 전체) | s1 | s2 | 행에서 `excluded.s1`, 열에서 `excluded.s2` |
| `computeS1S2MatrixClient` → 위 재사용 | s1 | s2 | 동일 |
| `computeThreeSlotMatrix` (3슬롯 상세, s1 고정) | s2 | s3 | 행에서 `excluded.s2`, 열에서 `excluded.s3` |
| `computeSummaryMatrixClient` | s1 | s2 | 행 `excluded.s1`, 열 `excluded.s2`, **셀 expectedS3에서 `excluded.s3` 제거** |
| `computeCrossMatrixClient` | (s2,s3) 조합 | s1 | 열 `excluded.s1`, 행은 `s2∈excluded.s2` **또는** `s3∈excluded.s3`면 제거 |

구현 노트:
- `filterAxisS1`/`filterAxisS2`는 이미 축 목록을 거르는 중앙 지점. `excluded.s1`/`excluded.s2` 제거를 여기에 얹으면 요약·교차·2슬롯이 자동 커버된다 (단 `filterAxisS2`는 hideBareS1 여부와 무관하게 excluded는 항상 적용해야 하므로, 옵션 게이트를 excluded와 분리한다).
- `computeThreeSlotMatrix`의 `rows`/`cols`는 `expectedListForClient` 결과를 excluded로 한 번 더 `filter`.
- **요약 셀 S3 처리:** `computeSummaryMatrixClient`에서 `expectedListForClient(catalog, row, 's3')` 결과를 `excluded.s3`로 필터한 뒤 `summarizeSummaryCell`에 넘긴다. 그러면 `expectedCount`(m)와 missingValues가 제외된 s3를 빼고 집계된다 → 상세/교차 뷰와 일관.
- 2슬롯 pin(단일 s1 행) 및 상세 뷰의 고정 selectedS1은 s1 제외 대상이 아니다(드롭다운이 축을 결정). s1 제외는 "s1 전체" 축에서만 의미가 있다.
- 제외로 축이 비면 기존 빈 상태 메시지(`matrix-empty`)가 그대로 노출된다.

### MatrixView 반응식

기존 `computeSummaryMatrixClient`/`computeCrossMatrixClient`/`computeS1S2MatrixClient`/`computeMissingMatrixClient` 호출의 옵션 객체에 `excluded: { s1: excludedS1, s2: excludedS2, s3: excludedS3 }`를 추가한다. 반응식이 `excludedS1/2/3`를 참조하므로 토글 시 재계산된다.

## UI — "축 제외" 패널 (사이드바 교체)

- `<aside class="expected-editor">` → `<aside class="axis-exclude">` (제목 "축 제외").
- 스키마에 존재하는 슬롯만 렌더: 2슬롯 → S1·S2, 3슬롯 → S1·S2·S3. 슬롯 라벨은 `catalog.schema.slots[i].label`.
- 슬롯별 `<fieldset>`:
  - `<legend>` 슬롯 라벨 + 우측에 "모두 포함" 버튼(해당 슬롯 제외 집합 비우기). 제외 개수 > 0일 때만 활성/노출.
  - `catalog.vocab[slotId]` 각 값을 체크박스 항목으로. **체크(활성) = 제외(숨김).** 라벨 텍스트는 제외 시 흐리게+취소선.
  - 토글 핸들러 `toggleExcluded(slotId, value)`가 해당 Set을 재할당 갱신.
- 제거: `editingS1` select, `editableSlots`, expected 체크박스 fieldset, `toggleExpected`, `expectedListForClient`/`chainedValuesForClient`의 편집용 사용 중 편집기 전용 부분. (`chainedValuesForClient`는 matrix pin s2 드롭다운에서 계속 사용하므로 유지.)
- `onUpdateExpected` prop 제거. 유일한 호출측은 `AssetManagerApp.svelte`(정의 line 191, 전달 line 293)뿐이므로, `<MatrixView>`의 `{onUpdateExpected}` 바인딩과 `AssetManagerApp`의 `onUpdateExpected` const를 함께 제거한다. (백엔드 `asset-manager/updateExpected` 메시지 경로 자체는 유지 — bootstrap 등 다른 경로가 expected를 세팅할 수 있음. 여기서 UI 편집 진입점만 없앤다.)

### 상호작용 세부

- 라벨 표기: "체크 = 제외"가 직관적이지 않을 수 있으므로 체크박스 문구는 슬롯 legend 아래 안내 "체크한 값을 축에서 숨깁니다" 한 줄 추가.
- 접근성: fieldset/legend, checkbox `id`/label 연결 유지.

## 테스트

`packages/webview/tests/lib/asset-manager/gridModel.test.ts`에 추가:
- 2슬롯: `excluded.s1` → 해당 행 없음; `excluded.s2` → 해당 열 없음.
- 3슬롯 상세(s1 고정): `excluded.s2` → 행 제거; `excluded.s3` → 열 제거.
- 요약: `excluded.s1`/`s2` 축 제거; `excluded.s3` → 대상 셀 `expectedCount` 감소, missingValues에서 빠짐.
- 교차: `excluded.s1` → 열 제거; `excluded.s2` 또는 `excluded.s3` → 해당 조합 행 제거.
- 옵션 미지정/빈 Set → 기존 결과와 동일(회귀 없음).

컴포넌트 스모크(가능 범위): 체크 토글 시 축에서 값이 사라지고 "모두 포함"으로 복원.

## 리스크 / 주의

- Svelte 반응성: Set in-place 변이 함정. 재할당 규칙을 지킬 것.
- `filterAxisS2`는 현재 `hideBareS1` 꺼지면 조기 반환한다. excluded는 hideBareS1과 독립적으로 적용되어야 하므로 조기 반환 경로에서도 excluded 필터가 빠지지 않게 리팩터.
- `onUpdateExpected` 제거가 호출측(`MainEditor.svelte` 등) 타입/전달과 충돌하지 않는지 확인.
