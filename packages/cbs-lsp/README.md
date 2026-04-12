# CBS Language Server — RisuAI 통합 아티팩트 LSP

> **패키지:** `packages/cbs-lsp/`
> **의존:** `packages/core/` (CBS 파서, 분석 함수, 도메인 타입)
> **대상 환경:** 추출된 `.charx`/`.risum` 디렉토리를 VS Code workspace로 편집

---

## 비전

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
│  │  FileScanner → UnifiedVariableGraph          │    │
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
- **Layer 2 (Language Providers)**: 파일 타입별 LSP 기능 제공. CBS Provider는 core의 공용 파서 사용, Lua Provider는 LuaLS를 subprocess로 띄우고 RisuAI 전용 기능을 overlay
- **Layer 3 (Cross-Element Services)**: Layer 1의 그래프를 조회하여 cross-file go-to-definition, find-references, 활성화 체인 진단 등 제공. Layer 2의 provider들이 이 서비스를 호출

**데이터 흐름:**

```
파일 변경 → Layer 1 재인덱싱 → Layer 2 해당 파일 재분석
                                    → Layer 3 cross-element 진단 갱신
```

---

## Layer 1: Workspace Indexer

### 대상 디렉토리 구조

```
Workspace Root (추출된 .charx/.risum 디렉토리)
├── lorebooks/
│   ├── 📖_기본설정/
│   │   ├── 🎯_히로인.json      ← lorebook entry (CBS in content)
│   │   └── 🌍_세계관.json
│   └── 📖_이벤트/
│       └── ⚡_전투.json
├── regex/
│   ├── 감정표현.json            ← regex script (CBS in in/out)
│   └── 변수처리.json
├── lua/
│   ├── main.lua                ← Lua source (setState/getState)
│   └── utils.lua
└── charx.json                  ← 메타데이터 (variables 기본값 등)
```

### 구성요소

**FileScanner**

- workspace open 시 디렉토리 구조를 재귀 탐색
- 파일 타입 판별: lorebook JSON, regex JSON, Lua, charx.json
- `workspace/didChangeWatchedFiles` 이벤트로 변경 감지

**ElementRegistry**

스캔된 모든 요소를 등록/조회하는 중앙 저장소:

```typescript
interface ElementRegistry {
  getLorebookEntries(): LorebookEntry[]
  getRegexScripts(): RegexScript[]
  getLuaArtifacts(): LuaAnalysisArtifact[]
  getDefaultVariables(): Record<string, string>

  getElementByUri(uri: string): Element | null

  updateFile(uri: string, content: string): void
  removeFile(uri: string): void
}
```

**UnifiedVariableGraph**

core의 `buildUnifiedCBSGraph` + Lua `stateReads/stateWrites`를 합친 통합 변수 그래프. 각 변수에 대해 어떤 파일의 어떤 요소가 read/write 하는지, 정확한 위치(Range)까지 보유:

```typescript
interface VariableNode {
  name: string
  readers: Array<{
    uri: string
    elementName: string
    range: Range
    elementType: 'lorebook' | 'regex' | 'lua'
  }>
  writers: Array<{
    uri: string
    elementName: string
    range: Range
    elementType: 'lorebook' | 'regex' | 'lua'
  }>
}
```

**IncrementalRebuilder**

- 파일 변경 시 전체 재빌드가 아닌, 해당 파일의 `ElementCBSData`만 재추출
- 변경된 변수 셋이 달라졌을 때만 `UnifiedVariableGraph` 부분 갱신
- dirty flag 기반으로 Layer 3 서비스에 재분석 트리거

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

**Embedded CBS 처리**

CBS는 독립 `.cbs` 파일이 아니라 JSON 필드 안에 embedded됩니다:

```json
{
  "name": "히로인",
  "content": "{{setvar::mood::happy}} 오늘 기분이 좋아요"
}
```

CBS Provider는 JSON 내 CBS 영역만 추출하여 파싱합니다:

- lorebook JSON의 `content` 필드
- regex JSON의 `in`, `out` 필드
- offset 매핑으로 CBS AST의 Range를 원본 JSON 파일 내 위치로 변환

**제공 LSP 기능**

