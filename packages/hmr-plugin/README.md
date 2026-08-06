# Risu Workbench HMR Provider

`risuai-hmr-provider`는 VS Code의 Risu Workbench가 canonical 캐릭터/모듈 프로젝트를 다시 빌드할 때마다 그 정의를 실행 중인 RisuAI 데이터베이스에 반영하는 RisuAI API v3 플러그인이다.

이 패키지에서 말하는 HMR은 Vite의 브라우저 모듈 HMR이나 WebSocket 교체가 아니다. Vite는 플러그인을 단일 JavaScript 파일로 묶는 빌드 도구이고, 실제 동기화는 **VS Code 확장이 `127.0.0.1`에 연 HTTP 서버를 플러그인이 long polling하는 구조**다.

## 주요 기능

- Workbench가 발급한 `risu-hmr://127.0.0.1:PORT#k=TOKEN` 연결 문자열로 로컬 서버에 연결한다.
- RisuAI DB에서 수신 대상 캐릭터 또는 모듈을 선택하고, 최초 적용 전에 필드/항목/라인 diff를 보여 준다.
- 캐릭터 갱신 시 `chats`, `chatPage`, `chaId`를 보존해 채팅 기록과 대상 식별자를 덮어쓰지 않는다.
- 모듈 갱신 시 기존 모듈의 `id`를 유지한 채 정의를 교체한다.
- 콘텐츠 해시 기반으로 에셋을 재사용하거나 필요한 에셋만 내려받아 `hmr-asset://<hash>` 참조를 RisuAI 저장 경로로 치환한다.
- 연결 정보, 대상 매핑, 적용 버전, 에셋 캐시를 `risuai.pluginStorage`에 저장해 자동 재연결한다.
- 수신 일시정지/재개, 지수 백오프 재연결, Broadcast 대상 변경 및 대상 삭제 시 안전 정지를 지원한다.
- 선택적으로 RisuAI 호스트 화면에 상태 배지와 변경 토스트를 표시한다.

## 전체 구조

```text
packages/webview                    packages/vscode                    packages/core
Artifact Detail / HMR strip  --->  ArtifactBrowserViewProvider  --->  canonical HMR payload builder
  Broadcast / Stop / Copy           file watcher (500 ms debounce)     definition + asset hash/placeholder
                                            |
                                            v
                                  HmrServerService (127.0.0.1)
                                  /health /watch /payload /asset/:hash
                                            |
                                  token-authenticated HTTP long poll
                                            |
                                            v
packages/hmr-plugin
HmrController -> asset materialization -> character/module merge -> RisuAI DB
       |
       +-> Svelte wizard / status badge / update toast / persisted mapping
```

## 동작 흐름

### 1. Workbench에서 Broadcast 시작

1. `packages/webview`의 Artifact Detail 화면에서 캐릭터 또는 모듈의 **Broadcast**를 누른다.
2. `packages/vscode`의 `ArtifactBrowserViewProvider`가 대상 artifact를 `HmrServerService`에 전달하고 루트 파일 감시를 시작한다.
3. `packages/core`의 HMR builder가 canonical 디렉터리를 RisuAI 정의로 변환한다. 에셋 참조는 `hmr-asset://<sha256>` 플레이스홀더로 바뀐다.
4. 파일 변경 시 500ms debounce 후 payload를 재빌드하고 version을 증가시킨다.
5. Workbench 상태 스트립에서 연결 문자열을 복사한다.

플러그인 artifact 자체는 Broadcast 대상이 아니다. HMR 서버는 character/module artifact만 제공한다.

### 2. RisuAI 플러그인에서 연결

1. 빌드된 `dist/risuai-hmr-provider.js`를 RisuAI API v3 플러그인으로 설치한다.
2. 채팅 또는 햄버거 메뉴의 **Risu Workbench HMR** 버튼을 열고 연결 문자열을 붙여넣는다.
3. 플러그인이 `/health`에서 프로토콜 버전, artifact 종류, `stableId`, 현재 version을 검증한다.
4. RisuAI DB의 캐릭터/모듈 목록에서 수신 대상을 고른다.
5. `/payload`와 현재 RisuAI 정의를 비교한 뒤, 변경이 있으면 사용자 동의를 받아 최초 동기화를 수행한다.
6. 이후 `/watch?since=<version>`을 long polling하고 새 version이 도착하면 최신 `/payload`를 적용한다.

