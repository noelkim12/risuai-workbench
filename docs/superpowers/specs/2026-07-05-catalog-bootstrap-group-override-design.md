# Catalog Bootstrap 그룹별 분할 Override 설계 스펙

- 날짜: 2026-07-05
- 상태: 사용자 승인 완료 (브레인스토밍 Q&A 기반)
- 관련 코드: `packages/core/src/node/asset-catalog-bootstrap.ts`, `packages/webview/src/lib/components/asset-manager/CatalogBootstrapModal.svelte`, `packages/vscode/src/asset-manager/AssetManagerPanel.ts`, `packages/vscode/src/asset-manager/assetManagerMessages.ts`

## 1. 배경 / 문제

Catalog Bootstrap은 구분자와 슬롯별 조각 수(`slotTokenCounts`)를 지정해 asset 이름을 슬롯으로 분할한다. 이 규칙은 **모든 이름에 일괄 적용**되므로, 캐릭터마다 이름 구조가 다르면 깨진다.

실측 사례 — `s1=2, s2=1` 설정, 구분자 `_`:

| 이름 | 결과 | 문제 |
|---|---|---|
| `Park_Hye-in_angry` | s1=`Park_Hye-in`, s2=`angry` | 정상 |
| `Rivea_angry` (2조각) | `configuredSplit` 적용 불가 → 휴리스틱 폴백(`positionalSplit`)으로 s1=`Rivea`, s2=`angry` | **규칙 불일치** — 결과는 우연히 맞지만, 이 그룹이 전역 규칙을 따르지 않는다는 신호 |
| `Rivea_acting_coy` (3조각) | s1=`Rivea_acting`, s2=`coy` | **오분할** — 성공으로 위장되어 `Rivea_acting` 등 가짜 s1 그룹 생성 |

즉 실패 모드가 두 가지다: (a) 지정한 조각 수를 적용할 수 없어 규칙과 무관한 휴리스틱으로 폴백 (같은 그룹 안에서 분할 규칙이 갈라짐), (b) 조각 수는 충분하지만 잘못 분할 (겉보기 성공, 감지 어려움). 매트릭스 뷰에 `Rivea_acting`, `Rivea_blushing` 같은 파편 행이 생기는 원인이 (b)다.

## 2. 목표 / 비목표

### 목표

1. 미리보기 시점에 "전역 규칙과 안 맞는 그룹"을 자동 감지해 모달에 경고 표시.
2. 그룹(첫 토큰) 단위로 s1/s2 조각 수를 override 지정 → 미리보기 즉시 반영 → 적용 시 그대로 저장.
3. 감지 로직은 core의 순수 함수로 구현, webview에 중복 구현하지 않음.

### 비목표

- 그룹 키의 다중 토큰 지원(첫 토큰 고정). 첫 토큰이 같은데 조각 규칙이 다른 캐릭터 공존 케이스는 v1에서 제외 (YAGNI).
- 감지 결과의 자동 적용. 감지는 경고와 기본 펼침 UX까지만 — 실제 override 값은 항상 사용자가 지정한다.
- 개별 항목 단위 override (그룹 단위만).
- 구분자 자체의 그룹별 override (조각 수만).

## 3. 확정 결정사항 (Q&A 로그)

| # | 결정 | 선택 |
|---|---|---|
| 1 | 예외 처리 방식 | **그룹별 override UI** (자동 fallback 추론 / 감지+제외 / 경고만 표시 안 대신) |
| 2 | 그룹 키 | 이름의 **첫 토큰** 고정 |
| 3 | 감지 신호 | (a) 조각 부족(null) + (b) s2 어휘 오염 의심 — 둘 중 하나면 그룹 플래그 |
| 4 | 감지 로직 위치 | core 순수 함수, extension이 preview 응답에 동봉 |
| 5 | UI | 의심 그룹은 배지+사유+기본 펼침, 정상 그룹도 목록에 접힌 상태로 노출(수동 override 가능) |

## 4. 데이터 모델

