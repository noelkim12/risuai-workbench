# RisuAI Workbench ↔ RisuAI HMR 동기화 — Design

**Goal:** 워크벤치에서 편집 중인 character/module 아티팩트를 extension host의 로컬 HTTP 서버로 방송(broadcast)하고, 스톡 RisuAI에 설치된 v3 플러그인이 이를 수신해 DB의 매핑된 대상에 실시간 반영(HMR)한다. 로컬 파일이 source of truth, RisuAI DB가 mirror다. 기술적 타당성 근거는 `docs/HMR_IMPLEMENTATION_IDEA.md` 참조.

## Scope 결정 요약

| 결정 | 선택 |
| --- | --- |
| 수신부 타깃 | **스톡 RisuAI 배포용 v3 플러그인.** 포크 전용 호스트 API에 의존하지 않음 |
| 지원 플랫폼 | 데스크톱(Tauri)·node 셀프호스트. **web은 미지원** — `nativeFetch`의 `local_network` 라우트가 web에서 차단됨(`globalApi.svelte.ts:687-691`). 연결 시 `getRuntimeInfo().platform` 검사 후 web이면 "데스크톱 앱 필요" 안내 |
| 동기화 방향 | **단방향** (워크벤치 → RisuAI). 양방향은 비스코프 |
| 동기화 범위 | 정의 텍스트 + **에셋 전부** (v1부터). 에셋은 콘텐츠 해시 기반 증분 전송 |
| 아티팩트 종류 | character, module. plugin 아티팩트는 비스코프 (본체 developMode 핫 리로드 영역) |
| 신규 생성 | **비스코프.** RisuAI에 대상이 없으면 기존 pack → import 경로로 부트스트랩. 블랭크 character 기본값(40+ 필드)은 risu 내부 지식이라 복제 시 drift 위험 |
| 연결 방식 | **연결 문자열 붙여넣기** — `risu-hmr://127.0.0.1:PORT#k=TOKEN` 한 줄에 주소+인증 포함. 워크벤치에 [복사] 버튼, 플러그인에 붙여넣기 1회 |
| 전송 | **HTTP 롱폴링** (`nativeFetch`, `method:'GET'` 명시, `networkRoute:'local_network'`). 정의 JSON은 매번 전체 전송(루프백에서 diff는 복잡도만 삼) |
| 동시 방송 | **1개.** 다른 아티팩트에서 방송 시작 시 전환 confirm |
| 포트 | 41520–41529 첫 빈 포트, 전부 점유 시 OS 임의 포트 폴백 (연결 문자열이 포트를 품으므로 UX 동일) |
| 인증 | 기동 시 세션 토큰 발급, 전 엔드포인트 쿼리 파라미터 `?k=` 필수, 불일치 401. `authorization` 계열 헤더는 `nativeFetch`가 경고를 내므로 회피 |
| Merge 정책 | **페이로드에 존재하는 키만 덮어씀.** `chats`/`chatPage`/`chaId`는 절대 보존, `name`은 덮어씀 |
| DB 쓰기 비용 | HMR push는 경량 경로(`setDatabaseLite`/`setCharacterToIndex`)로 즉시 반영, 마지막 push 후 idle 시 `setDatabase` 1회로 확정 저장 |
| 재연결 | pluginStorage의 매핑(문자열+stableId+chaId)이 완전 동일하면 자동 재연결. **방송 대상 stableId가 바뀌면 자동 추종 없이 안전 정지** |
| 상태 표시 | `setChatPanel` 상주 뱃지 (비문서화 API — 없으면 버튼 라벨 카운트로 폴백) |

## 아키텍처

컴포넌트 3개:

```
┌─ VS Code ────────────────────────────┐      ┌─ RisuAI (데스크톱) ─────────────┐
│ webview (Svelte)                     │      │ v3 플러그인 (sandboxed iframe)  │
│  · [방송] 버튼 + 상태 스트립           │      │  · hamburger 진입 버튼          │
│    ↕ typed message bridge            │      │  · fullscreen 위저드 UI         │
│ extension host                       │      │  · 롱폴 루프 + merge 적용       │
│  · HMR 서버 (node:http 싱글턴)        │◄─────┤  · nativeFetch (host측 실행)    │
│  · watcher(debounce) → core 빌드     │ 롱폴  │  · setChatPanel 상태 뱃지       │
│  · risu-native JSON + 에셋 매니페스트  │      │                               │
└──────────────────────────────────────┘      └───────────────────────────────┘
```

