# Architecture Proposal: Monorepo 구조 재설계

> 작성 기준: 2026-03-14
> 상태: **제안 (Draft)**

## 요약

`packages/core`의 `src/` ↔ `scripts/` 이중 구조를 해소하고, core · vscode · contracts · webview 4-package 체제로 수렴하는 구조를 제안한다.

핵심 원칙:
- **Source of truth는 하나**: `src/`만 빌드하고, `scripts/`는 과도기 bridge로만 존재
- **공유는 wrapper 디렉토리가 아니라 public contract**를 통해 이뤄진다
- **관심사 분리**: domain(순수 로직) / node(I/O) / cli(진입점)
- **contracts 패키지**: Extension ↔ Webview 간 메시지 프로토콜 전용

---

## 1. 현재 상태 진단

### 1.1 packages/core 내부 구조

```
packages/core/
├── bin/risu-core.js          # CLI entry — execSync로 scripts/*.js 실행
├── src/                      # TS library layer (tsconfig 빌드 대상)
│   ├── index.ts              # barrel: types + shared
│   ├── types/card.ts         # CardData, RegexScript, LorebookEntry 등
│   ├── shared/               # risu-api, extract-helpers, uri-resolver, analyze-helpers
│   └── node/index.ts         # shared를 re-export (./node 진입점)
├── scripts/                  # 원본 JS 구현체 (tsconfig 빌드 제외)
│   ├── shared/               # ← dist/node를 감싸는 bridge wrapper 4개
│   ├── extract.js            # 직접 구현 (JS, type-check 없음)
│   ├── pack.js               # 직접 구현
│   ├── analyze.js            # 직접 구현
│   ├── analyze-card.js       # 직접 구현
│   ├── build-components.js   # 직접 구현
│   ├── extract/              # phases.js, parsers.js
│   ├── analyze/              # collector, correlation, reporting, htmlRenderer
│   └── analyze-card/         # collectors, correlators, constants, lorebook-analyzer, reporting
├── dist/                     # tsc 출력 (src/만 컴파일)
├── tests/
├── package.json              # exports: ".", "./node"
└── tsconfig.json             # include: src/**/*.ts, exclude: scripts
```

### 1.2 문제점