웹 빌드의 RisuAI에서 loopback 연결이 실패하면 RisuAI의 **Plain Fetch** 설정과 브라우저의 로컬 네트워크 접근 권한을 확인해야 한다. Tauri/Node 플랫폼에서는 `networkRoute: "local_network"`를 사용한다.

### 3. 에셋 적용

1. 저장된 hash→path 캐시를 먼저 확인한다.
2. 캐시에 없으면 `assets/<hash>.<ext>`와 PNG fallback이 이미 존재하는지 `risuai.readImage`로 확인한다.
3. 누락된 hash만 `/asset/<hash>`에서 받아 `risuai.saveAsset`으로 저장한다.
4. payload 전체를 순회하며 `hmr-asset://<hash>`를 실제 RisuAI asset path로 바꾼다.
5. 완성된 정의를 캐릭터 또는 모듈 DB에 반영한다.

### 4. On-demand Chat Debug

활성 HMR owner의 **Chat Debug** 버튼은 한 번에 하나의 요청만 시작한다. 버튼은
receiver가 fresh할 때만 사용할 수 있으며, 현재 artifact가 owner가 아니거나 이미
요청 중이면 비활성화된다. webview가 `requestId`와 `stableId`를 만든 뒤 host로
보내면, host는 authenticated `/watch` long poll을 통해
`{ requestId, kind: 'currentChatSnapshot' }` 명령을 전달한다.

plugin은 명령을 받은 순간 RisuAI에서 현재 열려 있는 character와 chat을 읽는다.
HMR로 선택한 character/module과 chat을 연결하거나 추론하지 않는다. 결과는
`POST /debug/chat-snapshot`으로 같은 `requestId`와 `stableId`를 포함해 돌려보낸다.
provider는 상관된 성공 결과만 pretty-printed JSON의 untitled preview editor를
열고, 실패 결과는 content-free message로 표시한다. 이 경로는 definition apply,
DB write-back, asset 처리, version 증가에 들어가지 않는다.

snapshot에는 optional character/chat `id`와 `name`, `$`로 시작하는 키만 남긴
filtered `scriptstate`, 그리고 native message의 최신 0개에서 2개가 들어간다.
messages는 chronological order로 유지하며 전체 배열의 absolute `index`,
string `role`과 `data`, optional numeric `time`을 포함한다. full history,
`generationInfo`, `saying`, asset data와 임의 metadata는 포함하지 않는다.

성공 결과가 UTF-8 기준 512 KiB를 넘으면 partial JSON을 보내지 않고
`SNAPSHOT_TOO_LARGE` 오류를 반환한다. 요청은 30초 뒤 timeout되며, target 전환,
stop, extension disposal 또는 server shutdown 때 server-owned 요청이 취소된다.
카드 선택 변경은 webview의 stale pending/error UI만 로컬에서 지운다. 이후 도착한
terminal status는 현재 pending record의 `requestId`와 `stableId`에 맞을 때만
반영되고, 그렇지 않으면 무시된다.
snapshot content는 로그, plugin storage, workspace 파일 또는 streaming history에
남지 않는다. 이 문서와 plugin은 token, chat content, private variable value를
기록하지 않는다.

## HTTP 프로토콜

서버와 플러그인은 현재 protocol version `3`을 사용한다. 이 번호는 stale
pre-release plugin bundle을 식별하기 위한 것이다. 모든 요청은 query parameter
`k=<token>`을 포함한다.

| Endpoint | 역할 |
| --- | --- |
| `GET /health` | 서버 식별자, protocol version, artifact 이름/종류/`stableId`, 현재 version 확인 |
| `GET /watch?since=N` | 새 version이 생길 때까지 최대 25초 대기하고 변경 여부와 변경 에셋 hash를 반환 |
| `GET /payload` | 최신 character/module 정의와 에셋 manifest 반환 |
| `GET /asset/<hash>` | hash에 해당하는 에셋 bytes 반환 |
| `GET /watch?since=N` | definition 변경 없이 한 번 전달되는 `currentChatSnapshot` debug command 포함 가능 |
| `POST /debug/chat-snapshot` | correlated snapshot success 또는 safe error result 수신 |

프로토콜 계약은 `packages/core/src/domain/hmr/protocol.ts`와 `src/hmr/protocol.ts`에 의도적으로 중복되어 있다. 플러그인은 샌드박스에서 실행되는 독립 단일 번들이므로 `risu-workbench-core`를 런타임 의존성으로 가져오지 않는다. 계약을 바꿀 때는 양쪽 정의를 함께 수정하고 `HMR_PROTOCOL_VERSION`을 올려야 한다.

