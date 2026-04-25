# Rust WASM Lua Analyzer 도입 계획

이 문서는 거대 `.risulua` 병목을 근본적으로 줄이기 위해 Rust WASM 기반 Lua parser/analyzer를 도입하는 계획입니다. 목표는 기존 TypeScript CBS LSP 구조를 유지하면서, Lua parsing과 `.risulua` CBS fragment 추출 비용을 별도 WASM 분석 커널로 분리하는 것입니다.

---

## 1. 배경

현재 거대 `.risulua` 대응은 512KiB threshold를 기준으로 Layer 1 Lua 분석, LuaLS mirror sync, LuaLS hover/completion proxy를 건너뛰는 방식입니다.

이미 적용된 보호 범위:

- `packages/cbs-lsp/src/indexer/file-scanner.ts`
  - 거대 Lua source의 index text를 빈 문자열로 대체
  - 원본 길이와 `indexTextTruncated` flag 유지
- `packages/cbs-lsp/src/indexer/element-registry.ts`
  - oversized Lua file에서 `analyzeLuaSource()` skip
- `packages/cbs-lsp/src/providers/lua/lualsDocuments.ts`
  - workspace/standalone LuaLS sync skip
- `packages/cbs-lsp/src/providers/lua/lualsProcess.ts`
  - shadow `.lua` write 전 최종 size guard
- `packages/cbs-lsp/src/helpers/server-helper.ts`
  - hover/completion에서 oversized 문서 LuaLS proxy skip

하지만 후속 분석 결과, autosuggest 병목은 LuaLS proxy만의 문제가 아니었습니다. `.risulua`가 CBS-bearing artifact로 취급되면서 runtime CBS provider path가 여전히 열린 문서 전체를 fragment 분석 대상으로 보는 것이 핵심 병목입니다.

대표 병목:

- `packages/core/src/domain/custom-extension/cbs-fragments.ts`
  - `mapLuaToCbsFragments()`가 `.risulua` 전체를 단일 CBS fragment로 매핑
- `packages/cbs-lsp/src/core/fragment-analysis-service.ts`
  - `analyzeDocument()` / `locatePosition()`이 full text를 tokenize/parse/scope/diagnostics 대상으로 사용
- `packages/cbs-lsp/src/helpers/server-workspace-helper.ts`
  - `createFragmentRequest()`가 `document.getText()` 전체를 반환
- `packages/vscode/src/completion/cbsAutoSuggest.ts`
  - 큰 문서에서도 `editor.action.triggerSuggest`를 자동 발화

즉, Rust WASM 도입의 1차 목표는 “LuaLS 대체”가 아니라 **`.risulua` 전체를 CBS parser에 먹이지 않도록 Lua 구조를 빠르게 분해하는 것**입니다.

---

## 2. 목표

### 2.1 제품 목표

- 거대 `.risulua`를 열어도 CBS LSP event loop가 장시간 block되지 않게 함.
- `.risulua` 전체 파일을 CBS fragment로 보지 않고, Lua string literal 내부의 CBS 후보만 fragment로 노출함.
- Lua state API occurrence(`getState`, `setState`, `getChatVar`, `setChatVar`) 추출을 빠르고 deterministic하게 유지함.
- LuaLS companion은 optional advanced provider로 유지하고, Rust WASM analyzer는 CBS LSP의 local analysis kernel로 둠.

### 2.2 기술 목표

- Rust source를 WASM으로 컴파일해 Node-based `cbs-language-server`에서 로드함.
- Web/desktop/remote VS Code 모두를 장기적으로 고려할 수 있는 portable backend를 선택함.
- WASM boundary에서는 큰 AST 전체를 넘기지 않고 compact analysis result만 반환함.
- 기존 TypeScript `analyzeLuaSource()` contract를 한 번에 깨지 않고 adapter/fallback 방식으로 점진 전환함.

---

## 3. 비목표

