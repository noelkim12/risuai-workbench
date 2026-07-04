# Asset Manager 설계 스펙

- 날짜: 2026-07-04
- 상태: 사용자 승인 완료 (브레인스토밍 Q&A 기반)
- 관련 코드: `packages/core/src/cli/assets/workflow.ts`, `packages/vscode/src/views/ArtifactBrowserViewProvider.ts`, `packages/webview/src/lib/components/sidebar/WorkbenchAccordions.svelte`

## 1. 배경 / 문제

RisuAI 캐릭터 봇은 `<img src="Elsie_Dress_angry">` 형태의 이미지 커맨드를 LLM이 출력하고, 정규식(`$1`/`$2`/`$3` 캡처)으로 가공해 asset을 렌더링한다. 이 파이프라인의 고질적 문제:

- **에셋찐빠**: 프롬프트 속 캐릭터/감정 목록, 정규식 화이트리스트, 실제 asset 파일 3자가 서로 어긋나 존재하지 않는 태그가 출력됨.
- **name 관리 부재**: `assets/manifest.json`의 `name`이 pack 시 charx asset key가 되는데(`cli/pack/character/workflow.ts` 참조), 현재 CLI(`risu-core assets`)는 파일명에서 name을 재유도하므로 수동 교정이 재빌드에 유실됨.
- **실데이터 품질 문제**: name에 확장자 잔재(`elsie_dress_angry.webp`), 공백/언더스코어 혼용(`breast caress` vs `breast_caress`) 등이 실제 워크스페이스에 존재.
- **스케일**: 실측 `assets/additional/` 2,450~3,066개 파일. 미리보기·편집 UI는 가상화 없이는 불가.

## 2. 목표 / 비목표

### 목표 (v1)

1. `assets/` 파일의 그리드 미리보기 + 상세 모달(파일정보 + AI 생성 메타데이터).
2. 슬롯($1/$2/$3) 기반 name 큐레이션: vocab 관리, 파일별 슬롯 할당, 파일명 tokenize 제안, lorebook 캐릭터명 정적분석 후보.
3. 그룹별 missing asset 탐색(매트릭스 뷰).
4. 파생 출력 자동 생성 3종: 프롬프트 Image Command List 블록, Negative Lookahead 화이트리스트 정규식, missing 리포트.
5. 재빌드 안전: 큐레이션 데이터는 catalog 파일에 분리 저장, CLI 빌드가 merge.

### 비목표 (v1에서 제외)

- 사이드바 아코디언 내 썸네일/목록 표시 (진입 버튼만).
- 실제 파일 리네임 (파일명은 불변, name만 큐레이션).
- 썸네일 캐시 생성, 파일 watcher 자동 재스캔, 슬롯당 복수 값(alias 전개), 표준 EXIF 전체 덤프, undo 스택.

## 3. 확정 결정사항 (Q&A 로그)

| # | 결정 | 선택 |
|---|---|---|
| 1 | UI 컨테이너 | 사이드바 아코디언 = "Open Asset Manager" 버튼 + 카운트만. 모든 기능은 메인 영역 WebviewPanel |
| 2 | 데이터 모델 | 별도 `assets/asset-catalog.json`이 진실의 원천. manifest는 빌드 산출물, CLI가 catalog merge |
| 3 | 슬롯 스키마 | 설정형 1~3슬롯: 슬롯 수, 슬롯별 라벨, joinTemplate을 아티팩트별 설정. **기본은 2슬롯** — 대부분의 봇이 s1+s2 구성이고, 3슬롯은 조합 공간(n×n×n)이 커서 소수 케이스 |
| 4 | 파생 출력 | 프롬프트 블록 + 화이트리스트 정규식 + missing 리포트 3종 모두 v1 |
| 5 | 중복 의미 | 파일 간 동일 조합 허용(경고 표시). 슬롯당 값은 단일 |
| 6 | 메타데이터 | 파일정보 + AI 생성정보(PNG tEXt/iTXt, webp EXIF — NAI/SD/ComfyUI 포맷) |
| 7 | 아키텍처 | WebviewPanel(viewName=`asset-manager`) + core 도메인 로직 + 원본 직접 렌더 가상 그리드 |