### 4.1 `AssetCatalogBootstrapSplitOptions` 확장 (core)

```ts
export interface AssetCatalogBootstrapGroupOverride {
  readonly firstToken: string; // 그룹 키: 전역 구분자로 분할한 첫 토큰
  readonly slotTokenCounts: Partial<Record<AssetSlotId, number>>;
}

export interface AssetCatalogBootstrapSplitOptions {
  readonly separator?: string;
  readonly slotTokenCounts?: Partial<Record<AssetSlotId, number>>;
  readonly groupOverrides?: readonly AssetCatalogBootstrapGroupOverride[]; // 신규
}
```

- `inferSlotsFromName` → `configuredSplit` 경로에서: 이름을 실제 사용된 구분자(`actualSeparator` 결과)로 분할한 첫 토큰이 `groupOverrides`의 `firstToken`과 일치하면 그 그룹의 `slotTokenCounts`를 전역 값 대신 사용한다. 매칭은 대소문자 구분(파일명 그대로).
- override가 있어도 여전히 조각 수를 적용할 수 없으면 기존과 동일하게 휴리스틱 추론으로 폴백한다 (감지 신호 ⓐ가 계속 그룹을 플래그하므로 사용자에게 노출됨 — §5, §6).
- 직렬화 가능한 순수 데이터이므로 webview↔extension 메시지 payload에 그대로 실린다. `assetManagerMessages.ts`의 `isCatalogBootstrapSplitOptions` 검증에 `groupOverrides` 배열 검증을 추가한다.

### 4.2 감지 결과 모델 (core)

```ts
export type AssetCatalogBootstrapAnomalyReason = 'insufficient-tokens' | 'vocab-overlap';

export interface AssetCatalogBootstrapGroupSummary {
  readonly firstToken: string;
  readonly entryCount: number;
  readonly tokenCountMin: number;
  readonly tokenCountMax: number;
  readonly anomalies: readonly AssetCatalogBootstrapAnomalyReason[]; // 빈 배열 = 정상
}
```

## 5. 감지 로직 (core 순수 함수)

```ts
export function summarizeAssetCatalogBootstrapGroups(
  catalog: AssetCatalog,
  preview: readonly AssetCatalogBootstrapPreviewEntry[],
  split?: AssetCatalogBootstrapSplitOptions,
): readonly AssetCatalogBootstrapGroupSummary[];
```

- 입력은 catalog(슬롯 목록·joinTemplate 접근용) + 미리보기 결과(이미 분할 시도 완료) + 분할 옵션. 파일시스템 접근 없음.
- 그룹핑: 각 항목 이름을 실제 사용된 구분자로 분할 → 첫 토큰으로 그룹.
- **신호 (a) insufficient-tokens**: 그룹 내에 유효 조각 수 규칙(override 우선, 없으면 전역)을 적용할 수 없는 항목이 1개 이상. 판정식: `토큰 수 < (비마지막 슬롯들의 count 합) + 1`. 이런 항목은 `configuredSplit`을 통과하지 못하고 휴리스틱으로 폴백되므로, 그룹의 분할 규칙이 전역 규칙과 다르다는 신호다.
- **신호 (b) vocab-overlap**: 그룹의 s1 값이 2종 이상으로 파편화되어 있고, 그 s1 값들의 마지막 토큰 중 하나 이상이 **다른 그룹들의 s2 값 집합**에 등장. (예: Rivea 그룹의 s1 `Rivea_acting`의 마지막 토큰 `acting`이 Park 계열의 s2 어휘에 존재 → 오분할 의심)
- override가 이미 적용된 그룹은 신호 (b) 판정에서 제외하지 않는다 — override 후에도 여전히 어긋나면 계속 경고되는 것이 올바른 동작. 단, 사용자가 값을 만졌는지는 UI가 알고 있으므로 표시만 "override 적용됨 + 여전히 의심"으로 구분한다.
- 정렬: 의심 그룹 우선, 그 안에서 entryCount 내림차순.

휴리스틱 (b)는 오탐 가능성이 있으므로 **경고 이상의 자동 동작은 하지 않는다**.