데이터 흐름:

```
파일 저장 → watcher(debounce) → core 빌드 (risu-native JSON + 매니페스트, version++)
  → 롱폴 대기자에 응답 { version, definitionChanged, changedAssets }
  → 플러그인: 누락 에셋만 수신 → merge 적용 (chats/chaId 보존) → 뱃지 갱신
```

- 연속 저장은 롱폴 구조("since=N 이후 최신")가 자연 병합 — 중간 버전은 건너뜀, backlog 없음.
- 빌드 실패 시 서버는 **마지막 정상 버전 유지** — 깨진 중간 상태를 플러그인에 밀지 않음.

## Components

### 1. HMR 서버 (`packages/vscode`, extension host)

- `node:http` 싱글턴, `127.0.0.1`에만 바인드. 기동 시 세션 토큰 발급.
- 방송 대상 = artifact `stableId` 1개. webview [방송] 클릭 → 서버 기동(떠 있으면 재사용) + 대상 지정.
- 파일 감시는 기존 `createFileSystemWatcher` + `createDebouncedTrigger` 패턴 재활용 (`ArtifactBrowserViewProvider.ts:155-190` 참조).
- 수신자 마지막 폴 시각을 추적해 webview에 전달 (예: 35초 내 폴 있음 → "연결됨").
- VS Code 종료/서버 중지 시 별도 통지 없음 — 플러그인이 폴 실패로 감지.

### 2. 빌드 파이프라인 (`packages/core`)

- 아티팩트 루트 → **RisuAI 네이티브 JSON** (character 또는 `RisuModule` 형태). card v3 → risu `character` 변환은 **서버 측 책임** — 플러그인은 재배포가 어려우므로 얇게 유지하고, 형식 지식의 drift는 워크벤치 쪽에 격리.
- 모듈은 `encodeModuleRisum(moduleObj)`(`packages/core/src/node/rpack.ts:10`) 직전의 JSON을 그대로 사용.
- 페이로드 내 에셋 참조는 `hmr-asset://<sha256>` 플레이스홀더로 표기.
- 에셋 매니페스트: `[{ hash, ext, role, size }]`. 해시는 **SHA-256 hex** — RisuAI의 `hasher`(`parser.svelte.ts:955`)와 동일 알고리즘이어야 probe 채택이 성립.
- 해시 캐시: `경로+mtime+size` 키로 바뀐 파일만 재해싱 (큰 프로젝트의 저장→반영 지연 방지).
- **에셋 바이트는 무변형으로 전달**해야 함 — pack 파이프라인이 재인코딩하면 해시가 어긋나 probe가 miss (정확성은 유지되나 증분 효율 상실).

### 3. webview UI (`packages/webview`)

- `ArtifactDetailView.svelte`의 detail-actions에 [방송] 버튼 (Analyze/Pack 옆).
- 방송 중 sticky header 아래 상주 상태 스트립:

```
┌────────────────────────────────────────────────────────┐
│ ● 방송 중: Aria (character) · 갱신 12회                  │
│ 수신자: RisuAI 연결됨 (2초 전 폴링)    [문자열 복사] [중지] │
└────────────────────────────────────────────────────────┘
```

- 다른 아티팩트의 detail에서 [방송] 클릭 → "현재 'Aria' 방송 중. 'Bob'으로 전환할까요?" confirm 후 전환.
- 방송 중이 아닌 아티팩트 화면엔 "다른 아티팩트 방송 중" 힌트 1줄.
- 빌드 실패 시 스트립에 오류 표시.
- 메시지 계약은 기존 typed guard + factory 컨벤션을 따라 추가.

### 4. RisuAI 수신 플러그인 (신규 — 저장 위치·빌드 체계는 구현 계획에서 결정, 워크스페이스의 `create-risu-plugin` 스캐폴드 활용 검토)

- **진입**: `registerButton(location:'hamburger')` 1개 → `showContainer('fullscreen')` 위저드. 채팅 화면을 침범하는 `action` 플로팅 버튼은 쓰지 않음.
- **상주 뱃지**: 수신 활성 중에만 `setChatPanel`. DOMPurify가 이벤트 핸들러를 제거하므로 **표시 전용** — 조작은 전부 위저드에서.