- 첫 단계에서 LuaLS를 제거하지 않음.
- 첫 단계에서 full Lua type inference를 구현하지 않음.
- 첫 단계에서 native Node addon(`napi-rs`, Neon)을 도입하지 않음.
- 첫 단계에서 Rust sidecar binary나 별도 Rust LSP를 배포하지 않음.
- 첫 단계에서 모든 CBS provider를 Rust로 옮기지 않음.

---

## 4. 제안 아키텍처

```text
VS Code client
  └─ cbs-language-server (Node / TypeScript)
      ├─ CBS provider (existing TypeScript)
      ├─ LuaLS companion (optional sidecar, existing)
      └─ Rust WASM Lua analyzer (new)
          ├─ parse Lua syntax enough for string literals
          ├─ extract RisuAI state API calls
          └─ return compact JSON-compatible result
```

### 4.1 신규 패키지 후보

권장 위치:

```text
packages/lua-analyzer-wasm/
  Cargo.toml
  src/lib.rs
  pkg/                    # wasm-pack output 또는 checked-in generated artifact
  README.md
```

대안 위치:

```text
packages/core/src/domain/analyze/wasm/
```

하지만 Rust toolchain과 generated WASM artifact lifecycle을 분리하려면 별도 workspace package가 더 안전합니다.

### 4.2 TypeScript adapter

권장 위치:

```text
packages/core/src/domain/analyze/lua-wasm-adapter.ts
packages/core/src/domain/analyze/lua-analysis-backend.ts
```

역할:

- WASM module lazy-load
- WASM unavailable 시 `luaparse` fallback
- WASM result를 기존 `LuaAnalysisArtifact`와 호환되는 shape로 변환
- feature flag 또는 runtime option으로 backend 선택

### 4.3 CBS fragment mapping adapter

권장 수정 지점:

```text
packages/core/src/domain/custom-extension/cbs-fragments.ts
```

현재:

```text
.risulua 전체 text -> section: full fragment 1개
```

목표:

```text
.risulua Lua string literal 중 CBS marker가 있는 range만 fragment로 반환
```

첫 단계에서는 WASM이 string literal ranges만 반환하고, TypeScript가 해당 range에 `{{` 또는 `}}`가 있는지 검사해 CBS fragment를 만들 수 있습니다.

---

## 5. WASM API 설계 초안

WASM boundary에서는 recursive AST를 넘기지 않습니다. 분석에 필요한 compact payload만 반환합니다.

### 5.1 입력

```ts
interface LuaWasmAnalyzeInput {
  filePath: string;
  source: string;
  options?: {
    collectStringLiterals?: boolean;
    collectStateAccess?: boolean;
    maxSourceLength?: number;
  };
}
```

Rust/WASM exported function 후보:

```ts
analyze_lua(source: string, optionsJson: string): string
```

반환은 JSON string으로 시작합니다. 이후 성능 문제가 확인되면 binary serialization을 검토합니다.

### 5.2 출력

```ts
interface LuaWasmAnalyzeResult {
  ok: boolean;
  parser: 'rust-wasm-lua';
  version: 1;
  sourceLength: number;
  totalLines: number;
  stringLiterals: LuaWasmStringLiteral[];
  stateAccesses: LuaWasmStateAccess[];
  functions: LuaWasmFunctionSummary[];
  diagnostics: LuaWasmDiagnostic[];
  error: string | null;
}

interface LuaWasmStringLiteral {
  startOffset: number;
  endOffset: number;
  contentStartOffset: number;
  contentEndOffset: number;
  quoteKind: 'single' | 'double' | 'long-bracket' | 'unknown';
  hasCbsMarker: boolean;
}

interface LuaWasmStateAccess {
  apiName: 'getState' | 'setState' | 'getChatVar' | 'setChatVar';
  key: string;
  direction: 'read' | 'write';
  callStartOffset: number;
  callEndOffset: number;
  keyStartOffset: number;
  keyEndOffset: number;
  line: number;
  containingFunction: string;
}

interface LuaWasmFunctionSummary {
  name: string;
  displayName: string;
  startOffset: number;
  endOffset: number;
  startLine: number;
  endLine: number;
  params: string[];
  isLocal: boolean;
}

interface LuaWasmDiagnostic {
  message: string;
  startOffset: number;
  endOffset: number;
  severity: 'error' | 'warning' | 'info';
}
```

