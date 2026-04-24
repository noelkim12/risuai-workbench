# CBS Language Server — RisuAI 통합 아티팩트 LSP

> **패키지:** `packages/cbs-lsp/`
> **의존:** `packages/core/` (CBS 파서, 분석 함수, 도메인 타입)
> **대상 환경:** 추출된 `.charx`/`.risum` 디렉토리를 VS Code workspace로 편집

---

## 제품 개요

`cbs-language-server`는 추출된 RisuAI workspace의 CBS-bearing artifact를 위한 standalone LSP 패키지입니다. 핵심 목표는 세 가지입니다.

- editor/client가 바로 붙을 수 있는 public stdio server surface 제공
- LuaLS companion을 선택적으로 붙이되, 없을 때도 CBS 기능은 정직하게 유지
- agent/automation이 Layer 1/Layer 3 snapshot/query surface를 machine-readable contract로 소비할 수 있게 유지

현재 baseline에는 diagnostics, completion, hover, signature help, folding, semantic tokens, definition/references/rename, formatting, code actions, document symbols, workspace symbols, document highlights, selection ranges, inlay hints, lorebook CodeLens, standalone JSON `report/query` adapter, LuaLS diagnostics/hover/completion proxy가 포함됩니다. 자세한 구현 상태와 future gap은 `packages/cbs-lsp/checklist/CBS_CHECKLIST.md`를 source-of-truth로 봐 주세요.

## 빠른 시작

### Standalone attach

```bash
# local install
npx cbs-language-server --stdio

# inspect runtime/operator contract without booting the sidecar
npx cbs-language-server report availability

# inspect Layer 1 / Layer 3 contracts
npx cbs-language-server report layer1 --workspace ./playground/sample-workspace
npx cbs-language-server query variable sharedVar --workspace ./playground/sample-workspace
```

- 설치/실행, config precedence, workspace root selection: `packages/cbs-lsp/docs/STANDALONE_USAGE.md`
- agent/automation consumption patterns: `packages/cbs-lsp/docs/AGENT_INTEGRATION.md`
- LuaLS companion 설치/검증: `packages/cbs-lsp/docs/LUALS_COMPANION.md`
- 장애 복구: `packages/cbs-lsp/docs/TROUBLESHOOTING.md`

### Official VS Code client

공식 VS Code 소비 방식은 `packages/vscode/README.md`에 분리했습니다. `packages/vscode`는 `auto` / `standalone` / `embedded` launch mode와 `local-devDependency` / `npx` / `global` install mode를 조합해 `cbs-language-server`를 소비합니다.

## 검증 레이어

- standalone server E2E: `npm run --workspace cbs-language-server test:e2e:standalone`
  - 범위: built `cbs-language-server --stdio` process, real extracted workspace, JSON-RPC lifecycle, CBS provider 결과, runtime availability request
  - 대표 근거: `tests/standalone/stdio-server.test.ts`, `tests/e2e/extracted-workspace.test.ts`
- standalone server performance smoke: `npm run --workspace cbs-language-server test:perf:standalone`
  - 범위: large workspace cold-start, incremental rebuild, stdio client attach cost, payload-size regression budget
  - 대표 근거: `tests/perf/large-workspace.test.ts`
- LuaLS opt-in product matrix: `CBS_LSP_RUN_LUALS_INTEGRATION=true npm run --workspace cbs-language-server test:product-matrix:luals`
  - 범위: real LuaLS companion, `.risulua` hover/completion/diagnostics roundtrip, generated RisuAI stub completion label
  - 대표 근거: `tests/providers/luals-integration.test.ts`, `tests/standalone/stdio-server.test.ts`
- official VS Code client boundary E2E: `npm run --workspace risu-workbench-vscode test:e2e:cbs-client:boundary`
  - 범위: official client launch resolver, standalone/embedded/failure UX boundary snapshot, package script separation
  - 대표 근거: `packages/vscode/tests/e2e/extension-client.test.ts`
- official VS Code client runtime E2E: `npm run --workspace risu-workbench-vscode test:e2e:cbs-client:runtime`
  - 범위: `@vscode/test-electron` Extension Development Host에서 real `LanguageClient` initialize → didOpen → hover → shutdown cleanup roundtrip
  - 대표 근거: `packages/vscode/tests/e2e/extension-host/suite.ts`
- official VS Code client full E2E: `npm run --workspace risu-workbench-vscode test:e2e:cbs-client`

루트 `verify:cbs-lsp-release`는 위 분리를 유지한 채 standalone server 쪽 product matrix와 official client 쪽 verify/E2E를 따로 실행합니다.

## 제품 문서 세트

| 문서 | 역할 |
| --- | --- |
| `packages/cbs-lsp/README.md` | 제품 개요와 빠른 진입점 |
| `packages/cbs-lsp/docs/STANDALONE_USAGE.md` | standalone 설치/실행, runtime config precedence, workspace root 정책 |
| `packages/cbs-lsp/docs/AGENT_INTEGRATION.md` | stdio LSP + JSON `report/query` adapter를 agent가 소비하는 방법 |
| `packages/cbs-lsp/docs/LUALS_COMPANION.md` | LuaLS companion 설치, override, 상태 확인, degraded policy |
| `packages/cbs-lsp/docs/TROUBLESHOOTING.md` | runtime/operator failure mode 키별 복구 가이드 |
| `packages/cbs-lsp/docs/COMPATIBILITY.md` | Node / workspace / LuaLS / VS Code client attach 지원 경계 |
| `packages/vscode/README.md` | 공식 VS Code client 설정과 standalone 소비 방식 |

`experimental.cbs.operator.docs`와 trace `availability.operator.docs`는 위 문서 경로를 같은 용어로 노출합니다.

## 운영 계약 요약

- **install modes**: `local-devDependency` / `npx` / `global`
- **workspace policy**: `runtime-config.workspacePath -> initialize.workspaceFolders[0] -> initialize.rootUri`, 이후 canonical `.risu*` 경로 fallback 허용
- **failure modes**: `workspace-root-unresolved`, `multi-root-reduced`, `watched-files-client-unsupported`, `luals-unavailable`
- **agent protocol marker**: `schema: "cbs-lsp-agent-contract"`, `schemaVersion: "1.0.0"`
- **LSP availability query**: stdio 세션이 이미 열려 있다면 custom request `cbs/runtimeAvailability`가 `experimental.cbs.availabilitySnapshot` / `report availability`와 같은 normalized runtime availability snapshot을 현재 세션 상태 기준으로 다시 반환합니다.
- **scope honesty**: JSON `report/query`는 read-only surface이고, 쓰기 동작은 LSP provider 경계에 머뭅니다. Lua state bridge MVP도 같은 원칙을 따르며 `read-only bridge: on`, `multi-file edit: off`를 `experimental.cbs.operator.scope` / trace `availability.operator.scope` / deferred feature availability에서 같은 표현으로 고정합니다.

## 아키텍처 / 릴리스 진입 링크

- 현재 구현/미구현 상태와 Evidence: `packages/cbs-lsp/checklist/CBS_CHECKLIST.md`
- 전체 설계/roadmap 문맥: `CBS_LSP_PLAN.md`
- release/source-of-truth 정책은 Changesets + `.github/workflows/ci.yml` / `.github/workflows/cbs-lsp-publish.yml` 조합을 기준으로 유지합니다.

## 비전 (목표 아키텍처)

CBS LSP는 단순한 CBS 구문 언어 서버가 아닙니다. RisuAI의 lorebook, regex, Lua, variable이 형성하는 **유기적 관계 네트워크 전체를 실시간으로 분석**하고, 파일 경계를 넘나드는 언어 기능을 제공하는 **통합 아티팩트 LSP**입니다.

기존 analyze pipeline(`packages/core/src/cli/analyze/`)이 정적 분석 리포트를 생성한다면, CBS LSP는 그 분석 능력을 **편집 시점에 실시간으로** 제공합니다. 에디터에서 lorebook을 편집하는 순간, 그 변수가 어떤 regex에서 읽히고, 어떤 Lua 함수가 참조하는지 즉시 알 수 있습니다.