## 병합 및 안전 규칙

### 캐릭터

- Workbench 정의가 제공하는 필드는 갱신한다.
- RisuAI에만 있는 일반 필드는 유지한다.
- `chats`, `chatPage`, `chaId`는 Workbench payload에 값이 있어도 기존 RisuAI 값을 보존한다.
- 매번 `chaId`로 대상을 다시 찾으며, 대상이 삭제되면 수신을 `stoppedError`로 안전 정지한다.

### 모듈

- 선택한 module entry를 최신 Workbench 정의로 교체한다.
- 기존 RisuAI module `id`는 보존한다.
- 대상 `id`가 사라지면 수신을 안전 정지한다.

### 연결

- `/health`와 `/watch`의 `stableId`를 저장된 매핑과 비교한다.
- Workbench가 다른 artifact로 Broadcast을 전환하면 기존 대상에 잘못 적용하지 않고 중지한다.
- 연결 오류는 2초부터 최대 30초까지 지수 백오프로 재시도한다.
- 연속 갱신 중 DB 전체 persist는 마지막 변경 후 기본 3초로 debounce한다.

## 패키지 내부 파일별 역할

### 진입점과 화면

| 파일 | 역할 |
| --- | --- |
| `src/main.ts` | 플러그인 진입점. 채팅/햄버거 버튼 등록, controller 생성, 자동 재연결, Svelte mount/unmount, 배지·토스트 수명주기를 관리한다. |
| `src/App.svelte` | 연결 → 대상 선택 → 변경 확인 → 수신 대시보드의 4단계 wizard를 조정한다. |
| `src/ErrorPanel.svelte` | 플러그인 패널 초기화 실패를 표시하는 최소 오류 화면이다. |
| `src/state.svelte.ts` | controller의 공개 상태를 Svelte 반응형 상태로 전달한다. |
| `src/styles.css` | 플러그인 iframe 안의 wizard, diff, 대시보드 전역 스타일이다. |
| `src/constants/plugin.ts` | 플러그인 이름, 표시 이름, 버전 상수다. |

### Wizard 컴포넌트

| 파일 | 역할 |
| --- | --- |
| `src/components/ConnectScreen.svelte` | 연결 문자열 입력, `/health` 연결, 저장된 매핑을 이용한 최근 연결 재시도를 담당한다. |
| `src/components/SelectScreen.svelte` | RisuAI DB의 캐릭터/모듈 목록을 로드·필터링하고 캐릭터 썸네일을 표시한다. |
| `src/components/selection.ts` | wizard가 전달하는 character/module 선택 타입을 정의한다. |
| `src/components/ConfirmScreen.svelte` | Workbench와 RisuAI 대상의 쌍, 이름 불일치 경고, diff, 덮어쓰기 동의, 화면 알림 옵션을 표시한다. |
| `src/components/confirm-gate.ts` | diff 로딩 상태에 따라 수신 시작 가능 여부와 명시적 동의 필요 여부를 결정한다. |
| `src/components/DiffSummary.svelte` | 필드 및 배열 항목 단위 변경 요약, 보존 필드, 에셋 수/크기를 표시한다. |
| `src/components/LineDiff.svelte` | 텍스트/JSON line diff를 렌더링하고 너무 큰 diff는 줄 수 요약으로 대체한다. |
| `src/components/Dashboard.svelte` | phase, 적용 version, 갱신 횟수, 에셋 진행률, 일시정지/재개/연결 해제를 제공한다. |

### HMR 도메인

| 파일 | 역할 |
| --- | --- |
| `src/hmr/controller.ts` | 전체 상태 머신의 중심. 연결, 대상 조회, 최초 적용, long-poll loop, 재연결, 최신 payload 적용, 안전 정지와 저장을 조정한다. |
| `src/hmr/protocol.ts` | 연결 문자열 parser, URL builder, protocol version 및 wire response 타입을 정의한다. |
| `src/hmr/assets.ts` | 에셋 캐시 조회, 기존 파일 probe, 누락 다운로드/저장과 진행률 보고를 담당한다. |
| `src/hmr/merge.ts` | asset placeholder 재귀 치환, 캐릭터 보존 병합, `chaId`/module `id` 대상 탐색 및 교체를 담당한다. |
| `src/hmr/diff.ts` | 최초 적용 전 정의 diff를 만든다. 에셋 경로 차이를 mask하고, record 배열은 `id`/`key`/`name`/`comment` 또는 index로 비교한다. |
| `src/hmr/storage.ts` | 저장 매핑 schema를 검증하고 `mapping-v1`을 load/save/clear하는 저장소를 만든다. |
| `src/hmr/backoff.ts` | 재연결 지연을 2초에서 최대 30초까지 계산한다. |
| `src/hmr/notifier.ts` | 화면 가시성에 따라 이벤트를 즉시 알리거나 여러 갱신을 digest로 합치는 순수 알림 정책이다. |