```
 ⚡ HMR: Aria · 12회 갱신 · 3초 전     ← 정상 수신
 ⏳ HMR: Aria · 재연결 중…             ← 서버 응답 없음 (백오프)
 ⚠ HMR: 방송 대상이 바뀜 — 확인 필요    ← 안전 정지
```

- **위저드 4화면**:

```
[화면 1 — 연결]                        [화면 2 — 대상 선택]
┌────────────────────────────┐        ┌──────────────────────────────┐
│ 연결 문자열 붙여넣기:         │        │ 워크벤치: "Aria" (character)  │
│ [ risu-hmr://127.0.0.1:… ] │  --->  │ 🔍 필터________  (로컬 필터)   │
│         [연결]              │        │ [🖼] Aria   v1.2 · creator ◉ │
│ ─────────────────────────  │        │ [🖼] Bob    v0.9           ○ │
│ 최근: Aria (어제 22:10)      │        │  … DB 전체 (그룹챗 제외) …     │
│         [재연결]            │        │ ⓘ DB 권한 프롬프트 안내        │
│ (web 플랫폼이면 즉시 안내)    │        │                  [다음]      │
└────────────────────────────┘        └──────────────────────────────┘

[화면 3 — 확인]                        [화면 4 — 활성 대시보드]
┌────────────────────────────┐        ┌──────────────────────────────┐
│ 워크벤치:  "Aria" (character)│        │ ● 수신 중  Aria ← "Aria"     │
│ RisuAI:   "Aria"           │  --->  │ 버전 v41 · 갱신 12회          │
│ ⚠ 이름 불일치 시 강조         │        │ 초기 동기화:                  │
│ ⓘ RisuAI에서 한 정의 수정은   │        │  기존 에셋 확인 120/120 ✓     │
│   다음 저장 때 덮어써집니다.   │        │  누락 에셋 수신 2/2 ✓        │
│   채팅 기록은 안전합니다.      │        │ [일시정지] [연결 해제] [닫기]  │
│      [수신 시작]  [뒤로]      │        └──────────────────────────────┘
└────────────────────────────┘
```

- **화면 2 — 대상 선택**: `getDatabase(['characters'])`(또는 `['modules']`)로 **DB 전체 목록**을 받아 표시. 별도 탐색 로직 없음 — 🔍는 받아온 목록의 로컬 텍스트 필터. 방송 kind에 맞는 종류만 표시(캐릭터↔모듈 오매핑 차단), 그룹챗(`type` 판별)은 제외.
  - **썸네일**: `character.image`를 `readImage` → `Uint8Array` → `URL.createObjectURL(new Blob([bytes]))` → `<img>`. iframe CSP가 `img-src * data: blob:`(`factory.ts:296`)이라 허용됨. 원격 URL(계정 저장소)이면 src에 직접. 화면에 보이는 항목만 lazy 로딩(IntersectionObserver), 실패 시 이니셜 아바타 폴백. 모듈은 `icon` 있으면 표시, 없으면 글리프.
  - **빈 상태**: "처음이라면: ① 워크벤치에서 [Pack] ② RisuAI로 import ③ [목록 새로고침]" 안내 (신규 생성 대체 경로).
- **화면 4**: [닫기] → `hideContainer()`, 롱폴 루프는 백그라운드 지속, 뱃지만 남음. 재진입 시 바로 화면 4. [일시정지]는 폴링 중단, 재개 시 최신 버전 즉시 반영.
- **구조**: `risuai.*` 호출을 얇은 어댑터로 격리, 나머지(merge·probe 판정·백오프 상태 머신·문자열 파서)는 순수 함수 — 유닛 테스트 대상.

## 프로토콜

전 엔드포인트 토큰 필수 (`?k=<token>`, 불일치 401). CORS 허용 헤더는 항상 포함(무해, 미래 대비).

| 엔드포인트 | 역할 |
| --- | --- |
| `GET /health` | 핸드셰이크: `{ app: 'risu-workbench-hmr', protocolVersion, project: { name, kind, stableId }, version }` |
| `GET /watch?since=N` | 롱폴링. 변경 시 즉시 `{ version, definitionChanged, changedAssets: [hash…] }`, 무변경 시 25초 후 no-change 응답 → 즉시 재요청 |
| `GET /payload` | 현재 버전의 risu-native JSON + 에셋 매니페스트 (`{ kind, data, assets: [{hash, ext, role, size}] }`) |
| `GET /asset/<hash>` | 콘텐츠 해시로 에셋 바이너리 |