또한 LSP를 통해 Cursor, Claude Code 등 **AI 코딩 도구가 RisuAI 아티팩트의 구조와 관계를 이해**할 수 있어, agentic coding 품질이 크게 향상됩니다.

---

## 아키텍처

### 3-Layer 설계

```
┌─────────────────────────────────────────────────────┐
│                   LSP Server                         │
│                  (single process)                    │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │         Layer 3: Cross-Element Services      │    │
│  │  VariableFlowService   ActivationChainService│    │
│  │  LuaCBSBridgeService                         │    │
│  └──────────────┬──────────────────────────────┘    │
│                 │ queries                            │
│  ┌──────────────▼──────────────────────────────┐    │
│  │         Layer 1: Workspace Indexer           │    │
│  │  FileScanner → ElementRegistry               │    │
│  │               → UnifiedVariableGraph         │    │
│  │  DirtyTracker → IncrementalRebuilder         │    │
│  │                                               │    │
│  │  core 의존:                                    │    │
│  │   extractCBSVarOps, buildUnifiedCBSGraph,     │    │
│  │   analyzeLuaSource, analyzeLorebookStructure  │    │
│  └──────────────┬──────────────────────────────┘    │
│                 │ provides index to                  │
│  ┌──────────────▼──────────────────────────────┐    │
│  │         Layer 2: Language Providers           │    │
│  │                                               │    │
│  │  ┌─────────────┐    ┌────────────────────┐   │    │
│  │  │ CBS Provider │    │   Lua Provider     │   │    │
│  │  │ (공용 파서)   │    │ LuaLS + RisuAI    │   │    │
│  │  │              │    │  addon layer       │   │    │
│  │  └─────────────┘    └────────────────────┘   │    │
│  └──────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

**설계 원칙:**

- **Layer 1 (Workspace Indexer)**: workspace open 시 파일 트리를 스캔, core의 분석 함수들로 `UnifiedVariableGraph`를 구축. 파일 변경 시 incremental rebuild
- **Layer 2 (Language Providers)**: 파일 타입별 LSP 기능 제공. CBS Provider는 core의 공용 파서 사용, Lua Provider는 사용자가 설치한 LuaLS를 subprocess로 띄우고 RisuAI 전용 기능을 overlay한다. LuaLS가 없으면 Lua 기능은 `unavailable` 상태로 정직하게 노출한다.
- **Layer 3 (Cross-Element Services)**: Layer 1의 그래프를 조회하여 cross-file go-to-definition, find-references, 활성화 체인 진단 등 제공. Layer 2의 provider들이 이 서비스를 호출

**데이터 흐름:**

```
파일 변경 → Layer 1 재인덱싱 → Layer 2 해당 파일 재분석
                                    → Layer 3 cross-element 진단 갱신
외부 파일 변경 → watched-file 이벤트 → Layer 1 재인덱싱
                                     → 영향받은 URI `publishDiagnostics`
                                     → lorebook CodeLens `workspace/codeLens/refresh`
```

---

## Layer 1: Workspace Indexer

### 대상 디렉토리 구조 (Canonical Workspace)

```
Workspace Root (추출된 .charx/.risum 디렉토리)
├── lorebooks/
│   ├── 📖_기본설정/
│   │   ├── 🎯_히로인.risulorebook      ← lorebook entry (CBS in CONTENT)
│   │   └── 🌍_세계관.risulorebook
│   └── 📖_이벤트/
│       └── ⚡_전투.risulorebook
├── regex/
│   ├── 감정표현.risuregex            ← regex script (CBS in IN/OUT)
│   └── 변수처리.risuregex
├── lua/
│   ├── <charxName>.risulua           ← Lua source (setState/getState, target-name-based)
│   └── utils.lua
├── html/
│   └── background.risuhtml           ← Background HTML (CBS-bearing)
├── variables/
│   └── <charxName>.risuvar           ← Default variables (key=value, target-name-based)
└── character/
    └── metadata.json                 ← 메타데이터 (variables 기본값 등)

**Note:** The canonical workspace uses `.risu*` artifacts as the editable source of truth. Root JSON files are not present in extracted workspaces.
```

### 구성요소

**FileScanner**

- workspace open 시 디렉토리 구조를 재귀 탐색
- 파일 타입 판별: `.risulorebook`, `.risuregex`, `.risulua`, `.risuhtml`, `.risuprompt`
- 파일별 `artifactClass` / `cbsBearingArtifact` / `hasCbsFragments` / `fragmentMap`를 stable scan contract로 반환
- client가 watched file support를 제공하면 `workspace/didChangeWatchedFiles`를 동적으로 등록해 lorebook / regex / prompt / html / lua 파일의 create/change/delete 이벤트를 받습니다.

**ElementRegistry**

`FileScanner` scan result를 받아 workspace 파일별 element/fragment 분석 결과를 정규화해 보관하는 중앙 저장소입니다. 현재 first-cut은 URI/file record, artifact kind별 bucket, future graph용 normalized graph seed를 제공합니다.

```typescript
interface ElementRegistrySnapshot {
  schema: 'cbs-lsp-agent-contract'
  schemaVersion: '1.0.0'
  rootPath: string
  files: ElementRegistryFileRecord[]
  elements: ElementRegistryElement[]
  graphSeeds: ElementRegistryGraphSeed[]
}

interface ElementRegistry {
  getSnapshot(): ElementRegistrySnapshot
  getFileByUri(uri: string): ElementRegistryFileRecord | null
  getElementsByUri(uri: string): ElementRegistryElement[]
  getFilesByArtifact(artifact: CustomExtensionArtifact): ElementRegistryFileRecord[]
  getElementsByArtifact(artifact: CustomExtensionArtifact): ElementRegistryElement[]
  getGraphSeeds(): ElementRegistryGraphSeed[]
  getAllElementCbsData(): ElementCBSData[]
}
```

- lorebook / regex / prompt / html은 fragment 단위 `extractCBSVarOps()` 결과를 element로 등록합니다.
- lua는 파일 전체를 `analyzeLuaSource()`로 분석해 단일 Lua element와 raw `LuaAnalysisArtifact`를 함께 보관합니다.
- `.risutoggle`, `.risuvar`와 fragment가 없는 CBS-bearing 파일도 file record는 유지하지만 fake element는 만들지 않습니다.

**UnifiedVariableGraph**

현재 Layer 1 public contract는 core analyze 결과를 그대로 노출하는 node-first graph가 아니라, **occurrence-first workspace snapshot**입니다. `UnifiedVariableGraph.fromRegistry()`가 `ElementRegistry`를 source of truth로 읽어 lorebook / regex / prompt / html CBS occurrence와 Lua state API occurrence를 한 그래프로 합칩니다.

- 각 occurrence는 `occurrenceId`, `variableName`, `direction`, `sourceKind`, `sourceName`, `uri`, `relativePath`, `artifact`, `artifactClass`, `elementId`, `elementName`, `fragmentSection`, `analysisKind`, `hostRange`, `hostStartOffset`, `hostEndOffset`, `argumentRange`를 보존합니다.
- CBS fragment occurrence는 fragment-local range를 host document 좌표로 rebasing 해서 저장합니다.
- Lua occurrence는 `getState` / `setState` / `getChatVar` / `setChatVar` static key access를 같은 snapshot shape로 저장합니다.
- HTML은 `fragmentSection: 'full'`, Lua는 `fragmentSection: null`을 사용합니다.
- ordering은 variable name, URI, host offset, occurrenceId 기준으로 deterministic 하게 고정됩니다.
- serialization-friendly snapshot을 위해 public shape는 array / record만 사용합니다.

대표 shape는 아래와 같습니다.

```typescript
// UnifiedVariableOccurrence - canonical occurrence-first shape
interface UnifiedVariableOccurrence {
  occurrenceId: string  // {elementId}:{direction}:{hostStartOffset}-{hostEndOffset}:{variableName}
  variableName: string
  direction: 'read' | 'write'
  sourceKind: 'cbs-macro' | 'lua-state-api'
  sourceName: string  // getvar/setvar/addvar/setdefaultvar/getState/setState/getChatVar/setChatVar
  uri: string
  relativePath: string
  artifact: 'lorebook' | 'regex' | 'prompt' | 'html' | 'lua' | 'toggle' | 'variable'
  artifactClass: 'cbs-bearing' | 'non-cbs'
  elementId: string  // {uri}#fragment:{section}:{index} or {uri}#lua
  elementName: string
  fragmentSection: string | null  // 'CONTENT', 'IN', 'OUT', 'TEXT', 'full', or null for Lua
  analysisKind: 'cbs-fragment' | 'lua-file'
  hostRange: Range  // LSP-style range in host document coordinates
  hostStartOffset: number  // byte offset (inclusive)
  hostEndOffset: number    // byte offset (exclusive)
  argumentRange: Range  // full argument range (may include whitespace)
  metadata?: {
    fragmentIndex?: number
    containingFunction?: string
    line?: number
  }
}