---

## 6. 단계별 실행 계획

### Phase 0. Worktree 준비

권장 branch/worktree 이름:

```bash
git worktree add ../risuai-workbench-rust-wasm -b feature/rust-wasm-lua-analyzer
```

주의:

- 이 문서는 계획만 작성하며 worktree를 실제로 생성하지 않았습니다.
- repo 규칙상 destructive git command는 사용하지 않습니다.
- worktree 생성 후에도 기존 작업트리의 미완료 변경과 섞지 않습니다.

### Phase 1. 안전장치 우선 적용

Rust WASM 도입 전, 현재 병목을 즉시 줄이는 guard를 먼저 둡니다.

작업:

- oversized `.risulua`에서 runtime CBS analysis skip
- oversized `.risulua` diagnostics는 empty diagnostics publish
- VS Code client autoSuggest size guard 추가
- cheap root completion의 full-text scan 제한

대상 파일:

- `packages/cbs-lsp/src/helpers/server-workspace-helper.ts`
- `packages/cbs-lsp/src/core/fragment-analysis-service.ts`
- `packages/cbs-lsp/src/controllers/DiagnosticsPublisher.ts`
- `packages/cbs-lsp/src/features/completion.ts`
- `packages/vscode/src/completion/cbsAutoSuggest.ts`

검증:

- `npm run --workspace cbs-language-server test -- tests/helpers/server-helper.test.ts`
- `npm run --workspace cbs-language-server test -- tests/providers/luals-documents.test.ts`
- `npm run --workspace cbs-language-server test -- tests/providers/luals-process.test.ts`
- `npm run --workspace risu-workbench-vscode build`

### Phase 2. WASM package scaffold

작업:

- `packages/lua-analyzer-wasm` 생성
- `Cargo.toml` / `src/lib.rs` 추가
- `wasm-bindgen` 또는 `wasm-pack` 기반 build script 결정
- minimal function 구현

초기 exported API:

```rust
pub fn analyze_lua(source: &str, options_json: &str) -> String
```

초기 result:

- `sourceLength`
- `totalLines`
- 빈 `stringLiterals`
- 빈 `stateAccesses`
- `ok: true`

검증:

- Rust unit test
- generated WASM load smoke test from Node

### Phase 3. Lua string literal extraction

작업:

- Lua string literal range 추출
- `hasCbsMarker` 계산
- long bracket string 처리
- escaped quote 처리
- parser error 시 partial result 반환 정책 결정

구현 선택지:

1. 직접 lightweight scanner 구현
   - CBS fragment 추출 목적에는 충분할 수 있음
   - dependency가 적음
2. Rust `tree-sitter-lua` 기반 구현
   - 구조적으로 더 안정적
   - WASM compile/build complexity가 증가

권장 시작점은 **직접 scanner**입니다. 목표가 full Lua AST가 아니라 string literal range와 state API occurrence 추출이기 때문입니다.

검증 fixture:

- single quote string
- double quote string
- escaped quote
- long bracket string
- comment 안의 fake string
- multiline string
- `{{getvar::x}}` 포함 string
- CBS marker 없는 string

### Phase 4. `.risulua` CBS fragment mapping 전환

작업:

- `mapLuaToCbsFragments()`를 WASM-backed string literal range 기반으로 전환
- WASM unavailable이면 기존 full-file fragment가 아니라 안전한 fallback 정책 사용

권장 fallback:

```text
WASM unavailable + oversized .risulua -> fragments: []
WASM unavailable + small .risulua -> 기존 full-file fragment 유지 가능
```