## 4. 데이터 모델

### 4.1 `assets/asset-catalog.json` (진실의 원천)

```jsonc
{
  "version": 1,
  "schema": {
    "slots": [
      { "id": "s1", "label": "character" },
      { "id": "s2", "label": "attire" },
      { "id": "s3", "label": "emotion" }
    ],
    "joinTemplate": "{s1}_{s2}_{s3}"
  },
  "vocab": {
    "s1": ["Elsie", "Lily"],
    "s2": ["Robe", "Dress", "Nude"],
    "s3": ["angry", "annoyed"]
  },
  "expected": {
    "Elsie": { "s2": ["Robe", "Dress", "Nude"], "s3": null }
  },
  "assignments": {
    "additional/elsie_dress_angry.webp.webp": { "s1": "Elsie", "s2": "Dress", "s3": "angry" }
  },
  "outputs": {
    "tagFormat": { "prefix": "<img src=\"", "suffix": "\">" },
    "fallbackTemplate": "{s1}_default"
  }
}
```

- `schema.slots`: 1~3개. `id`는 `s1`~`s3` 고정 규약, `label`은 사용자 지정(캐릭터/의상/감정/상태 등).
- `schema.joinTemplate`: name 조립 템플릿. 구분자 자유(`_`, 공백 등). name casing은 vocab 값 그대로 보존.
- `vocab`: 슬롯 id별 canonical 값 목록. 대소문자 포함 원형 저장.
- `expected`: missing 계산용. key는 s1 값. 슬롯별 목록이 `null`/생략이면 해당 슬롯 vocab 전체를 기대. **기대 조합 = s2 이후 슬롯 expected 목록들의 데카르트 곱** (2슬롯 스키마면 expected.s2 목록 자체).
- `assignments`: key는 `assets/` 기준 POSIX 상대경로. 슬롯당 단일 값. 서로 다른 파일의 동일 조합은 허용하되 UI/빌드에서 경고. `additional/` 외 서브디렉토리도 할당 가능(주 대상은 additional).
- `outputs` (optional): 파생 출력 생성 옵션 저장. `tagFormat`은 봇별 img 태그 형태(`<img src="NAME">` vs `<img="NAME">`), `fallbackTemplate`은 화이트리스트 정규식의 폴백 name.
- 저장은 전체 파일 재작성(atomic write via `writeText`). UI 편집은 배치로 debounce.

### 4.2 manifest merge 규칙 (CLI `risu-core assets`)

1. 디스크 스캔은 현행 유지(`collectCharacterAssetEntries`).
2. catalog가 존재하고 해당 경로에 할당이 있으며 스키마의 모든 슬롯 값이 채워져 있으면 → `name = joinTemplate 렌더 결과`.
3. 그 외(미할당/부분할당) → 현행대로 파일명 stem.
4. 빌드 요약에 경고 출력: 중복 name 목록, orphan 할당(존재하지 않는 파일 경로) 수, 미할당 수.
5. `--check` 플래그: manifest를 쓰지 않고 missing/중복/orphan 리포트만 stdout 출력.

## 5. core 모듈 · CLI 배치

```
packages/core/src/domain/asset/
  catalog.ts        # 타입, load/save/validate, version migration
  naming.ts         # joinTemplate 렌더/역파싱, vocab 최장일치 tokenizer,
                    # vocab 부재 시 파일명 빈도 클러스터링(부트스트랩 후보)
  missing.ts        # expected 기반 missing 매트릭스/목록 계산
  derived.ts        # 파생 출력 3종 생성기
packages/core/src/domain/analyze/
  lorebook-names.ts # *.risulorebook frontmatter `name:` 추출
                    # → { name, filePath, folderPath } (기존 domain/lorebook 파서 재사용)
```