// UnifiedVariableNode - all occurrences of a single variable
interface UnifiedVariableNode {
  name: string
  readers: readonly UnifiedVariableOccurrence[]
  writers: readonly UnifiedVariableOccurrence[]
  occurrenceCount: number
  artifacts: readonly CustomExtensionArtifact[]  // artifact kinds containing this variable
  uris: readonly string[]  // URIs containing this variable
}

// UnifiedVariableGraphSnapshot - serialization-friendly public contract
interface UnifiedVariableGraphSnapshot {
  schema: 'cbs-lsp-agent-contract'
  schemaVersion: '1.0.0'
  rootPath: string
  variables: readonly UnifiedVariableNode[]
  totalVariables: number
  totalOccurrences: number
  variableIndex: Readonly<Record<string, UnifiedVariableNode>>
  occurrencesByUri: Readonly<Record<string, readonly UnifiedVariableOccurrenceId[]>>
  occurrencesByElementId: Readonly<Record<string, readonly UnifiedVariableOccurrenceId[]>>
  buildTimestamp: number
}
```

`tests/fixtures/fixture-corpus.ts`의 `snapshotLayer1Contracts()` helper는 이 두 snapshot을 fixture/golden-friendly JSON bundle로 묶어 Layer 1 public contract를 회귀 테스트에서 그대로 고정합니다.

`packages/cbs-lsp/src/auxiliary/agent-contracts.ts`의 `snapshotLayer1Contracts()`는 `report layer1` JSON에 아래 `contract` descriptor를 함께 넣습니다.

- `trust.agentsMayTrustSnapshotDirectly: true` — agent가 workspace-wide reasoning 입력으로 이 snapshot을 직접 사용해도 됨
- `stableFields.*` — `ElementRegistrySnapshot`, `UnifiedVariableGraphSnapshot`, occurrence/node/file/seed shape에서 field name과 의미가 breaking change 전까지 유지되는 public contract
- `deterministicOrdering.*` — files / fragments / variables / occurrences / index bucket ordering source-of-truth
- `stableFields.runtimeDerivedFields: ['graph.buildTimestamp']` — field name/meaning은 stable이지만 값 자체는 cache invalidation용 runtime metadata라 golden identity로 취급하지 않음

즉 Layer 1에서 agent가 신뢰해야 하는 source-of-truth는 단순히 `registry`/`graph` payload만이 아니라, 그 payload를 어떻게 읽어야 하는지까지 포함한 `schema` + `schemaVersion` + `contract` + `registry` + `graph` bundle 전체입니다.

**Layer 1 Query Surface:**

```typescript
class UnifiedVariableGraph {
  getSnapshot(): UnifiedVariableGraphSnapshot
  getVariable(name: string): UnifiedVariableNode | null
  getOccurrencesForVariable(name: string): readonly UnifiedVariableOccurrence[]
  getOccurrencesByUri(uri: string): readonly UnifiedVariableOccurrence[]  // returns actual occurrences, not just IDs
  getOccurrenceIdsByUri(uri: string): readonly UnifiedVariableOccurrenceId[]  // returns IDs for serialization
  findOccurrenceAt(uri: string, hostOffset: number): FindOccurrenceResult
  getAllVariableNames(): readonly string[]
  hasVariable(name: string): boolean
  getVariableCount(): number
  getOccurrenceCount(): number
}
```

**Layer 1 inclusion / exclusion matrix**

| artifact | Layer 1 처리 | occurrence source |
|------|------|------|
| `.risulorebook` | 포함 | `@@@ CONTENT` fragment CBS occurrence |
| `.risuregex` | 포함 | `@@@ IN`, `@@@ OUT` fragment CBS occurrence |
| `.risuprompt` | 포함 | `@@@ TEXT`, `@@@ INNER_FORMAT`, `@@@ DEFAULT_TEXT` fragment CBS occurrence |
| `.risuhtml` | 포함 | full-file CBS occurrence |
| `.risulua` | 포함 | Lua state API occurrence |
| `.risutoggle` | 제외 | 없음 |
| `.risuvar` | 제외 | 없음 |
| fragment 0개 CBS-bearing 파일 | file record만 유지 | occurrence 없음 |

**현재 boundary**

- Layer 1은 workspace graph snapshot과 query surface까지만 제공합니다.
- `buildUnifiedVariableGraphFromRegistry()`가 public graph build 경로입니다.
- core `buildUnifiedCBSGraph()`는 기존 batch analyze seed로 남아 있고, `buildDerivedFlowResult()`는 graph snapshot에 issue를 넣지 않고 core `analyzeVariableFlow()`를 on-demand로 위임하는 adjacent helper입니다.
- cross-file rename / richer hover summary / broader Layer 3 consumer 확장은 아직 future work이지만, definition / references는 현재 editor capability까지 local-first로 연결되어 있습니다.

**IncrementalRebuilder**

- 파일 변경 시 전체 재빌드가 아닌, changed URI만 다시 읽어 `WorkspaceScanFile`/registry/graph를 부분 갱신
- `ElementRegistry.upsertFile/removeFile`이 영향받은 file/element/graph-seed만 교체하고 snapshot summary를 다시 고정
- `UnifiedVariableGraph.replaceOccurrencesForUri/removeUri`가 변경 URI occurrence만 diff처럼 교체하고, Layer 3 서비스는 갱신된 graph를 기준으로 다시 계산됨

### 인덱싱 타임라인

TypeScript LSP 방식을 차용합니다:

```
1. Workspace Open
   ├── FileScanner: 파일 목록 수집 (즉시, <100ms)
   ├── 1차 인덱싱: CBS 변수 추출 + Lua stateVars 추출 (백그라운드)
   │   └── core.extractCBSVarOps() per file
   │   └── core.analyzeLuaSource() per .lua file
   └── UnifiedVariableGraph 구축 완료 → Layer 2/3 활성화

2. File Change (didChange / didSave)
   ├── 해당 파일만 재분석
   ├── VariableGraph diff → 변경된 변수만 갱신
   └── 영향받는 파일에 diagnostics refresh 트리거