이렇게 하면 개발 환경에서 WASM load가 실패해도 거대 파일 병목이 재발하지 않습니다.

검증:

- `.risulua` string literal 내부 CBS completion/hover가 유지되는지
- Lua code body의 일반 텍스트가 CBS parser로 들어가지 않는지
- oversized `.risulua`에서 completion/diagnostics가 즉시 반환되는지

### Phase 5. State API occurrence extraction

작업:

- `getState("key")`, `setState("key", value)` 추출
- `getChatVar("key")`, `setChatVar("key", value)` 추출
- containing function summary 연결
- 기존 `runCollectPhase()` result와 호환되는 adapter 작성

대상 파일:

- `packages/core/src/domain/analyze/lua-core.ts`
- `packages/core/src/domain/analyze/lua-collector.ts`
- `packages/cbs-lsp/src/indexer/element-registry.ts`
- `packages/cbs-lsp/src/indexer/unified-variable-graph.ts`

검증:

- 기존 Lua analysis unit test 통과
- Layer 1 graph occurrence snapshot 통과
- `.risulua` getState/setState overlay completion 유지

### Phase 6. Backend selection / fallback policy

작업:

- `LuaAnalysisBackend` interface 추가
- `wasm` / `luaparse` / `disabled` backend 선택
- runtime availability trace에 backend 상태 노출
- WASM load 실패 시 operator에게 원인 노출

예시:

```ts
type LuaAnalysisBackendKind = 'rust-wasm' | 'luaparse' | 'disabled';
```

정책:

- 기본값은 `rust-wasm` 시도 후 실패하면 `luaparse`
- oversized `.risulua`에서는 fallback이 `luaparse`여도 full-file parse 금지
- CI에서 WASM artifact가 없으면 명확히 skip 또는 fallback test로 분리

### Phase 7. 성능 회귀 테스트

작업:

- 거대 `.risulua` fixture 생성 또는 synthetic fixture 사용
- completion request duration budget 고정
- diagnostics publish duration budget 고정
- WASM analyzer cold/warm load 시간 측정

대상 테스트 후보:

- `packages/cbs-lsp/tests/perf/large-workspace.test.ts`
- 신규 `packages/core/tests/domain/analyze/lua-wasm-adapter.test.ts`
- 신규 `packages/cbs-lsp/tests/perf/oversized-risulua-runtime.test.ts`

성능 목표 초안:

| 항목 | 목표 |
| --- | ---: |
| oversized `.risulua` completion CBS-only path | 50ms 이하 |
| oversized `.risulua` diagnostics publish | 50ms 이하 |
| WASM warm string literal extraction 1MiB | 100ms 이하 |
| WASM module lazy-load | 500ms 이하, 최초 1회만 허용 |

---

## 7. 배포 전략

### 7.1 npm package 포함

`packages/core` 또는 신규 `packages/lua-analyzer-wasm` package에 generated `.wasm`과 JS glue를 포함합니다.

필요 작업:

- `package.json files`에 WASM artifact 포함
- `tsconfig` / build script에서 artifact copy
- VS Code extension package에도 artifact가 포함되는지 boundary test 추가

### 7.2 VS Code Web 가능성

WASM 방식은 장기적으로 VS Code Web에 맞습니다. 다만 현재 extension은 Node-based LSP path를 중심으로 구성되어 있으므로, Web 지원은 별도 단계로 둡니다.

Web 전환 시 고려:

- `vscode-languageclient/browser`
- Web Worker 기반 LSP server
- `vscode.workspace.fs` 기반 virtual workspace access
- Node `fs/path/child_process` 제거 또는 browser shim 분리

---

## 8. 리스크와 완화책