- **tokenizer**: 단순 구분자 split이 아니라 vocab 최장일치. s1 vocab에서 최장 prefix 매치 → 나머지에서 s2/s3 vocab 매치 → 잔여는 미분류로 보고. 구분자 후보는 joinTemplate에서 유도하되 `_`/공백/`-` 변형 허용(정규화 매칭: 소문자화 + `_`↔공백 동일시). 예: `Ahn_Do-hyun_acting_coy.png` → s1 `Ahn Do-hyun`(vocab 매치), s2 `acting coy`.
- **부트스트랩 클러스터링**: vocab이 빈 상태에서 파일명들을 구분자로 절단해 공통 prefix(캐릭터 후보)와 공통 suffix(감정 후보)를 빈도순 제시.
- **CLI**: `assets` 서브커맨드에 merge 빌드 + `--check` 추가. lorebook 캐릭터명 추출은 기존 `analyze` 워크플로우(`cli/analyze`)에 모드 추가 → CLI와 extension이 같은 core 함수를 사용(공통 분석 도구 요건).

## 6. Extension · 메시지 프로토콜

### 6.1 진입 흐름

1. `CharacterDetailScanner`/`ModuleDetailScanner`의 SECTION_ORDER에 `assets` 섹션 추가 — item 목록 없이 카운트만 담는 요약 섹션.
2. `WorkbenchAccordions`에서 `assets` 섹션 확장 시 카운트 요약 + "Open Asset Manager" 버튼만 렌더.
3. 버튼 → `artifact-browser/openAssetManager { stableId }` (기존 artifact-browser 프로토콜에 메시지 1종 추가) → extension이 `AssetManagerPanel.createOrShow(stableId)`.
4. `AssetManagerPanel`: `card-panel.ts` 패턴의 WebviewPanel. **stableId별 인스턴스 맵**(이미 열려 있으면 reveal). `retainContextWhenHidden: true`, `localResourceRoots`에 workspace 폴더 포함, viewName=`asset-manager`(webview `main.ts`가 meta로 분기해 AssetManagerApp 마운트).

### 6.2 프로토콜 `risu-workbench.asset-manager` v1

기존 envelope(`{protocol, version, type, payload}`) + 양방향 type guard 패턴 준수.

| webview → ext | ext → webview | 비고 |
|---|---|---|
| `asset-manager/ready { stableId }` | `asset-manager/assetsLoaded` | 디스크 스캔 결과 + catalog + `assetsRootWebviewUri` |
| `asset-manager/refreshAssets` | `asset-manager/assetsLoaded` | 수동 재스캔 |
| `asset-manager/updateAssignments { changes: [{path, slots}] }` | `asset-manager/catalogSaved` | 배치 저장, 경고 동봉 |
| `asset-manager/updateVocab` / `updateSchema` / `updateExpected` | `asset-manager/catalogSaved` | schema 변경 시 이름 재유도 결과 포함 |
| `asset-manager/analyzeLorebookNames` | `asset-manager/lorebookNamesResult` | 후보 + 폴더 그룹 |
| `asset-manager/bootstrapFromFilenames` | `asset-manager/tokenizeResult` | 파일별 슬롯 제안 + 신뢰도 |
| `asset-manager/readImageMeta { path }` | `asset-manager/imageMetaResult` | 모달 온디맨드 |
| `asset-manager/generateOutputs { kinds }` | `asset-manager/outputsResult` | 3종 중 선택 생성 |
| `asset-manager/saveOutput { kind, targetPath, content }` | `asset-manager/outputSaved` | workspace 상대경로 검증 |
| `asset-manager/buildManifest` | `asset-manager/manifestBuilt` | merge 빌드 실행 + 요약 |
| — | `asset-manager/error { context, message }` | 공통 오류 채널 |

- `assetsLoaded` payload: 파일별 `{ path, subdir, sizeBytes, mtime, assignment?, generatedName, flags: { unassigned, duplicate, orphan } }` + catalog 전체 + `assetsRootWebviewUri` 1개. 이미지 src는 webview가 `${rootUri}/${encodeURIComponent된 세그먼트}`로 조립(파일별 URI 3,000개 전송 회피, ~500KB 이내).
- 이미지 메타 파싱은 extension host(Node)에서 PNG 청크(tEXt/iTXt: SD `parameters`, NovelAI `Comment`/`Description`, ComfyUI `prompt`/`workflow`)와 webp EXIF/XMP를 외부 의존성 없이 직접 파싱.

## 7. Webview UI (AssetManagerApp)