### RisuAI API 경계와 알림

| 파일 | 역할 |
| --- | --- |
| `src/helpers/risu-api.ts` | `risuai.*`를 controller dependency로 변환한다. 로컬 fetch, DB 읽기/쓰기, 에셋 저장, 권한 요청을 한 경계에 모은다. |
| `src/helpers/plugin-storage.ts` | global/character/chat scope용 안전한 `pluginStorage` key를 만들며, HMR은 global mapping 저장에 사용한다. |
| `src/helpers/host-dom.ts` | `mainDom` 권한으로 얻은 SafeDocument/SafeElement 접근과 async 스타일 적용을 공통화한다. |
| `src/helpers/badge.ts` | RisuAI 호스트 화면 상단에 active/reconnecting/error 상태 배지를 표시한다. |
| `src/helpers/toast.ts` | 최초 연결과 갱신 적용 이벤트를 단일 슬롯 토스트로 표시한다. |
| `src/helpers/notification-visibility.ts` | 문서 가시성, 패널 열림, iframe focus로 토스트를 즉시 보여 줄지 판단한다. |
| `src/helpers/quarantine/chat-context.ts` | 현재 런타임에서 import하지 않는 격리 코드. 현재 캐릭터/채팅 문맥 해석 실험을 보관한다. |
| `src/types/risuai.d.ts` | 번들 외부 전역인 RisuAI API v3와 Safe DOM bridge의 타입 선언 snapshot이다. |
| `src/vite-env.d.ts` | Vite 환경 타입을 TypeScript에 연결한다. |

### 빌드와 테스트 설정