| 기능 | 동작 | 의존 |
|------|------|------|
| Completion | `{{` 후 함수명 제안, `{{getvar::` 후 변수명 제안 | core 파서 + Layer 1 VariableGraph |
| Hover | 함수 문서, 변수의 reader/writer 요약 | core registry + Layer 3 |
| Diagnostics | CBS 구문 에러 + 미정의 변수 경고 | core 파서 + Layer 3 |
| Signature Help | `::` 입력 시 인수 힌트 | core registry |
| Semantic Tokens | 함수/변수/키워드/연산자 색상 구분 | core 파서 |
| Go-to-Definition | `{{getvar::hp}}` → writer 위치로 cross-file 점프 | Layer 3 CrossRef |
| Find References | 변수의 모든 read/write 위치를 파일 경계 없이 수집 | Layer 3 CrossRef |
| Rename | 변수명을 모든 파일에서 일괄 변경 | Layer 3 CrossRef |
| Folding | `#when`, `#each` 블록 접기 | core 파서 |
| Code Actions | deprecated 함수 자동 교체, 블록 미닫힘 수정 | core 파서 + registry |

---

### Lua Provider

LuaLS(sumneko lua-language-server)를 subprocess로 실행하고, RisuAI 전용 기능을 overlay합니다.

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
---@meta risuai

---@param key string 변수명
---@param value any 저장할 값
function setState(key, value) end

---@param key string 변수명
---@return any
function getState(key) end

---@param keyword string 로어북 키워드
---@return table[]
function getLoreBooks(keyword) end
```

---

## Layer 3: Cross-Element Services

이 레이어가 통합 LSP의 핵심 차별점입니다. Layer 1의 그래프를 조회하여 파일/요소 경계를 넘나드는 기능을 제공합니다.

### VariableFlowService (최우선 — Priority A)

CBS 변수와 Lua state를 통합하여 파일 간 변수 흐름을 추적합니다.

```
[lorebook/히로인.json]                    [regex/변수처리.json]
{{setvar::mood::happy}}  ──────────────>  {{getvar::mood}}
       │                                        │
       │              [lua/main.lua]             │
       └──────────>  getState("mood")  <─────────┘
                     setState("mood", "sad")
                            │
                            ▼
                  [lorebook/이벤트.json]
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
  📖 히로인.json — {{setvar::mood::happy}}
  🔧 main.lua — setState("mood", "sad")

Readers (3):
  📖 이벤트.json — {{getvar::mood}}
  🔤 변수처리.json — {{getvar::mood}}
  🔧 main.lua — getState("mood")
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

Lorebook 간 재귀 활성화 관계를 진단합니다. core의 `analyzeLorebookActivationChains`를 실시간으로 실행:

| 기능 | 동작 |
|------|------|
| Activation Hint | lorebook content에 다른 lorebook의 키워드가 포함되면 인라인 힌트: `"이 텍스트는 '전투' 엔트리를 활성화합니다"` |
| Chain Warning | 순환 활성화 감지 시 warning: `"A → B → A 순환 활성화 체인"` |
| Partial Match Info | 2차 키워드 중 일부만 충족 시 info: `"'전투' 활성화에 필요한 2차 키워드 'HP' 누락"` |
| CodeLens | 각 lorebook 엔트리 위에 `"N개 엔트리에 의해 활성화됨 | M개 엔트리를 활성화"` 표시 |

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
                └── 활성화 관련 → ActivationChainService.getChains(entryId)