상단 탭 4개 + 공통 툴바(재스캔 ⟳, Build ▶).

### 7.1 Grid 뷰 (기본)

- 툴바: 서브디렉토리 필터(기본 `additional`), 텍스트 검색(파일명/생성 name/슬롯 값), 상태 필터 칩(미할당/중복/orphan), 정렬(이름/크기/수정일), 타일 크기 슬라이더.
- **가상 스크롤 그리드**: 고정 타일 크기 → 행 단위 windowing(보이는 행 + overscan만 DOM 유지). `<img loading="lazy" decoding="async">`. 타일 = 썸네일 + 생성될 name(미할당이면 파일명) + 슬롯 chip + 경고 배지.
- 선택: 클릭(단일), ctrl/shift(다중), 드래그 범위 선택은 v2.
- **우측 Inspector**(목록형 부여 도구): 선택 파일 수 표시 + 슬롯별 검색 가능한 select box. 다중 선택 시 각 슬롯에 "(유지)" 옵션 → 특정 슬롯만 일괄 변경. "tokenize 제안 적용" 버튼(선택 파일에 대해 제안값 채움, diff 미리보기 후 확정).
- 툴바 일괄 정규화 액션: "확장자 잔재 제거"(name 끝 `.webp`/`.png` 등 제거 제안).
- **더블클릭 → 상세 모달**: 큰 이미지(fit) + 파일정보(해상도/용량/형식/수정일) + AI 생성정보(prompt/negative/seed/model 등 key-value) + 슬롯 편집 인라인 + ←/→ 이전·다음 탐색. 메타데이터는 열 때 `readImageMeta`로 로드.

### 7.2 Matrix 뷰 (missing 탐색)

- 3슬롯: s1 선택 드롭다운 → 행=s2, 열=s3. 2슬롯: 행=s1, 열=s2. 1슬롯: 단순 유/무 목록.
- 셀 상태: ✓ 존재(1개) / ⚠ 중복(n개) / ✗ missing(기대 조합인데 없음) / · 비대상(expected 밖).
- 셀 클릭 → Grid 뷰로 전환 + 해당 조합 필터 적용.
- s1별 expected 집합 편집 패널(슬롯별 체크박스 목록, "vocab 전체" 토글).

### 7.3 Vocab 뷰

- 슬롯별 컬럼: 값 목록 CRUD + 순서 변경(파생 출력의 나열 순서에 반영).
- 스키마 편집: 슬롯 수(1~3)/라벨/joinTemplate + 샘플 name 라이브 프리뷰. 슬롯 수 축소 시 잘리는 할당은 데이터 보존 + 경고. 첫 실행 스키마 설정 스텝(§9)은 이 편집기를 모달로 재사용.
- 후보 패널 2종:
  - **lorebook 분석**: `analyzeLorebookNames` 결과를 폴더별 그룹으로 표시(지역/아이템 등 비캐릭터 폴더를 그룹 단위로 걸러내기 용이). 체크 → 편집(로마자 교정 등) → vocab 채택.
  - **파일명 부트스트랩**: `bootstrapFromFilenames` 빈도 클러스터 후보 → 채택.

### 7.4 Outputs 뷰

- 파생 출력 3종 미리보기 + 복사 + 파일 저장:
  1. **프롬프트 블록**: joinTemplate에서 유도한 Format 라인 + s1 목록 + s1별 expected 내역(캐릭터별 의상 목록 등) + 공용 슬롯 vocab 목록. markdown. 기본 저장 경로 `docs/`.
  2. **화이트리스트 정규식**: 에셋찐빠 가이드 4번 기법. `tagFormat` 기반 IN 패턴 — s1 화이트리스트 + negative lookahead 유효 조합 + `(?=")` 경계 + 특수문자 escape. OUT은 `fallbackTemplate`. `.risuregex`로 `regex/`에 저장하면 pack에 자동 포함.
  3. **missing 리포트**: s1별 누락 조합 목록 markdown(+json 옵션). "생성할 이미지 목록"으로 이미지 생성 도구에 전달 가능한 형태. 기본 저장 경로 `docs/`.
- Build ▶: merge 빌드 실행 → 결과 요약(entry 수, 미할당, 중복, orphan) 표시.