| 리스크 | 영향 | 완화책 |
| --- | --- | --- |
| WASM load 실패 | Lua 분석 비활성 또는 fallback 필요 | backend availability trace와 `luaparse` fallback 유지 |
| AST/result serialization 비용 | 큰 파일에서 성능 저하 | AST 전체 대신 compact result만 반환 |
| Rust build toolchain이 CI에 없음 | build pipeline 실패 | generated WASM artifact를 commit하거나 Rust build job을 별도 optional로 시작 |
| `.risulua` CBS fragment semantics 변경 | completion/hover 회귀 | string literal 내부 CBS fixture를 먼저 golden test로 고정 |
| 직접 scanner가 Lua grammar edge case를 놓침 | 일부 string range 누락 | tree-sitter-lua backend로 교체 가능한 interface 유지 |
| oversized fallback이 기능을 과하게 끔 | 큰 파일에서 CBS 일부 기능 제한 | threshold와 기능 제한을 availability/operator trace에 명확히 노출 |

---

## 9. 변경 후보 파일 목록

### 새 파일

- `docs/rust-wasm-plan.md`
- `packages/lua-analyzer-wasm/Cargo.toml`
- `packages/lua-analyzer-wasm/src/lib.rs`
- `packages/core/src/domain/analyze/lua-wasm-adapter.ts`
- `packages/core/src/domain/analyze/lua-analysis-backend.ts`
- `packages/core/tests/domain/analyze/lua-wasm-adapter.test.ts`
- `packages/cbs-lsp/tests/perf/oversized-risulua-runtime.test.ts`

### 수정 파일

- `package.json`
- `packages/core/package.json`
- `packages/core/src/domain/analyze/lua-core.ts`
- `packages/core/src/domain/custom-extension/cbs-fragments.ts`
- `packages/cbs-lsp/src/core/fragment-analysis-service.ts`
- `packages/cbs-lsp/src/helpers/server-workspace-helper.ts`
- `packages/cbs-lsp/src/controllers/DiagnosticsPublisher.ts`
- `packages/cbs-lsp/src/features/completion.ts`
- `packages/vscode/src/completion/cbsAutoSuggest.ts`

---

## 10. 검증 계획

### 기본 검증

```bash
npm run --workspace risu-workbench-core test
npm run --workspace cbs-language-server test -- tests/indexer/element-registry.test.ts
npm run --workspace cbs-language-server test -- tests/providers/luals-documents.test.ts
npm run --workspace cbs-language-server test -- tests/providers/luals-process.test.ts
npm run --workspace cbs-language-server build
npm run --workspace risu-workbench-vscode build
```

### 성능 검증

```bash
npm run --workspace cbs-language-server test:perf:standalone
npm run --workspace cbs-language-server test -- tests/perf/oversized-risulua-runtime.test.ts
```

### 패키징 검증

```bash
npm run --workspace risu-workbench-vscode test:e2e:cbs-client:boundary
```

확인할 것:

- VSIX 또는 built output에 `.wasm` artifact가 포함되는지
- embedded fallback에서 WASM path resolution이 깨지지 않는지
- standalone `cbs-language-server` npm package에서 WASM artifact를 찾을 수 있는지

---

## 11. 의사결정 체크리스트

- [ ] worktree에서 실험할 branch 이름 확정
- [ ] Rust WASM package 위치 확정
- [ ] `wasm-pack` 사용 여부 확정
- [ ] 직접 scanner vs `tree-sitter-lua` 1차 backend 결정
- [ ] oversized `.risulua` runtime guard 선행 여부 확정
- [ ] WASM artifact commit 여부 확정
- [ ] fallback policy 문구와 availability trace schema 확정

---

## 12. 권장 첫 PR 범위

첫 PR은 Rust WASM 전체 도입이 아니라, 다음처럼 작게 자르는 것을 권장합니다.

1. oversized `.risulua` runtime CBS analysis guard
2. oversized `.risulua` client autoSuggest skip
3. `docs/rust-wasm-plan.md` 유지
4. perf regression test 추가

그 다음 PR에서 WASM scaffold를 추가합니다. 이렇게 나누면 병목 완화와 Rust 도입 리스크를 분리해서 검증할 수 있습니다.