- `protocolVersion` 불일치는 연결 단계에서 "워크벤치/플러그인 업데이트 필요"로 명시.
- 변경 요약으로 상태 UI가 "정의 +에셋 2개 갱신" 표시 가능, 바뀐 에셋만 수신.

## 에셋 동기화 — probe 기반 채택

근거 (모두 risuai-pork에서 검증):
- `hasher` = SHA-256 hex (`parser.svelte.ts:955`)
- `saveAsset`은 콘텐츠 주소 방식 — 경로가 `assets/<sha256>.<ext>` (`globalApi.svelte.ts:232`). 같은 내용은 몇 번 저장해도 같은 경로 덮어쓰기 → **저장소 중복 원천 불가**
- charx import도 전부 `saveAsset` 경유 (`characterCards.ts:269-815`) → pack→import된 에셋은 이미 해시 경로에 존재

플러그인의 에셋 확보 절차 (매니페스트 항목별):

```
1. pluginStorage 캐시(hash→path)에 있음 → 채택 (0 비용)
2. 없으면 readImage('<hash>.<ext>') probe (로컬 읽기)
   → 성공: 기존 에셋 채택, 캐시 기록
   → 실패: /asset/<hash> 다운로드 + saveAsset (동일 경로 생성), 캐시 기록
3. 페이로드의 hmr-asset://<hash> 플레이스홀더를 확보된 경로로 치환
```

- "언제 연결하든 동일 내용 보존": 캐시가 날아가도 probe가 재발견, 중복 saveAsset도 같은 경로 덮어쓰기.
- probe 실패 판정: Tauri는 없는 파일에서 throw, web/node는 `null` 반환 (`globalApi.svelte.ts:209`) → try/catch + null 체크.
- ext 폴백: risu가 fileName 없이 저장한 에셋은 `.png` 고정인 경우가 있어 `<hash>.<원본ext>` → `<hash>.png` 순으로 probe.
- 초기 동기화 진행률 2단계: "기존 에셋 확인 n/m" (로컬, 빠름) → "누락 에셋 수신 k/j".

## Merge 정책

원칙: **서버 페이로드에 존재하는 키만 덮어쓴다.** 필드 소유권은 서버(core)가 결정 — 정책 변경에 플러그인 재배포 불필요.

**캐릭터:**
- 덮어씀: `name`, `desc`, `personality`, `scenario`, `firstMessage`, 대체 인사말, `globalLore`, `customscript`(regex), `triggerscript`, 에셋 슬롯(아이콘·감정·추가 에셋), `creator`, `characterVersion` 등 카드 유래 정의 필드
- 절대 보존: `chats`, `chatPage`, `chaId`, 페이로드에 없는 risu 전용 사용자 설정 일체
- 대상 식별: pluginStorage에 `chaId` 저장. **매 적용마다** `getDatabase(['characters'])`에서 chaId→index 재해석, `getCharacterFromIndex`로 chaId 일치 재확인 후 `setCharacterToIndex` (순서 변경·삭제에 안전). chaId 소실 시 "대상 삭제됨" 안전 정지 + 재선택 유도.

**모듈:**
- 매핑된 `id` 불변, 나머지(name·description·lorebook·regex·trigger·cjs·assets)는 서버 소유. `enabledModules`(활성화 상태)는 불가침.

**공통:**
- 첫 DB 접근 시 RisuAI가 세션당 1회 `db` 권한 프롬프트 → 위저드에 사전 안내.
- 정확한 저장 시맨틱(경량 반영 vs 확정 저장 경로)은 구현 단계에서 `setCharacterToIndex`/`setDatabaseLite` 내부 동작 확인 후 확정.

## 에러 · 재연결