| 문제 | 원인 | 영향 |
|---|---|---|
| **Dual source-of-truth** | `src/shared/`(TS) + `scripts/shared/`(JS bridge) 병존 | 변경 시 양쪽 sync 필요, 이름 매핑(`buildRisuFolderMap` ↔ `buildFolderMap`) 불일치 위험 |
| **타입 안전성 구멍** | scripts/ 20여 개 JS 파일이 tsconfig 빌드 범위 밖 | 리팩토링 시 scripts/ 파손 감지 불가 |
| **비표준 CLI 실행** | `bin/risu-core.js`가 `execSync`로 scripts/*.js를 자식 프로세스 실행 | 에러 스택 절단, 프로세스 오버헤드, 디버깅 어려움 |
| **wrapper 계층 과잉** | 같은 함수가 `src/shared/` → `dist/node/` → `scripts/shared/` → `scripts/*.js`로 4단계 거침 | 관리 포인트 과다, 의존성 추적 어려움 |
| **패키지 경계 불명확** | vscode가 core를 dependency로 가지지만 아직 미사용 | 경계 설계가 검증되지 않은 상태 |

### 1.3 이미 합의된 방향

- `src/`를 `packages/core`의 유일한 source of truth로 확정
- `scripts/shared/*`는 과도기 bridge이며, 최종 구조에서 제거
- 공유는 wrapper 디렉토리가 아닌 명확한 public contract을 통해
- core = domain/node/cli, vscode = extension host + adapter, 필요 시 contracts 별도 패키지

---

## 2. 설계 결정 근거

5개 핵심 질문에 대한 판단과 근거.

### 2.1 Internal thin wrapper를 어디까지 허용하는가?

**결정: bin/ entry point wrapper만 허용. 내부 bridge wrapper는 제거 대상.**

| Wrapper 유형 | 판정 | 근거 |
|---|---|---|
| `bin/risu-core.js` (CLI entry) | ✅ 허용 | Node version check, env setup 등 bootstrap 용도. pnpm, Changesets 등도 동일 패턴 |
| `scripts/shared/*.js` (bridge) | ❌ 제거 | dist/node를 재포장할 뿐. 이름 매핑까지 끼어있어 aliasing layer화 |

참고: pnpm, Changesets, tsup, Turborepo 모두 `bin/` → `dist/` 직접 참조 패턴 사용. `scripts/`를 경유하는 production CLI는 확인되지 않음.

### 2.2 src/domain · node · cli 분리가 scripts/ 잔존보다 유지보수성을 높이는가?

**결정: 예. 3-layer 분리를 채택.**

근거:
- scripts/의 20개 JS 파일은 tsc 빌드 범위 밖이므로 타입 안전성 제로
- domain/node 분리로 순수 로직이 브라우저(webview)에서도 사용 가능
- cli를 별도 layer로 두면 `bin/` → `dist/cli/` 직접 호출 가능 — `execSync` 제거
- 업계 컨센서스: `scripts/`는 repo maintenance용(CI, release), 제품 CLI는 `src/cli/`에 위치

### 2.3 VSCode extension + webview + shared logic — core와 contracts 분리 기준

**결정: contracts 패키지를 별도 생성. 단, webview 개발 착수 시점에.**

근거:
- Extension host(Node.js)와 Webview(격리 iframe/브라우저)는 `postMessage`로만 통신
- core에는 `fs`, `child_process`, `fflate` 등 Node.js 전용 의존성 존재
- webview가 core를 직접 import하면 번들 에러 발생
- contracts 패키지 = 순수 타입 + 메시지 프로토콜만 포함 → 양쪽에서 안전하게 import

지금은 시기상조인 이유:
- vscode extension이 아직 core를 실제로 consume하지 않음
- webview 코드 자체가 미존재 (ui-mockup/만 있음)
- 실제 메시지 프로토콜이 정해지지 않은 상태에서 contracts를 만들면 빈 껍데기

### 2.4 Package public API 강제의 실효성

**결정: eslint-plugin-boundaries로 lint-time 강제. 런타임 강제는 나중에.**

현재 core `package.json`의 exports 필드가 이미 잘 설정되어 있음:
```json
"exports": { ".": "./dist/index.js", "./node": "./dist/node/index.js" }
```

하지만 tsconfig의 `moduleResolution: "node"` (legacy)에서는 exports가 실제로 enforce되지 않음.

규모별 로드맵:
1. **지금**: barrel export(`index.ts`) 관리 + 코드 리뷰 컨벤션으로 충분
2. **팀 확장 시**: `eslint-plugin-boundaries` 도입
3. **패키지 퍼블리시 시**: `moduleResolution: "Node16"` + exports 강제

### 2.5 공유 리소스 — core에 넣을 것 vs contracts로 분리할 것

**결정: domain 타입은 core에, 메시지 프로토콜은 contracts에.**

판단 기준: **"import하면 Node.js가 딸려오는가?"**

| 리소스 유형 | 위치 | 이유 |
|---|---|---|
| `CardData`, `RegexScript`, `LorebookEntry` 등 도메인 타입 | `core` (exports ".") | 순수 타입. Node.js 의존성 없음. webview에서도 안전 |
| `parsePngTextChunks`, `writeJson` 등 I/O 함수 | `core` (exports "./node") | Node.js 전용. webview에서 사용 불가 |
| `ExtractCardCommand`, `CardExtractedEvent` 등 메시지 | `contracts` | Extension ↔ Webview 통신 전용. 양쪽 공유 필요 |
| UI 컴포넌트 타입 (`PanelState`, `TreeItemData`) | `contracts` | Extension host + Webview 양쪽에서 참조 |

domain/node 분리가 완료되면 core의 `"."` export는 자연스럽게 브라우저 safe가 됨. 이 경우 **도메인 타입을 위한 별도 패키지는 불필요**.

---

## 3. 목표 구조

### 3.1 최종 패키지 레이아웃

```
risu-workbench/
├── packages/
│   ├── core/                          # 핵심 엔진
│   │   ├── bin/risu-core.js           # thin bootstrap → dist/cli/main.js
│   │   ├── src/
│   │   │   ├── domain/                # 순수 비즈니스 로직 (Node.js 의존성 0)
│   │   │   │   ├── card/              # CardData 파싱, CBS 분석
│   │   │   │   ├── lorebook/          # lorebook 구조 분석
│   │   │   │   ├── regex/             # regex script 처리
│   │   │   │   └── analyze/           # 분석 로직 (상관관계, 통계)
│   │   │   ├── node/                  # Node.js I/O 어댑터
│   │   │   │   ├── fs-helpers.ts      # ensureDir, writeJson, writeText, writeBinary
│   │   │   │   ├── png.ts             # PNG chunk 파싱 (Buffer 의존)
│   │   │   │   └── card-io.ts         # parseCardFile (fs + fflate)
│   │   │   ├── cli/                   # CLI orchestration
│   │   │   │   ├── main.ts            # subcommand dispatcher
│   │   │   │   ├── extract.ts         # extract 워크플로우
│   │   │   │   ├── pack.ts            # pack 워크플로우
│   │   │   │   ├── analyze.ts         # analyze 워크플로우
│   │   │   │   └── analyze-card.ts    # analyze-card 워크플로우
│   │   │   ├── types/                 # 공유 타입 정의
│   │   │   │   ├── card.ts
│   │   │   │   └── index.ts
│   │   │   └── index.ts              # barrel: types + domain만 export
│   │   ├── package.json
│   │   │   # exports:
│   │   │   #   "."      → dist/index.js     (types + domain, 브라우저 safe)
│   │   │   #   "./node" → dist/node/index.js (Node.js I/O)
│   │   │   #   "./cli"  → dist/cli/main.js   (CLI entry, internal)
│   │   │   # bin:
│   │   │   #   "risu-core" → bin/risu-core.js
│   │   └── tsconfig.json             # include: src/**/*.ts (scripts/ 없음)
│   │
│   ├── vscode/                        # VSCode Extension
│   │   └── src/
│   │       ├── extension.ts           # activate/deactivate
│   │       ├── services/              # core를 consume하는 서비스 계층
│   │       │   ├── card-service.ts    # core domain + node를 조합
│   │       │   └── analysis-service.ts
│   │       ├── providers/             # VSCode UI 제공자
│   │       │   ├── tree-provider.ts   # TreeView
│   │       │   └── codelens-provider.ts
│   │       ├── panels/                # Webview panel host
│   │       │   └── card-panel.ts      # webview 생성 + 메시지 라우팅
│   │       └── commands/              # command palette 바인딩
│   │
│   ├── contracts/                     # 순수 타입 + 메시지 프로토콜 (코드 없음)
│   │   ├── src/
│   │   │   ├── messages.ts            # Extension ↔ Webview 메시지 정의
│   │   │   ├── ui-types.ts            # PanelState, TreeItemData 등
│   │   │   └── index.ts
│   │   ├── package.json               # 의존성 0, 순수 타입만
│   │   └── tsconfig.json
│   │
│   └── webview/                       # Webview UI (브라우저 환경)
│       ├── src/
│       │   ├── App.tsx                # UI root
│       │   ├── components/            # UI 컴포넌트
│       │   └── messaging.ts           # postMessage wrapper (contracts import)
│       ├── package.json               # depends on: contracts, core(types only)
│       └── vite.config.ts             # 브라우저 번들링
│
├── docs/
├── package.json                       # workspaces: ["packages/*"]
├── TODO.md
└── AGENTS.md
```

### 3.2 의존성 그래프

```
                  ┌──────────────┐
                  │   contracts  │  ← 순수 타입, 의존성 0
                  │  (messages,  │
                  │   ui-types)  │
                  └──────┬───────┘
                         │ import types
              ┌──────────┼──────────┐
              │          │          │
              ▼          ▼          ▼
        ┌──────────┐ ┌────────┐ ┌─────────┐
        │  vscode   │ │webview │ │  core   │
        │(extension)│ │ (UI)  │ │(engine) │
        └────┬──────┘ └────────┘ └────┬────┘
             │                        │
             │  import core "."       │
             │  import core "./node"  │
             └────────────────────────┘

  ※ webview → core "." (domain/types만, 브라우저 safe)
  ※ vscode → core ".", "./node" (full access)
  ※ webview ↛ core "./node" (Node.js 의존성 — 금지)