```

---

## Layer 2: Language Providers

### CBS Provider

CBS 구문(`{{...}}`)이 포함된 파일에 대한 언어 기능을 제공합니다.

**공용 CBS 파서 (core에 배치)**

파서는 `packages/core/src/domain/cbs/parser/`에 공용 모듈로 구현됩니다. analyze pipeline, LSP, 향후 VS Code extension이 모두 동일한 파서를 공유합니다.

```
packages/core/src/domain/cbs/
├── parser/
│   ├── tokenizer.ts      ← CBS 토크나이저
│   ├── tokens.ts          ← 토큰 타입 정의
│   ├── parser.ts          ← 재귀 하강 파서, Range 정보 포함 AST 생성
│   ├── ast.ts             ← AST 노드 타입
│   └── visitor.ts         ← AST 순회 유틸
├── registry/
│   ├── builtins.ts        ← 107개 함수 + 별칭 ~175개 정적 레지스트리
│   └── documentation.ts   ← 함수 문서 생성
└── cbs.ts                 ← extractCBSVarOps (기존 regex 기반 → 파서 기반 교체)
```

CBS_LSP_PLAN.md의 Phase 1~3 설계를 그대로 따르되, 위치만 core로 변경합니다. 기존 `extractCBSVarOps`는 파서 완성 후 AST 기반으로 교체되어 analyze pipeline도 자동 개선됩니다.

**Canonical CBS Fragment 처리**

CBS LSP의 source of truth는 더 이상 JSON field extraction이 아닙니다. 현재 기준선은 `packages/core/src/domain/custom-extension/cbs-fragments.ts`가 정의하는 canonical `.risu*` artifact fragment mapping입니다.

CBS Provider는 파일 전체를 바로 tokenize/parse하지 않고, 먼저 artifact를 판별한 뒤 CBS-bearing fragment만 추출해 분석합니다:

- `.risulorebook` → `@@@ CONTENT`
- `.risuregex` → `@@@ IN`, `@@@ OUT`
- `.risuprompt` → `@@@ TEXT`, `@@@ INNER_FORMAT`, `@@@ DEFAULT_TEXT`
- `.risuhtml` → 파일 전체
- `.risulua` → 현재 first-cut에서는 파일 전체

이때 host document ↔ fragment range 매핑을 유지해서, diagnostics / hover / completion / semantic tokens가 원본 `.risu*` 문서 좌표계에서 동작합니다.

**제공 LSP 기능**

| 기능 | 동작 | 의존 |
|------|------|------|
| Completion | `{{` 후 함수명 제안, `{{getvar::` 후 문서/fragment-local 변수명 제안. `completionItem/resolve`로 detail/documentation를 지연 로드함 | core 파서 + fragment analysis |
| Hover | 함수 문서, when/operator 문맥, fragment-local 변수 정보 | core registry + fragment analysis |
| Diagnostics | CBS 구문 에러 + fragment-local analyzer 경고 | core 파서 + analyzer |
| Signature Help | `::` 입력 시 인수 힌트 | core registry |
| Semantic Tokens | 함수/변수/키워드/연산자 색상 구분 | core 파서 |
| Go-to-Definition | provider는 local-first로 현재 fragment를 해석한 뒤, `VariableFlowService`가 있으면 workspace writer URI를 병합한다. 서버 capability도 현재 활성화됨 | Layer 3 CrossRef |
| Find References | provider는 local-first reference 목록 뒤에 `VariableFlowService` readers/writers를 병합하며, 서버 capability도 현재 활성화되어 있다 | Layer 3 CrossRef |
| Rename | provider는 local symbol rename edit 뒤에 `VariableFlowService` occurrence를 dedupe해서 multi-file `WorkspaceEdit`를 만들고, shared `host-fragment-patch` contract로 host-range ownership / same-URI fragment window / malformed no-op을 검증한 뒤만 edit를 반환한다 | Layer 3 CrossRef |
| Formatting | document formatting은 routed CBS fragment를 canonical serializer로 다시 써서 macro spacing / shorthand close tag 같은 구조적 표기만 정리한다. pure block body는 pretty-print하지 않으며, malformed fragment / unsupported artifact / fragmentless host는 safe no-op으로 남는다 | core 파서 + fragment analysis + host-fragment-patch |
| Folding | `#when`, `#each` 블록 접기 | core 파서 |
| Document Symbols | provider는 routed CBS fragment의 top-level block/function header를 outline tree로 노출하고, multi-fragment 문서에서는 section container 아래에 child symbol을 붙인다 | core 파서 + fragment analysis |
| Document Highlight | provider는 현재 fragment 안에서 `getvar/setvar`, local `#func`/`call::name`, `arg::N`, `slot::alias` read/write occurrence를 즉시 강조한다 | core 파서 + fragment analysis + symbol table |
| Selection Range | provider는 현재 fragment 안에서 token span → macro call → parent block body → block whole 순서의 expand-selection chain을 계산하고, multi-fragment/non-CBS/malformed 문맥에서는 safe no-op으로 degrade한다 | core 파서 + fragment analysis + fragment locator |
| Code Actions | provider는 diagnostics metadata와 shared host patch validator를 재사용해 quick fix / guidance action을 반환하고, `codeAction/resolve`로 edit payload를 지연 로드함 | core 파서 + registry |

### Formatting contract

현재 `textDocument/formatting`은 세 가지 경계를 분리해서 이해해야 합니다.

- **canonical serializer (현재 구현)**: clean CBS fragment를 다시 파싱한 뒤 안정적인 canonical text shape로 재직렬화합니다. `{{ user }}` → `{{user}}`, `{{#if ready}}...{{/}}` → `{{#if::ready}}...{{/if}}` 같은 구조적 normalization이 여기에 속합니다.
- **pretty formatter (현재 미구현)**: block indentation, line wrapping, `tabSize` / `insertSpaces` 반영, on-type formatting 같은 editor polish는 아직 제공하지 않습니다. formatting request의 option은 protocol 호환용으로만 받고, 현재 출력 모양을 바꾸는 레이아웃 엔진으로 쓰지 않습니다.
- **safe no-op (현재 구현)**: malformed fragment, unsupported artifact, routed fragment 0개 문서, shared `host-fragment-patch` contract를 통과하지 못하는 host edit는 모두 `[]`로 degrade합니다. multi-fragment host에서는 canonical text가 실제로 달라진 fragment만 rewrite합니다.

특히 pure block(`{{#puredisplay}}...{{/puredisplay}}`)은 body text를 pretty-print하지 않습니다. 현재 formatter는 block marker를 canonicalize할 수는 있지만, pure body 내부의 공백/줄바꿈은 사용자 작성 그대로 유지합니다.

Document symbol의 agent-facing normalized envelope은 `normalizeDocumentSymbolsEnvelopeForSnapshot()`를 source-of-truth로 사용합니다. 이 helper는 top-level `schema` / `schemaVersion` marker, runtime availability snapshot, `document-symbol:outline-builder` provenance와 함께 아래 필드를 고정합니다.

- `symbolKind` - LSP numeric enum 대신 `function` / `array` / `object` / `string` / `namespace` 문자열로 정규화한 kind
- `fragmentContainer` - multi-fragment section container 여부
- `selectionRange` / `range` - host document 기준 outline 좌표
- `section` - container일 때 `CONTENT` / `IN` / `OUT` 같은 section grouping key, 일반 symbol이면 `null`
- `children` - 같은 규칙을 재귀적으로 따르는 deterministic child tree

---

### Lua Provider

LuaLS(sumneko lua-language-server)를 subprocess로 실행하고, RisuAI 전용 기능을 overlay합니다.

**현재 의존 전략**

- 초기 phase에서는 **사용자가 LuaLS binary를 설치**하는 방식을 전제로 합니다.
- 서버는 먼저 **설정값 override 경로** 또는 **PATH 상의 LuaLS executable**을 탐색합니다.
- LuaLS를 찾지 못하면 서버가 죽는 대신, Lua provider capability를 `unavailable`로 남기고 CBS 기능만 계속 동작시킵니다.
- 즉 "LuaLS가 있으면 Lua 기능 활성화 / 없으면 graceful fallback"이 현재 운영 원칙입니다.

**아키텍처**

```
┌──────────────────────────────┐
│        Lua Provider          │
│                              │
│  ┌────────────────────────┐  │
│  │  RisuAI Addon Layer    │  │
│  │  - setState/getState   │  │
│  │    completion/hover     │  │
│  │  - getLoreBooks 인수 힌트│  │
│  │  - 변수 그래프 연동      │  │
│  └───────────┬────────────┘  │
│              │ merges with   │
│  ┌───────────▼────────────┐  │
│  │  LuaLS (subprocess)    │  │
│  │  - 기본 Lua 파싱        │  │
│  │  - 타입 추론            │  │
│  │  - 일반 completion      │  │
│  │  - diagnostics          │  │
│  └────────────────────────┘  │
└──────────────────────────────┘
```

**LuaLS 연동 방식:**

- LSP 서버가 LuaLS를 child process로 spawn
- 클라이언트 ↔ 우리 서버 ↔ LuaLS 프록시 구조
- LuaLS의 응답에 RisuAI 전용 항목을 merge하여 클라이언트에 전달

**설치/실행 UX 원칙:**

- 현재 단계에서는 LuaLS를 우리 쪽이 자동 다운로드/관리하지 않고, **사용자 설치를 전제**합니다.
- binary 탐색 규칙은 `설정값으로 지정된 경로 → PATH 탐색` 순서를 기본으로 둡니다.
- LuaLS 미설치 상태는 오류가 아니라 **지원되지 않는 선택 기능(unavailable)** 으로 취급합니다.
- README / trace / availability contract / editor messaging에서 같은 용어를 유지해 "왜 Lua 기능이 비활성인지"를 바로 이해할 수 있게 합니다.
- 현재 구현 범위에서는 `src/controllers/LuaLsCompanionController.ts`가 process manager + document router + request proxy를 façade 뒤에 묶고, `src/controllers/WorkspaceRefreshController.ts`와 `src/helpers/server-helper.ts`가 workspace/standalone mirror sync와 `.risulua` hover/completion routing을 이 controller seam으로 소비합니다.
- `src/providers/lua/lualsProcess.ts`는 executable 탐색, stdio spawn, `initialize`/`initialized`, shutdown/exit, unexpected crash 상태 전환, bounded auto-restart, lightweight health check, queued `textDocument/didOpen`/`didChange`/`didClose` mirror, 그리고 LuaLS `textDocument/publishDiagnostics` notification을 source `.risulua` URI로 되돌리는 publish seam을 담당합니다. crash 뒤에는 backoff budget 안에서 sidecar를 자동 재기동하고, budget이 소진되면 runtime/operator contract가 수동 restart 또는 reinitialize를 요구하는 degraded 상태를 유지하며, 기존 Lua diagnostics는 host에서 비워 stale 상태를 남기지 않습니다.
- `src/providers/lua/lualsProxy.ts`는 mirrored `.risulua` URI를 LuaLS `textDocument/hover`와 `textDocument/completion` 요청으로 프록시합니다. LuaLS가 unavailable/starting/crashed 상태면 hover는 `null`, completion은 빈 후보를 반환하고 CBS capability surface는 그대로 유지합니다.
- `src/providers/lua/typeStubs.ts`는 `RISUAI_API`를 source-of-truth gate로 읽어 minimal `risu-runtime.lua`를 생성하고, `LuaLsCompanionController`는 이 generated stub file path를 LuaLS `workspace.library`에 start/restart/workspace refresh마다 다시 주입하는 동시에 same stub를 shadow workspace mirrored document로도 유지합니다.
- hover seam은 `normalizeLuaHoverForSnapshot()` / `normalizeLuaHoverEnvelopeForSnapshot()` helper로 deterministic normalized snapshot + top-level `schema` / `schemaVersion` + availability/provenance envelope를 제공합니다. agent/golden 테스트는 여기서 `luaHover`, `lua-completion`, `lua-diagnostics`가 같은 active/local-only product surface라는 점과 companion runtime(`unavailable`/`ready`) 경계를 같은 용어로 읽습니다.

**테스트 레이어 원칙:**

- **LuaLS 미설치 기본 계약 테스트**: fake process/mock transport로 executable 탐색, unavailable fallback, queued document mirror flush, shutdown/crash handling, virtual document routing wiring을 항상 검증합니다.
- **LuaLS 설치 후 integration 테스트**: 실제 LuaLS binary가 있는 환경에서는 diagnostics/hover roundtrip뿐 아니라 generated stub가 `getState(id, name)` / `getLoreBooks(id, search)` typed hover·completion으로 이어지는지까지 검증하고, 후속 cross-language synthesis는 같은 레이어를 점진적으로 넓힙니다.
- 이 분리는 CI와 로컬 개발 환경에서 외부 binary 의존성 때문에 기본 테스트가 흔들리지 않게 하려는 목적입니다.
- 현재 opt-in smoke test는 `CBS_LSP_RUN_LUALS_INTEGRATION=true`와 선택적 `CBS_LSP_LUALS_PATH=/absolute/path/to/lua-language-server` 조합으로 `npm run test:luals-integration`에서 실행합니다.

**RisuAI Addon Layer 기능**

| 기능 | 동작 |
|------|------|
| Completion 보강 | `setState("` 입력 시 VariableGraph의 변수명 제안 |
| Completion 보강 | `getLoreBooks("` 입력 시 lorebook 엔트리명 제안 |
| Hover 보강 | `getState("hp")` 위에서 해당 변수의 전체 reader/writer 목록 표시 |
| Diagnostics 추가 | `setState`로 쓰지만 아무도 읽지 않는 변수 경고 |
| Go-to-Definition 확장 | `getState("hp")` → lorebook의 `{{setvar::hp::...}}` 위치로 cross-file 점프 |
| Signature Help | `setState`, `getState`, `getLoreBooks` 등 RisuAI API 인수 힌트 |
| Type Stubs 주입 | RisuAI Lua API 전체에 대한 타입 정의를 LuaLS에 제공 |

**Type Stubs 예시 (LuaLS에 주입)**

```lua
---@meta

---@type fun(id: string, name: string, value: RisuStateValue)
setState = function(id, name, value) end

---@type fun(id: string, name: string): RisuStateValue
getState = function(id, name) end

---@type fun(id: string, search: string): RisuLoreBook[]
getLoreBooks = function(id, search) end
```

---

## Layer 3: Cross-Element Services

이 레이어가 통합 LSP의 핵심 차별점입니다. Layer 1의 그래프를 조회하여 파일/요소 경계를 넘나드는 기능을 제공합니다.

### Layer 3 Query Envelope Contract (Public)

`VariableFlowService`와 `ActivationChainService`의 개별 query result는 `snapshotLayer3Queries()`를 통해 하나의 stable public envelope로 승격됩니다. 이 envelope는 CLI `query *`, agent helper, future MCP adapter가 같은 shape를 그대로 재사용하는 것을 전제로 하며, source-of-truth는 `packages/cbs-lsp/src/auxiliary/agent-contracts.ts`의 `LAYER3_QUERY_ENVELOPE_CONTRACT`입니다.

```typescript
interface NormalizedLayer3QuerySnapshot {
  schema: 'cbs-lsp-agent-contract'
  schemaVersion: '1.0.0'
  contract: Layer3QueryEnvelopeContractDescriptor
  activationChain: ActivationChainQueryResult | null
  variableFlow: VariableFlowQueryResult | null
}
```

`contract` descriptor는 세 가지를 public promise로 고정합니다.

- **Stable fields**: envelope는 항상 `contract`, `activationChain`, `variableFlow`를 포함합니다. service result 내부도 필드 이름을 생략하지 않습니다.
- **Nullability / empty-array contract**: top-level `activationChain` / `variableFlow`는 query kind와 miss에 따라 `null`이 될 수 있습니다. `VariableFlowQueryResult`에서는 `flowEntry`, `defaultValue`, `matchedOccurrence`가 nullable이고, `ActivationChainEntryMatch`에서는 `uri`, `relativePath`가 nullable입니다. 대신 `occurrences`, `readers`, `writers`, `issues`, `incoming`, `outgoing`, `possible*`, `partial*`, `blocked*`, `cycle.steps`는 결과가 없어도 `[]`로 유지됩니다.
- **Deterministic ordering**: variable `occurrences`와 issue-matched occurrence는 `occurrenceId`, variable `readers`/`writers`는 `uri -> hostStartOffset -> hostEndOffset -> occurrenceId`, activation match 목록은 `status(possible -> partial -> blocked) -> entry.id -> relativePath`, cycle steps는 BFS traversal order를 따릅니다.

즉 consumer는 더 이상 "필드가 있을 수도 없을 수도 있다"는 식의 추측을 하지 않아도 되고, `null`과 `[]`의 의미를 구분하면서 query 결과를 machine-readable contract로 바로 소비할 수 있습니다.

### VariableFlowService (최우선 — Priority A)

CBS 변수와 Lua state를 통합하여 파일 간 변수 흐름을 추적합니다.

현재 first-cut은 `queryVariable(name)` / `queryAt(uri, hostOffset)` 형태의 읽기 전용 service API를 제공하며, provider가 cross-file writer/reader/issues를 같은 contract로 조회할 수 있게 합니다. editor capability wiring은 아직 후속 단계입니다.

```typescript
interface VariableFlowQueryResult {
  schema: 'cbs-lsp-agent-contract'
  schemaVersion: '1.0.0'
  variableName: string
  node: UnifiedVariableNode
  occurrences: readonly UnifiedVariableOccurrence[]
  readers: readonly UnifiedVariableOccurrence[]
  writers: readonly UnifiedVariableOccurrence[]
  flowEntry: VarFlowEntry | null
  issues: readonly VariableFlowIssueMatch[]
  defaultValue: string | null
  matchedOccurrence: UnifiedVariableOccurrence | null
}
```

```
[lorebooks/🎯_히로인.risulorebook]          [regex/변수처리.risuregex]
{{setvar::mood::happy}}  ───────────────>  {{getvar::mood}}
         │                                           │
         │              [lua/<charxName>.risulua]    │
         └──────────>  getState("mood")  <──────────┘
                        setState("mood", "sad")
                               │
                               ▼
                    [lorebooks/⚡_전투.risulorebook]
                    {{getvar::mood}}
```

| 기능 | 동작 | LSP Method |
|------|------|------------|
| Cross-file Go-to-Definition | `{{getvar::mood}}` → writer 위치로 점프. writer가 여러 개면 목록 표시 | `textDocument/definition` |
| Cross-file Find References | 변수 `mood`의 모든 read/write 위치를 파일 경계 없이 수집 | `textDocument/references` |
| Cross-file Rename | 변수명 변경 시 lorebook CBS, regex CBS, Lua setState/getState 모두 일괄 수정 | `textDocument/rename` |
| Variable Hover | 변수 위에 마우스 올리면 전체 흐름 요약 표시 | `textDocument/hover` |

**Hover 출력 예시:**

```markdown
**Variable: mood**

Writers (2):
  📖 🎯_히로인.risulorebook — {{setvar::mood::happy}}
  🔧 <charxName>.risulua — setState("mood", "sad")

Readers (3):
  📖 ⚡_전투.risulorebook — {{getvar::mood}}
  🔤 변수처리.risuregex — {{getvar::mood}}
  🔧 <charxName>.risulua — getState("mood")
```

### LuaCBSBridgeService (Priority C)

Lua의 `setState`/`getState`와 CBS의 `setvar`/`getvar`가 동일한 변수 네임스페이스를 공유한다는 것을 인식합니다. VariableFlowService의 하위 서비스로, Lua ↔ CBS 경계를 특별히 처리합니다:

| 기능 | 동작 |
|------|------|
| Lua → Lorebook 점프 | `getLoreBooks("히로인")` → lorebook 엔트리 파일로 점프 |
| Lorebook → Lua 점프 | lorebook content에서 Lua 함수명 언급 시 → 해당 함수 정의로 점프 |
| API 인수 검증 | `getLoreBooks("없는이름")` → 매칭되는 lorebook 없으면 warning |
| 양방향 변수 진단 | Lua에서 `setState("x", ...)` 했는데 CBS에서만 읽히는 경우, 흐름 방향 힌트 제공 |

### ActivationChainService (Priority B)

Lorebook 간 재귀 활성화 관계를 진단합니다. 현재 first-cut 구현은 core의 `analyzeLorebookActivationChains`를 workspace lorebook file text에 실시간 적용해, lorebook별 incoming/outgoing edge, partial match, cycle summary, `queryByUri` / `queryAt` query surface를 제공합니다:

```typescript
interface ActivationChainQueryResult {
  schema: 'cbs-lsp-agent-contract'
  schemaVersion: '1.0.0'
  entry: LorebookActivationEntry
  file: ElementRegistryFileRecord
  incoming: readonly ActivationChainEntryMatch[]
  outgoing: readonly ActivationChainEntryMatch[]
  possibleIncoming: readonly ActivationChainEntryMatch[]
  possibleOutgoing: readonly ActivationChainEntryMatch[]
  partialIncoming: readonly ActivationChainEntryMatch[]
  partialOutgoing: readonly ActivationChainEntryMatch[]
  blockedIncoming: readonly ActivationChainEntryMatch[]
  blockedOutgoing: readonly ActivationChainEntryMatch[]
  cycle: ActivationChainCycleSummary
}
```

`tests/fixtures/fixture-corpus.ts`의 `snapshotLayer3Queries()` helper와 standalone CLI `query` adapter는 위 Layer 3 contract를 그대로 재사용합니다. 서비스 단위 테스트, fixture helper 테스트, standalone CLI/E2E 테스트가 모두 같은 `contract` descriptor와 nullability/ordering wording을 검증하므로, editor/LSP surface 밖에서도 동일한 envelope를 신뢰할 수 있습니다.

| 기능 | 동작 |
|------|------|
| Activation Hint | lorebook content에 다른 lorebook의 키워드가 포함되면 인라인 힌트: `"이 텍스트는 '전투' 엔트리를 활성화합니다"` |
| Chain Warning | 순환 활성화 감지 시 warning: `"A → B → A 순환 활성화 체인"` |
| Partial Match Info | 2차 키워드 중 일부만 충족 시 info: `"'전투' 활성화에 필요한 2차 키워드 'HP' 누락"` |
| CodeLens | 각 lorebook 엔트리 위에 `"N개 엔트리에 의해 활성화됨 | M개 엔트리를 활성화"` 표시 |

현재 서비스 contract는 `src/services/activation-chain-service.ts`에 있고, `src/server.ts`가 workspace root별 state에 붙여 unsaved lorebook text overlay를 반영한 registry snapshot과 함께 재구성합니다. 이제 lorebook editor에서는 ActivationChainService를 재사용하는 첫 Layer 2 consumer로 CodeLens가 활성화되어, `possible` incoming/outgoing count를 메인 summary로 보여주고 `partial`/`blocked`/cycle 상태는 보조 CodeLens로 분리해 표시합니다. 또한 lorebook add/change/delete가 document sync 밖에서 일어나더라도 watched-file 이벤트를 같은 workspace rebuild 경로로 흘려보낸 뒤 `workspace/codeLens/refresh`를 요청해 현재 보이는 CodeLens가 activation graph를 따라오게 했습니다. diagnostics는 여전히 push 모델이므로 같은 경로에서 영향받은 URI에 `textDocument/publishDiagnostics`를 다시 보냅니다. CodeLens 클릭 contract는 client-owned shim이 아니라 server-owned no-op `executeCommandProvider`로 고정되어, command payload와 initialize capability advertisement가 서로 어긋나지 않습니다.

`src/features/codelens.ts`는 `normalizeCodeLensesEnvelopeForSnapshot()` helper도 함께 제공해 CodeLens 결과를 아래처럼 deterministic snapshot으로 고정합니다. 이 contract는 fixture helper, feature test, integration test가 같은 shape를 공유합니다:

```typescript
interface NormalizedCodeLensesEnvelopeSnapshot {
  schema: 'cbs-lsp-agent-contract'
  schemaVersion: '1.0.0'
  availability: NormalizedRuntimeAvailabilitySnapshot
  provenance: {
    reason: 'contextual-inference'
    source: 'codelens:activation-summary'
    detail: string
  }
  codeLenses: Array<{
    title: string | null
    lensKind: 'summary' | 'detail'
    lensState: 'active'
    command: {
      command: 'cbs-lsp.codelens.activationSummary' | null
      kind: 'summary' | 'detail' | null
      mode: 'no-op'
      uri: string | null
    }
    counts: {
      incoming: { possible: number; partial: number; blocked: number }
      outgoing: { possible: number; partial: number; blocked: number }
    }
    cycle: { hasCycles: boolean; count: number }
    semantics: {
      summaryStatuses: readonly ['possible']
      detailStatuses: readonly ['partial', 'blocked']
      refreshTriggers: readonly ['document-sync', 'watched-files']
    }
  }>
}
```

즉 agent는 더 이상 한국어 title 문자열을 파싱하지 않아도 되고, `command.mode === 'no-op'`, `lensState === 'active'`, count policy, cycle count, refresh-dependent availability를 같은 snapshot/envelope에서 바로 읽을 수 있습니다. 같은 `command.command` 값은 initialize capability의 `executeCommandProvider.commands`에도 그대로 광고되며, 서버는 클릭 요청을 no-op으로 소유합니다.

### 서비스 간 라우팅

```
Layer 2 Provider가 LSP 요청 수신
         │
         ├── 단일 파일 내 기능? → Provider 자체 처리
         │
         └── cross-file 기능? → Layer 3 서비스 호출
                │
                ├── 변수 관련 → VariableFlowService.resolve(varName, position)
                │                    └── Lua 변수? → LuaCBSBridgeService 위임
                │
                └── 활성화 관련 → ActivationChainService.queryEntry(entryId)
```

**진단 갱신 흐름 예시:**

lorebook A에서 `{{setvar::hp::100}}`을 삭제하면:

1. Layer 1이 변수 `hp`의 writer에서 A를 제거
2. VariableFlowService가 `hp`를 읽는 모든 파일을 찾음
3. 해당 파일들에 `"변수 hp에 대한 writer가 없습니다"` warning push

현재 first-cut 구현은 `src/server.ts`가 workspace root별 scan result + registry + graph + `VariableFlowService` snapshot을 재구성하고, 변경 전/후 affected URI 집합을 계산해 관련 파일에도 `sendDiagnostics`를 다시 보냅니다. 이때 `src/diagnostics-router.ts`가 workspace variable-flow issue를 host diagnostics로 매핑하고, local-only `CBS101` / `CBS102`는 workspace writer/reader가 있으면 억제해서 cross-file stale warning이 남지 않게 정렬합니다.

---

## 기능 우선순위

| 순위 | 기능 | Layer | 설명 |
|------|------|-------|------|
| **최우선 A** | Cross-file 변수 흐름 추적 | Layer 3 | go-to-definition, find-references, rename이 파일 경계를 넘어 동작 |
| **최우선 C** | Lua ↔ CBS 변수 연동 | Layer 3 | `setState`/`getState`와 `setvar`/`getvar`가 같은 변수임을 인식 |
| **최우선 B** | Lorebook 활성화 체인 진단 | Layer 3 | 재귀 활성화, 순환 감지, partial match 경고 |
| 차순위 D | 데드코드/미사용 변수 진단 | Layer 3 | analyze pipeline과 기능 중복 — LSP에서는 실시간 경고로 차별화 |
| 차순위 E | 관계 네트워크 시각화 | Layer 3 | VS Code webview로 force-graph 표시 (analyze pipeline 연계) |

---

## 구현 로드맵

### Phase 0: 기반 정비 ✅ 완료

core에 공용 CBS 파서 디렉토리를 배치하고, cbs-lsp가 core를 의존하도록 설정합니다.

| 작업 | 상세 | 상태 |
|------|------|------|
| core에 CBS 파서 디렉토리 생성 | 기존 cbs-lsp scaffold의 lexer/parser/ast/visitor/registry를 core로 이동 | ✅ 완료 |
| cbs-lsp → core 의존성 추가 | `package.json`에 workspace dependency | ✅ 완료 |
| 기존 `extractCBSVarOps` 유지 | 파서 완성 전까지 regex 기반 추출 병행, 이후 교체 | ✅ 완료 |

### Phase 1: CBS 파서 구현 (core) 🚧 진행 중

CBS_LSP_PLAN.md Phase 1~3의 내용을 core에서 구현합니다.

| 작업 | 산출물 | 상태 |
|------|--------|------|
| Tokenizer | `{{`, `}}`, `::`, 함수명, 인수, 블록, 주석, 수식 토큰화 | ✅ 구현 |
| Parser | 재귀 하강 파서 → Range 정보 포함 AST | ✅ 구현 |
| Builtin Registry | 107개 함수 + 별칭 175개 정적 레지스트리 | ✅ 구현 |
| `extractCBSVarOps` 교체 | AST 기반 변수 추출로 전환, analyze pipeline 자동 개선 | ⏳ 대기 |

**완료 기준:** 기존 analyze pipeline의 CBS 관련 테스트가 새 파서로도 통과

### Phase 2: Workspace Indexer (Layer 1) 🚧 부분 완료

| 작업 | 산출물 | 상태 |
|------|--------|------|
| FileScanner | 디렉토리 재귀 탐색, 파일 타입 판별, file별 `fragmentMap`/`hasCbsFragments` scan contract | ✅ first-cut 완료 |
| ElementRegistry | FileScanner 결과를 URI/artifact/graph-seed 중심 read model로 정규화하고 lorebook/regex/lua/non-CBS query contract 제공 | ✅ first-cut 완료 |
| UnifiedVariableGraph | occurrence-first Layer 1 graph snapshot, host-document range ownership, lorebook/regex/prompt/html/lua inclusion, toggle/variable/zero-fragment exclusion | ✅ first-cut 완료 |
| IncrementalRebuilder | dirty tracking, 파일 단위 재분석, 그래프 부분 갱신 | ✅ 완료 |

**현재 완료 기준:** workspace open 시 `UnifiedVariableGraph.fromRegistry()`로 workspace graph snapshot을 구축하고, 이후 open/change/close/watched-file create/change/delete는 `IncrementalRebuilder`가 changed URI만 다시 읽어 registry/graph를 부분 갱신한다. host-document coordinates / deterministic ids / artifact inclusion-exclusion / incremental refresh contract를 테스트로 고정했다.

**아직 미완료:** richer graph diff telemetry, broader Layer 3 consumer expansion, Lua provider wiring

### Phase 3: CBS Provider (Layer 2-A) 🚧 부분 완료

| 작업 | 산출물 | 상태 |
|------|--------|------|
| Canonical Fragment Adapter | `.risu*` artifact에서 CBS fragment 추출, host↔fragment range 변환 | ✅ first-cut 완료 |
| 단일 파일 기능 | diagnostics, completion, hover, signature, semantic tokens, folding, document symbols | ✅ fragment-local baseline 완료 |
| Workspace symbol 기능 | variables / CBS local funcs / lorebook entries / prompt sections를 `workspace/symbol`로 노출 | ✅ prefix/fuzzy query + deterministic ordering + first-workspace-folder degraded policy 고정 |
| Editor action 기능 | code actions | ✅ `textDocument/codeAction` capability, diagnostics-driven quick fix, guidance action, host patch validation wiring, normalized snapshot helper 완료 |
| Layer 3 연동 | cross-file 기능은 서비스 호출로 위임 | 🚧 VariableFlowService query surface 완료 |

**완료 기준:** canonical `.risu*` artifact에서 fragment-aware completion, diagnostics, hover, rename, code action이 안정적으로 동작

### Phase 4: Cross-Element Services (Layer 3) 🚧 부분 완료

| 작업 | 산출물 | 우선순위 | 상태 |
|------|--------|----------|------|
| VariableFlowService | cross-file variable query service (readers/writers/issues/position lookup) | A (최우선) | ✅ first-cut 완료 |
| LuaCBSBridgeService | Lua ↔ CBS 변수 통합, getLoreBooks 연동 | C | ⏳ 대기 |
| ActivationChainService | 활성화 체인 진단, partial match / cycle query surface + lorebook CodeLens consumer | B | ✅ CodeLens wiring 완료 |

**완료 기준:** lorebook에서 `{{getvar::x}}` → local definition + workspace writer로 `textDocument/definition`이 동작하고, `textDocument/references`도 local-first + workspace reader/writer merge로 동작하며, `textDocument/prepareRename` / `textDocument/rename`도 같은 contract로 host-range와 workspace occurrence edit를 제공하는 상태

### Phase 5: Lua Provider (Layer 2-B) ✅ read-only MVP 완료

| 작업 | 산출물 | 상태 |
|------|--------|------|
| LuaLS sidecar + document/session foundation | 사용자 설치 LuaLS 탐색, subprocess spawn, initialize/shutdown handshake, crash/health tracking, unavailable fallback, `.risulua`→virtual Lua document mirror, opt-in real-binary smoke test | ✅ 5.3.1 완료 |
| LuaLS 프록시 | `.risulua` hover/completion을 LuaLS request로 프록시하고 diagnostics는 host publish loop로 승격 | ✅ real-binary hover/completion/diagnostics smoke 완료 |
| Type Stubs | `setState`, `getState`, `getLoreBooks` minimal generated `risu-runtime.lua` + workspace.library injection + shadow-workspace mirrored stub sync + real LuaLS hover/completion smoke | ✅ stub quality MVP 완료 |
| RisuAI Addon | state key completion overlay, read-only cross-language hover summary | ✅ read-only bridge MVP 완료; API 인수 검증은 후속 |
| Response Merger | LuaLS 결과 + RisuAI overlay를 가능한 범위에서 additive merge | ✅ hover/completion merger MVP 완료; richer provenance/resolve는 후속 |

**운영 원칙:** LuaLS는 우선 사용자 설치를 전제로 연결하고, 미설치 상태에서는 availability/trace/README가 같은 용어로 `unavailable`을 보여줘야 한다. 기본 테스트는 LuaLS 없이도 항상 돌아야 하고, 실제 LuaLS 왕복 검증은 opt-in integration test로 분리한다.

**완료 기준:** `.risulua` 파일에서 real LuaLS diagnostics/hover/completion roundtrip이 opt-in product matrix로 검증되고, LuaLS 미설치 환경에서도 서버가 깨지지 않은 채 Lua provider가 `unavailable` 상태로 정직하게 남아 있어야 함. Cross-language rename/workspace edit/code action은 아직 명시적으로 지원하지 않습니다.

### Phase 6: LSP Server 통합 + 테스트 ⏳ 대기

| 작업 | 산출물 | 상태 |
|------|--------|------|
| Server 라우팅 | 파일 타입별 적절한 provider로 요청 분배 | ✅ T15 완료 (기본 라우팅) |
| E2E 테스트 | 실제 추출 디렉토리 기반 통합 테스트 | ⏳ 대기 |
| 성능 최적화 | 대형 캐릭터 카드 (100+ lorebook 엔트리) 벤치마크 | ⏳ 대기 |

### 의존 관계 및 병렬화

```
Phase 0 ─→ Phase 1 (CBS 파서)
              │
              ├─→ Phase 2 (Indexer) ─→ Phase 4 (Cross-Element)
              │                              │
              └─→ Phase 3 (CBS Provider) ────┤
                                             │
                  Phase 5 (Lua Provider) ────┘
                                             │
                                             ▼
                                      Phase 6 (통합)
```

- Phase 2와 3은 Phase 1 완료 후 **병렬 진행 가능**
- Phase 5는 Phase 2만 있으면 시작 가능 (LuaLS 연동은 CBS 파서 불필요)
- Phase 4는 Phase 2 + 3 모두 필요 (indexer + provider 양쪽 활용)

---

## 패키지 구조

### core 추가분

```
packages/core/src/domain/cbs/
├── parser/
│   ├── tokenizer.ts          ← CBS 토크나이저
│   ├── tokens.ts             ← 토큰 타입 정의
│   ├── parser.ts             ← 재귀 하강 파서
│   ├── ast.ts                ← AST 노드 타입
│   └── visitor.ts            ← AST 순회 유틸
├── registry/
│   ├── builtins.ts           ← 107개 함수 레지스트리
│   └── documentation.ts      ← 함수 문서 생성
└── cbs.ts                    ← extractCBSVarOps (기존 → 파서 기반 교체)
```

### cbs-lsp (목표 구조 — 현재 baseline 위에서 점진적으로 이동)

```
packages/cbs-lsp/
├── src/
│   ├── server.ts                      ← LSP 서버 진입점, 요청 라우팅
│   │
│   ├── indexer/                       ← Layer 1: Workspace Indexer
│   │   ├── fileScanner.ts
│   │   ├── elementRegistry.ts
│   │   ├── variableGraph.ts
│   │   └── incrementalRebuilder.ts
│   │
│   ├── providers/                     ← Layer 2: Language Providers (목표 구조)
│   │   ├── cbs/
│   │   │   ├── cbsProvider.ts
│   │   │   ├── fragmentAdapter.ts
│   │   │   ├── completion.ts
│   │   │   ├── hover.ts
│   │   │   ├── diagnostics.ts
│   │   │   ├── signatureHelp.ts
│   │   │   ├── semanticTokens.ts
│   │   │   ├── folding.ts
│   │   │   ├── codeActions.ts
│   │   │   └── formatting.ts
│   │   └── lua/
│   │       ├── luaProvider.ts
│   │       ├── lualsProcess.ts
│   │       ├── risuaiAddon.ts
│   │       ├── typeStubs.ts
│   │       └── responseMerger.ts
│   │
│   ├── services/                      ← Layer 3: Cross-Element Services
│   │   ├── variableFlowService.ts
│   │   ├── luaCbsBridgeService.ts
│   │   └── activationChainService.ts
│   │
│   └── utils/
│       └── position.ts               ← 기존 유지
│
├── __tests__/
│   ├── indexer/
│   ├── providers/
│   │   ├── cbs/
│   │   └── lua/
│   ├── services/
│   └── e2e/                          ← 추출 디렉토리 기반 통합 테스트
│       └── fixtures/                 ← 테스트용 추출 디렉토리
│
├── package.json
├── tsconfig.json
└── README.md
```

### server.ts 라우팅 (개념 스케치)

```typescript
// 파일 URI → provider 매핑
function routeRequest(uri: string) {
  if (isRisuLua(uri))           return luaProvider
  if (isCbsBearingArtifact(uri)) return cbsProvider
  return null  // 지원하지 않는 파일
}

// 현재 baseline에서는 fragment-local capability만 서버에 노출한다.
// cross-file 기능은 후속 phase에서 provider가 Layer 3 서비스를 호출하도록 확장한다.
// provider 내부:
//   definition 요청 → 단일 파일 내 결과 + variableFlowService.findDefinitions(varName)
//   references 요청 → 단일 파일 내 결과 + variableFlowService.findReferences(varName)
```

---

## 도메인 타입 참조

LSP가 core에서 가져다 쓰는 핵심 도메인 타입입니다.

| 타입 | 위치 | 역할 |
|------|------|------|
| `ElementCBSData` | `domain/analyze/correlation.ts` | lorebook/regex의 CBS 변수 읽기/쓰기 집합 |
| `LorebookRegexCorrelation` | `domain/analyze/correlation.ts` | lorebook-regex 간 CBS 변수 공유 관계 (방향 포함) |
| `LorebookActivationChainResult` | `domain/lorebook/activation-chain.ts` | lorebook 간 재귀 활성화 체인 |
| `LorebookStructureResult` | `domain/lorebook/structure.ts` | lorebook 폴더 구조, 활성화 모드별 분류, 키워드 중첩 |
| `LuaAnalysisArtifact` | `domain/analyze/lua-core.ts` | Lua 분석 결과 (함수, 상태 변수, 호출 그래프, lorebook 상관관계) |
| `TextMentionEdge` | `domain/analyze/text-mention.ts` | lorebook 텍스트 내 변수/함수/lorebook 이름 언급 탐지 |
| `RegexScriptInfo` | `domain/analyze/dead-code.ts` | regex 스크립트 이름, in/out 패턴 메타 |

---

## 관련 문서

| 문서 | 설명 |
|------|------|
| `CBS_LSP_PLAN.md` | CBS 구문 파서 상세 설계 (Phase 1~3 토크나이저/파서/레지스트리 사양) |
| `CBS_LSP_TESTING.md` | 테스트 전략 (Vitest 단위 + Extension Host 통합) |
| `packages/core/src/cli/analyze/README.md` | analyze pipeline 구조 및 아티팩트 관계 모델 |