| 상황 | 동작 |
| --- | --- |
| 폴 실패 (서버 중지·창 닫힘) | 지수 백오프 2s→30s 재시도, 뱃지 ⏳. 복귀 시 자동 재개 |
| 복귀 후 방송 대상(stableId) 변경 | **자동 추종 안 함** — 수신 정지 + 뱃지 ⚠ + 위저드 재확인 (다른 프로젝트가 기존 캐릭터를 덮어쓰는 사고 방지) |
| 대상 chaId 소실 (삭제됨) | 수신 정지 + 위저드에서 재선택 유도 |
| protocolVersion 불일치 | 연결 단계에서 업데이트 안내 |
| RisuAI 재시작 | 매핑 완전 동일 시 자동 재연결 + 뱃지 알림, 하나라도 다르면 정지 |
| 빌드 실패 (워크벤치) | 서버가 마지막 정상 버전 유지, webview 스트립에 오류 표시 |

## 검증된 v3 API 표면 (전부 `risuai-pork/src/ts/plugins/apiV3/v3.svelte.ts`)

| 용도 | API | 위치 |
| --- | --- | --- |
| 서버 통신 | `nativeFetch` (자체 옵션 객체, method 기본 POST → GET 명시) | `:651` |
| 에셋 probe | `readImage` | `:723` |
| 에셋 저장 | `saveAsset(Uint8Array) → 'assets/<sha256>.<ext>'` | `:724` |
| 목록·chaId 재해석 | `getDatabase` | `:726` |
| 캐릭터 쓰기 | `getCharacterFromIndex` / `setCharacterToIndex` | `:829/:838` |
| 모듈 쓰기 | `setDatabaseLite` / `setDatabase` | `:720/:721` |
| 진입 버튼 | `registerButton` | `:995` |
| 위저드 UI | `showContainer('fullscreen')` / `hideContainer` | `:893` |
| 상태 뱃지 | `setChatPanel` (비문서화) | `:1069` |
| confirm | `alertConfirm` (비문서화) | `:1152` |
| 플랫폼 감지 | `getRuntimeInfo` | `:1158` |
| 영속화 | `pluginStorage.*` | `:1192-1198` |
| 정리 | `onUnload` | `:1128` |

## 리스크 & 구현 시 확인 사항

- `setChatPanel`·`alertConfirm`은 구현돼 있으나 `.d.ts` 비문서화 — 업스트림 변경 대비 **존재 검사 후 우아한 생략** (뱃지→버튼 라벨 폴백, confirm→자체 UI).
- fullscreen iframe(z-index 1000)이 RisuAI 권한 프롬프트 모달을 가릴 가능성 — 목록 로드 직전 `hideContainer()` 후 복귀하는 우회 준비.
- 계정 저장소(saveMethod 'account')에선 에셋 참조가 원격 URL일 수 있음 — 썸네일은 src 직접 사용, probe는 miss→다운로드 폴백으로 정확성 유지.
- 롱폴 25초와 `nativeFetch`의 `requestTimeoutMs` 기본값 상호작용 확인 (타임아웃이 더 짧으면 조정).
- pack 파이프라인의 에셋 바이트 무변형 보장 확인 (해시 일치 전제).

## 테스트 전략

- **core (순수 로직, vitest)**: card→risu-native 변환 스냅샷, 매니페스트·해시 캐시(mtime/size 변경 시나리오), merge 필드 목록 회귀.
- **HMR 서버 (통합)**: 실제 포트 기동 — 무토큰 401, `/watch` 변경 시 즉시/무변경 시 타임아웃, 포트 대역 폴백, 빌드 실패 시 정상 버전 유지.
- **플러그인**: 어댑터 격리 + 순수 함수 유닛 테스트. mock 시나리오: 첫 연결 / probe 적중·미스 / stableId 변경 안전 정지 / chaId 소실.
- **E2E 수동 체크리스트**: ① pack→import→연결→probe 전부 적중 ② 저장→1초 내 반영 ③ 서버 강제 종료→백오프→복귀 ④ 방송 전환 confirm. (샌드박스 iframe 자동화는 v1 범위 밖.)
- 플러그인 자체를 워크벤치 plugin 아티팩트로 개발하면 도그푸딩 가능.

## v2 후보 (비스코프 기록)

- 자동 탐색 + 페어링 코드 (C안 — 포트 대역 probe, 연결 문자열 위에 얹기)
- 양방향 동기화 (RisuAI→로컬 pull-back, 채팅 로그 가공 워크플로우)
- 다중 동시 방송 (아티팩트별 채널)
- 뱃지 클릭 상호작용 (getRootDocument 권한 필요 — 현재는 표시 전용)