```

### 3.3 exports 설계

```jsonc
// packages/core/package.json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./node": {
      "types": "./dist/node/index.d.ts",
      "default": "./dist/node/index.js"
    }
  },
  "bin": {
    "risu-core": "bin/risu-core.js"
  }
}
```

```jsonc
// packages/contracts/package.json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "dependencies": {}  // 의존성 0 유지
}
```

### 3.4 bin/risu-core.js 목표 형태

```javascript
#!/usr/bin/env node
const { run } = require('../dist/cli/main');
run(process.argv.slice(2));
```

`execSync` 제거. 같은 프로세스에서 직접 실행.

---

## 4. 마이그레이션 로드맵

### Phase 1: Core 내부 정리 (현재 → domain/node/cli 분리)

> 목적: scripts/ 제거를 위한 기반. src/를 유일한 빌드 대상으로.

| Step | 작업 | 선행 조건 | 완료 기준 |
|---|---|---|---|
| 1-1 | `src/domain/` 디렉토리 생성, `src/shared/`에서 순수 로직 이동 | 없음 | domain/ 내 모든 함수가 Node.js import 0 |
| 1-2 | `src/node/` 정비 (I/O 함수만 남김) | 1-1 | node/가 domain/만 의존 |
| 1-3 | `src/cli/` 생성, scripts/*.js 로직을 TS로 이관 | 1-1, 1-2 | 각 CLI 커맨드가 `src/cli/`에서 동작 |
| 1-4 | `bin/risu-core.js` → `dist/cli/main.js` 직접 호출 | 1-3 | `execSync` 제거 |
| 1-5 | `scripts/shared/` bridge 삭제 | 1-3 | bridge 파일 0개 |
| 1-6 | `scripts/` 폴더 삭제 | 1-3, 1-4, 1-5 | scripts/ 디렉토리 소멸 |
| 1-7 | 계약 테스트 보강 | 1-6 | CLI smoke + domain unit + node integration 통과 |

### Phase 2: VSCode Extension 구조 확장

> 목적: core를 실제로 consume하면서 패키지 경계 검증.

| Step | 작업 | 선행 조건 | 완료 기준 |
|---|---|---|---|
| 2-1 | `services/` 계층 도입 (core import) | Phase 1 완료 | core ".", "./node" import 정상 동작 |
| 2-2 | `providers/` 도입 (TreeView 등) | 2-1 | VSCode UI 제공자 1개 이상 동작 |
| 2-3 | `commands/` 도입 | 2-1 | command palette 연동 |
| 2-4 | `panels/` 도입 (webview host 준비) | 2-2 | webview panel skeleton 생성 |

### Phase 3: Contracts + Webview

> 목적: Extension ↔ Webview 타입 안전 통신 확립.

| Step | 작업 | 선행 조건 | 완료 기준 |
|---|---|---|---|
| 3-1 | `packages/contracts/` 생성, 메시지 프로토콜 정의 | Phase 2-4 | typed message map 존재 |
| 3-2 | `packages/webview/` 생성 (ui-mockup/ 승격) | 3-1 | vite 빌드 + contracts import 동작 |
| 3-3 | Extension ↔ Webview postMessage 연동 | 3-1, 3-2 | 양방향 typed 메시지 전달 검증 |
| 3-4 | ui-mockup/ 퇴역 | 3-2 | 디렉토리 삭제 |

### Phase 순서 의존성

```
Phase 1 (core 정리) ──→ Phase 2 (vscode 확장) ──→ Phase 3 (contracts + webview)
                        ↑
                        │ Phase 2-1은 Phase 1-1 완료 후 병렬 가능