## 6. 메시지 / UI 플로우

### 6.1 메시지 확장

- `asset-manager/previewCatalogBootstrap` (webview→ext): payload `split`에 `groupOverrides` 포함 가능.
- `asset-manager/catalogBootstrapPreview` (ext→webview): 기존 `rows`에 더해 `groups: AssetCatalogBootstrapGroupSummary[]` 추가. `AssetManagerService.previewCatalogBootstrap`이 preview 계산 후 `summarizeAssetCatalogBootstrapGroups`를 호출해 동봉.
- `asset-manager/bootstrapCatalog` (webview→ext): payload `split`에 `groupOverrides` 포함 — 적용 경로(`bootstrapAssetCatalogFromEntries`)는 preview와 같은 `inferSlotsFromName`을 쓰므로 자동으로 일관.

### 6.2 `CatalogBootstrapModal.svelte`

컨트롤 영역과 미리보기 테이블 사이에 **"그룹별 규칙" 섹션** 추가:

- 그룹 목록 행: `{firstToken} — {entryCount}개 · 조각 {min}~{max}` + 의심 그룹은 `⚠` 배지와 사유 텍스트(`s1을 채울 수 없는 항목 있음` / `다른 캐릭터의 s2 어휘와 겹침`).
- 의심 그룹은 기본 펼침 + s1/s2 조각 수 number input 노출(초기값 = 전역 값). 값 변경 시 `groupOverrides`에 반영하고 미리보기 갱신.
- 정상 그룹은 접힌 상태, 클릭으로 펼쳐 수동 override 가능 (감지를 빠져나간 케이스 대비).
- override 상태 로컬 관리: `Map<string, {s1: number; s2: number}>` — 전역 값과 같아지면 override 목록에서 제거.
- 전역 구분자/조각 수 변경 시 기존 override는 유지(그룹 키가 첫 토큰이므로 구분자가 바뀌면 그룹핑이 달라질 수 있음 — 이 경우 새 preview의 그룹 목록에 없는 override는 UI에서 제거).
- 미리보기 테이블: override가 적용된 그룹의 행은 s1 셀에 `⚙` 마크, `slots === null` 행은 경고색 하이라이트.

## 7. 에러 처리

- `groupOverrides`에 조각 수 ≤ 0 또는 비정상 값: 메시지 검증(`isCatalogBootstrapSplitOptions`)에서 거부. UI input은 `min=1 max=8`로 제한.
- override 적용 후에도 조각 수 적용 불가인 항목: 기존 동작대로 휴리스틱 폴백, 그룹은 계속 신호 ⓐ로 플래그. `slots === null` 항목(예: 3슬롯 스키마에 2토큰 이름)은 미리보기에서 경고색으로 노출.
- 그룹 수가 매우 많을 때(수백): 그룹 섹션은 `max-height` + 스크롤, 의심 그룹이 항상 상단.

## 8. 테스트 전략

core 단위 테스트 (`packages/core/tests/`):

1. `groupOverrides` 적용: Rivea 계열 이름에 `s1=1` override → 올바른 분할, 다른 그룹은 전역 규칙 유지.
2. override 미매칭 그룹은 전역 규칙 사용.
3. `summarizeAssetCatalogBootstrapGroups`: (a) 신호 — 전역 `s1=2`일 때 2조각 Rivea 이름 포함 시 `insufficient-tokens`; (b) 신호 — 3조각 Rivea만 있어도 s2 어휘 토큰 겹침으로 `vocab-overlap`; 정상 그룹은 `anomalies` 빈 배열; override 적용 후 규칙이 맞으면 신호 해제.
4. 정렬/요약 값(min/max/entryCount) 검증.

메시지 검증 테스트 (`packages/vscode/tests/`): `groupOverrides` 포함 payload 통과, 비정상 값 거부.

webview 테스트: 기존 모달 테스트 패턴에 맞춰 override 입력 → `onPreview` 호출 payload에 `groupOverrides` 포함 검증.