| 파일 | 역할 |
| --- | --- |
| `package.json` | 패키지 metadata, Node/npm 요구 버전, build/typecheck/test script와 개발 의존성을 정의한다. |
| `package-lock.json` | 이 패키지에서 재현 가능한 npm 의존성 해석 결과를 고정한다. |
| `vite.config.ts` | Svelte 5 rune mode로 `src/main.ts`를 단일 ES bundle로 빌드한다. CSS와 RisuAI metadata banner를 JS에 삽입하고 산출물을 Windows drive 경로로 복사한다. |
| `tsconfig.json` | DOM/ES2022, strict mode, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` 등 패키지 타입 검사 규칙이다. |
| `vitest.config.ts` | `tests/**/*.test.ts`를 실행하는 Vitest 설정이다. |
| `tests/*.test.ts` | protocol, controller, target 목록, merge/diff, asset cache, backoff, confirm gate, storage, notifier, 알림 가시성과 toast 렌더링을 검증한다. |

## 연동 패키지와 관련 소스

### `packages/core`

| 파일 | 역할 |
| --- | --- |
| `packages/core/src/domain/hmr/protocol.ts` | 서버 측 protocol version, port 범위(41520–41529), 응답 타입, 연결 문자열 및 asset placeholder 생성 규칙이다. |
| `packages/core/src/node/hmr-build.ts` | canonical character/module 디렉터리를 RisuAI 정의로 빌드하고 에셋을 SHA-256 hash, manifest, source map으로 만든다. |
| `packages/core/src/domain/hmr/charx-to-risu.ts` | character pack 결과를 RisuAI가 바로 적용할 수 있는 native definition으로 변환한다. |
| `packages/core/src/cli/pack/character/workflow.ts` | character canonical source를 pack하는 기존 workflow이며 HMR character builder가 재사용한다. |
| `packages/core/src/cli/pack/module/workflow.ts` | module canonical source를 RisuModule과 asset buffer로 만드는 기존 workflow다. |

### `packages/vscode`

| 파일 | 역할 |
| --- | --- |
| `packages/vscode/src/hmr/HmrServerService.ts` | loopback HTTP 서버, token 인증, long-poll waiter, payload/asset 응답, version과 Broadcast 상태를 관리한다. |
| `packages/vscode/src/views/ArtifactBrowserViewProvider.ts` | webview의 Broadcast/Stop 요청을 처리하고 artifact file watcher를 연결하며 변경 시 서버 rebuild를 호출한다. |
| `packages/vscode/src/artifact-browser/artifactBrowserMessages.ts` | Artifact Browser webview와 확장 host 사이의 HMR 시작/중지/상태 메시지 계약이다. |

### `packages/webview`

| 파일 | 역할 |
| --- | --- |
| `packages/webview/src/lib/components/ArtifactDetailView.svelte` | character/module 상세 화면에 Broadcast 진입점과 HMR 상태 strip을 배치한다. |
| `packages/webview/src/lib/components/HmrStatusStrip.svelte` | Broadcast artifact, 갱신 횟수, receiver poll 상태, 연결 문자열 복사, Stop/전환 UI를 제공한다. |
| `packages/webview/src/lib/vscode.ts` | HMR start/stop webview message를 생성한다. |
| `packages/webview/src/main.ts` | HMR 상태 메시지를 store에 반영하고 사용자 동작을 VS Code host로 전달한다. |

## 개발 명령

패키지 디렉터리에서:

```bash
npm run dev        # Vite watch build
npm run dev:drive  # watch build의 outDir을 /mnt/d/risu로 지정
npm run build      # 단일 플러그인 bundle 생성
npm run typecheck  # TypeScript 검사
npm test           # Vitest 전체 실행
```

모노레포 루트에서는 workspace를 지정할 수 있다.

```bash
npm run --workspace risuai-hmr-provider build
npm run --workspace risuai-hmr-provider typecheck
npm run --workspace risuai-hmr-provider test
```

Todo 8의 compile/package 확인은 다음 순서다. 이 명령들은 compile과 packaging만
확인하며 RisuAI runtime 동작을 자동으로 검증하지 않는다.

```bash
npm run build:core
npm run --workspace risuai-hmr-provider typecheck
npm run --workspace risuai-hmr-provider build
npm run --workspace risu-workbench-webview check
npm run --workspace risu-workbench-webview build
npm run --workspace risu-workbench-vscode build:extension
```

## 사용자 smoke 절차

이 절차는 자동화하지 않았으며 agent가 실행하거나 verified라고 주장하지 않는다.
실제 RisuAI session을 가진 사용자가 직접 수행한다.

1. **Connected success:** fresh plugin bundle을 설치하고 character 또는 module을
   Broadcast한 뒤 RisuAI receiver를 연결한다. 현재 RisuAI chat을 열고 알아볼 수
   있는 chat variable과 최소 두 개의 message를 준비한다. active owner의
   **Chat Debug**를 누르고, 열린 untitled JSON preview에 현재 character/chat
   identity, filtered `$` scriptstate, 최신 두 message와 absolute index가 보이는지
   비교한다.
2. **Disconnected failure:** receiver를 disconnected 상태로 둔 채 같은 active HMR
   owner에서 **Chat Debug**를 누른다. 요청이 성공 snapshot으로 열리지 않고 safe
   failure가 표시되며 pending 상태가 종료되는지 확인한다.

두 단계 모두 user-owned runtime smoke이며 자동 테스트나 agent-verified runtime
결과가 아니다.

기본 산출물은 `dist/risuai-hmr-provider.js`다. bundle 상단에는 `//@name`, `//@display-name`, `//@api 3.0`, `//@version`, `//@description`, `//@link` metadata가 붙고 CSS도 런타임 `<style>` 생성 코드로 포함된다.

## 권한과 보안 경계

- 플러그인은 대상 목록과 정의 갱신을 위해 `db`, 호스트 배지/토스트를 위해 `mainDom` 권한을 요청한다.
- HMR 서버는 `127.0.0.1`에만 bind하고 임의 128-bit token을 query parameter로 검증한다.
- 서버는 41520–41529 포트를 순서대로 시도하고 모두 사용할 수 없으면 OS 임시 포트를 사용한다.
- 연결 문자열에는 인증 token이 포함되므로 외부에 공유하거나 문서/로그에 저장하지 않는다.
- 이 기능은 개발 중인 canonical artifact를 기존 RisuAI 대상에 반복해서 덮어쓰는 도구다. 최초 diff와 대상 이름을 확인한 뒤 수신을 시작해야 한다.