```

**진단 갱신 흐름 예시:**

lorebook A에서 `{{setvar::hp::100}}`을 삭제하면:

1. Layer 1이 변수 `hp`의 writer에서 A를 제거
2. VariableFlowService가 `hp`를 읽는 모든 파일을 찾음
3. 해당 파일들에 `"변수 hp에 대한 writer가 없습니다"` warning push

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

### Phase 0: 기반 정비

core에 공용 CBS 파서 디렉토리를 배치하고, cbs-lsp가 core를 의존하도록 설정합니다.

| 작업 | 상세 |
|------|------|
| core에 CBS 파서 디렉토리 생성 | 기존 cbs-lsp scaffold의 lexer/parser/ast/visitor/registry를 core로 이동 |
| cbs-lsp → core 의존성 추가 | `package.json`에 workspace dependency |
| 기존 `extractCBSVarOps` 유지 | 파서 완성 전까지 regex 기반 추출 병행, 이후 교체 |

### Phase 1: CBS 파서 구현 (core)

CBS_LSP_PLAN.md Phase 1~3의 내용을 core에서 구현합니다.

| 작업 | 산출물 |
|------|--------|
| Tokenizer | `{{`, `}}`, `::`, 함수명, 인수, 블록, 주석, 수식 토큰화 |
| Parser | 재귀 하강 파서 → Range 정보 포함 AST |
| Builtin Registry | 107개 함수 + 별칭 175개 정적 레지스트리 |
| `extractCBSVarOps` 교체 | AST 기반 변수 추출로 전환, analyze pipeline 자동 개선 |

**완료 기준:** 기존 analyze pipeline의 CBS 관련 테스트가 새 파서로도 통과

### Phase 2: Workspace Indexer (Layer 1)

| 작업 | 산출물 |
|------|--------|
| FileScanner | 디렉토리 재귀 탐색, 파일 타입 판별, watch 등록 |
| ElementRegistry | lorebook/regex/lua 요소 중앙 저장소 |
| UnifiedVariableGraph | core의 `buildUnifiedCBSGraph` + Lua stateVars 통합 |
| IncrementalRebuilder | dirty tracking, 파일 단위 재분석, 그래프 부분 갱신 |

**완료 기준:** workspace open 시 변수 그래프 구축, 파일 변경 시 incremental 갱신

### Phase 3: CBS Provider (Layer 2-A)

| 작업 | 산출물 |
|------|--------|
| Embedded Extractor | JSON 필드에서 CBS 영역 추출, Range 변환 |
| 단일 파일 기능 | completion, hover, diagnostics, signature, semantic tokens, folding, code actions |
| Layer 3 연동 | cross-file 기능은 서비스 호출로 위임 |

**완료 기준:** lorebook JSON 파일에서 `{{` 입력 시 자동완성, 구문 에러 진단, 호버 문서 동작

### Phase 4: Cross-Element Services (Layer 3)

| 작업 | 산출물 | 우선순위 |
|------|--------|----------|
| VariableFlowService | cross-file definition, references, rename, hover | A (최우선) |
| LuaCBSBridgeService | Lua ↔ CBS 변수 통합, getLoreBooks 연동 | C |
| ActivationChainService | 활성화 체인 진단, CodeLens, 순환 감지 | B |

**완료 기준:** lorebook에서 `{{getvar::x}}` → regex/lua의 writer로 cross-file 점프 동작

### Phase 5: Lua Provider (Layer 2-B)

| 작업 | 산출물 |
|------|--------|
| LuaLS 프록시 | subprocess spawn, LSP 메시지 중계 |
| Type Stubs | `setState`, `getState`, `getLoreBooks` 등 API 타입 정의 자동 생성 |
| RisuAI Addon | 변수명 completion, API 인수 검증, cross-file hover |
| Response Merger | LuaLS 결과 + RisuAI 결과를 합쳐서 클라이언트에 전달 |

**완료 기준:** `.lua` 파일에서 `setState("` 입력 시 변수 그래프 기반 변수명 제안

### Phase 6: LSP Server 통합 + 테스트

| 작업 | 산출물 |
|------|--------|
| Server 라우팅 | 파일 타입별 적절한 provider로 요청 분배 |
| E2E 테스트 | 실제 추출 디렉토리 기반 통합 테스트 |
| 성능 최적화 | 대형 캐릭터 카드 (100+ lorebook 엔트리) 벤치마크 |

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

### cbs-lsp

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
│   ├── providers/                     ← Layer 2: Language Providers
│   │   ├── cbs/
│   │   │   ├── cbsProvider.ts
│   │   │   ├── embeddedExtractor.ts
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

### server.ts 라우팅

```typescript
// 파일 URI → provider 매핑
function routeRequest(uri: string) {
  if (isLuaFile(uri))           return luaProvider
  if (isLorebookJson(uri))      return cbsProvider  // CBS embedded in JSON
  if (isRegexJson(uri))         return cbsProvider  // CBS embedded in JSON
  if (isCbsFile(uri))           return cbsProvider  // 독립 .cbs 파일
  return null  // 지원하지 않는 파일
}

// cross-file 기능은 provider가 서비스를 호출
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