## 8. 성능 전략

- 원본 직접 렌더(`asWebviewUri`): 실측 asset이 36~80KB webp/png라 별도 썸네일 불필요. 그리드 이미지 소스는 레이어 함수로 추상화해 v2 썸네일 캐시 교체 여지 확보.
- 가상 스크롤로 DOM 상주 타일을 수십 개로 제한. 뷰포트 밖 `<img>`는 unmount.
- asset 목록은 Manager 열 때 1회 로드(사이드바 detailLoaded에 미포함). 재스캔은 명시적 ⟳.
- 이미지 메타 파싱은 모달 온디맨드(3,000개 일괄 파싱 금지).
- catalog 저장은 편집 배치 debounce(연타 시 마지막 상태만 저장).

## 9. 엣지 케이스 · 에러 처리

- catalog 부재: Manager 최초 오픈 시 1회성 **스키마 설정 스텝** 표시 — 슬롯 수 선택(기본 2: `character`/`emotion`), 라벨 프리필, joinTemplate(기본 `{s1}_{s2}`), 샘플 name 라이브 프리뷰. 파일명 부트스트랩 클러스터링 결과로 "이 워크스페이스는 3슬롯으로 보임" 힌트 제공 가능. 확정(또는 건너뛰기) 시 2슬롯 기본 스키마로 시작하고, 첫 편집 저장 시 catalog 파일 생성.
- catalog 파손(JSON 오류/스키마 불일치): 오류 배너 + 읽기 전용 그리드로 폴백, 덮어쓰기는 사용자 확인 후.
- orphan 할당: 상태 필터로 노출 + "orphan 일괄 제거" 액션.
- 중복 조합: Grid 배지 + Matrix ⚠ + 빌드 경고. 차단하지 않음(결정 #5).
- 정규식 생성기가 책임지는 함정: 캐릭터명 특수문자 escape(`Char(Adult)`), prefix 공유 감정 경계(`nervous` vs `nervous pouting` → `(?=")`), `_`/공백 구분자 차이.
- 이미지 로드 실패(파일 삭제 직후 등): 타일 placeholder + 재스캔 유도.
- `saveOutput` 경로는 workspace root 밖 탈출 금지(기존 `isSafeTargetFolderPath` 패턴 재사용).

## 10. 테스트 전략

- **core (vitest, `packages/core/tests/`)**
  - catalog load/save/validate/migration, 기본 2슬롯 스키마 생성.
  - tokenizer: `Ahn_Do-hyun_acting_coy`(이름 내 `_`·`-`), `breast caress`(공백↔`_` 정규화), 미분류 잔여 처리.
  - joinTemplate 렌더/역파싱 (`{s1}_{s2}_{s3}`, `{s1} {s2}`).
  - merge 빌드: 할당 name 반영 + 미할당 fallback + 재빌드 큐레이션 보존 + orphan/중복 경고.
  - missing 계산: expected override, null=전체, 2슬롯/3슬롯.
  - derived: 정규식 escape·경계 케이스, 프롬프트 블록 구조, 리포트.
  - lorebook-names: frontmatter 추출 + 폴더 그룹.
  - 픽스처 우선순위: 2슬롯(example2형, 공백 구분)을 1차 검증 경로로, 3슬롯(example1형, `_` 구분)을 후속 검증으로.
- **vscode**: 신규 메시지 guard 단위 테스트(기존 패턴), scanner assets 섹션, AssetManagerPanel 인스턴스 맵.
- **webview**: 가상 그리드/모달은 수동 검증 중심 + 기존 e2e(`extension-client.test.ts`) 스타일의 Manager 오픈 스모크.

## 11. v2 이후 후보

- 썸네일 캐시 생성(원본이 수 MB급인 워크스페이스 대응).
- 파일 watcher 자동 재스캔.
- 슬롯당 복수 값 → alias name 전개(한 이미지를 happy/smile 양쪽에 배정).
- 할당 편집 undo 스택.
- 드래그 범위 선택, Matrix 뷰 s1=행 모드(캐릭터 × 감정 전개).
- editprocess 구 채팅 정리 정규식 등 추가 파생 출력.