```

---

## 5. scripts/ 이관 상세

현재 scripts/의 각 파일이 어디로 이동하는지.

### 5.1 Bridge 파일 (삭제)

| 현재 위치 | 처분 | 이유 |
|---|---|---|
| `scripts/shared/risu-api.js` | 삭제 | dist/node re-export + 이름 매핑. 소비자가 직접 dist/node 사용 |
| `scripts/shared/extract-helpers.js` | 삭제 | 상동 |
| `scripts/shared/analyze-helpers.js` | 삭제 | 상동 |
| `scripts/shared/uri-resolver.js` | 삭제 | 상동 |

### 5.2 직접 구현체 (src/cli/ 또는 src/domain/으로 이관)

| 현재 위치 | 이관 대상 | 비고 |
|---|---|---|
| `scripts/extract.js` | `src/cli/extract.ts` | CLI orchestration 부분만. 순수 로직은 domain/으로 |
| `scripts/extract/phases.js` | `src/domain/card/` + `src/node/` | phase별로 순수/I/O 분리 |
| `scripts/extract/parsers.js` | `src/domain/card/parsers.ts` | 순수 파싱 로직 |
| `scripts/pack.js` | `src/cli/pack.ts` | 상동 |
| `scripts/analyze.js` | `src/cli/analyze.ts` | 상동 |
| `scripts/analyze/*.js` | `src/domain/analyze/` | collector, correlation, reporting |
| `scripts/analyze/reporting/htmlRenderer.js` | `src/domain/analyze/html-renderer.ts` | 순수 string 생성 |
| `scripts/analyze-card.js` | `src/cli/analyze-card.ts` | 상동 |
| `scripts/analyze-card/*.js` | `src/domain/analyze-card/` | collectors, correlators, constants, lorebook-analyzer |
| `scripts/analyze-card/reporting/htmlRenderer.js` | `src/domain/analyze-card/html-renderer.ts` | 상동 |
| `scripts/build-components.js` | `src/cli/build.ts` | 상동 |
| `scripts/rpack_map.bin` | `src/node/` 또는 `assets/` | 바이너리 리소스 |
| `scripts/package.json` | 삭제 | scripts 전용 config. 불필요 |

### 5.3 이관 원칙

1. **JS → TS 변환**: 이관 시 TypeScript로 변환. strict mode 적용.
2. **I/O 분리**: `fs.readFile`, `path.join`, `child_process` 등은 `src/node/`로. 순수 변환/분석 로직은 `src/domain/`으로.
3. **계약 테스트 선행**: 이관 전에 현재 동작을 고정하는 integration test 작성. 이관 후 동일 테스트 통과 확인.
4. **점진적 이관**: 한 번에 전부 옮기지 않음. extract → pack → analyze → analyze-card → build 순서로.

---

## 6. 리스크 & 완화

| 리스크 | 심각도 | 완화 방안 |
|---|---|---|
| scripts/ 이관 중 기존 CLI 동작 깨짐 | 높음 | 이관 전 CLI smoke test 보강. 이관 중 scripts/와 src/cli/ 병행 유지 |
| domain/node 경계 판단 오류 (순수로 보았는데 실제 I/O 의존) | 중간 | domain/ 내에서 Node.js import 시 tsc 에러 나도록 tsconfig 분리 검토 |
| contracts 패키지 조기 생성 → 빈 껍데기 관리 부담 | 낮음 | Phase 3까지 생성 보류. webview 개발 시작 시점에 실제 메시지 기반으로 생성 |
| `moduleResolution` 변경 시 기존 import 깨짐 | 중간 | Phase 1 완료 후 별도 작업으로 분리. 한 번에 변경하지 않음 |

---

## 7. TODO.md 매핑

이 제안이 기존 TODO.md의 어떤 항목에 대응하는지.

| TODO 항목 | 이 문서의 대응 섹션 |
|---|---|
| `packages/core` 런타임 경계 재구성 (`domain`/`node`/`cli` 분리, `scripts/` 복제 구조 축소) | Phase 1 전체 |
| thin wrapper 경로 정리 (`bin`/`scripts`가 public/core seam을 사용하도록 단계 이관) | Phase 1, Step 1-4 · 1-5 |
| 이후 `src/domain`, `src/node`, `src/cli` 물리 분리 | Phase 1, Step 1-1 ~ 1-3 |
| `packages/vscode` 구조 확장 (`services/`, `providers/`, `panels/`, `messaging/` 도입) | Phase 2 전체 |
| Webview UI 패키지 분리 (`ui-mockup/` 정리 후 `packages/webview` 또는 `packages/ui`로 승격) | Phase 3, Step 3-2 · 3-4 |
| Core↔Extension↔Webview DTO/메시지 계약 정의 | Phase 3, Step 3-1 |
