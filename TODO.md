# TODO

## Repack/Extract 정책 체크리스트

### Done

- [x] **Lorebook Path-Based Workspace Contract Migration (T16)**
  - Modified: `packages/core/src/domain/custom-extension/extensions/lorebook.ts` — path-based `_order.json` parsing, folder key regeneration during pack
  - Modified: `packages/core/src/cli/extract/character/phases.ts` — real directory lorebook extraction using planner/executor
  - Modified: `packages/core/src/cli/extract/module/phases.ts` — real directory lorebook extraction for modules
  - Modified: `packages/core/src/cli/pack/character/workflow.ts` — removed `_folders.json` dependency, path-based assembly
  - Modified: `packages/core/src/cli/pack/module/workflow.ts` — removed `_folders.json` dependency, path-based assembly
  - Modified: `packages/core/src/node/lorebook-io.ts` — updated executeLorebookPlan for path-based order
  - Modified: `packages/core/tests/custom-extension/lorebook-canonical.test.ts` — path-based contract tests
  - Modified: `packages/core/tests/lorebook-folder-layout.test.ts` — real directory assertions
  - Modified: `packages/core/tests/charx-extract.test.ts` — path-based order validation
  - Modified: `packages/core/src/cli/extract/workflow-output-structures.md` — documented path-based contract
  - Workspace identity is now path-based: `lorebooks/<folder>/<entry>.risulorebook` + `_order.json` with folder paths
  - `_folders.json` is no longer written during extract; folder keys are regenerated during pack/export
- [x] **F2 Blocker Fix**: Lua/CBS documentation truthfulness alignment
  - Modified: `docs/custom-extension/extensions/lua.md` — clarified first-cut full-file routing vs future AST parsing
  - Modified: `docs/custom-extension/common/principles.md` — aligned CBS LSP source type mapping table with actual behavior
  - Current implementation: `mapLuaToCbsFragments` returns `section: 'full'` fragment, LSP validates entire file content
  - Future T15: Lua AST-based string-literal-only CBS fragment mapping (clearly marked as future/archival)
- [x] **Final Wave Blocker Fix**: charx analyze/compose variable path fix
  - Modified: `packages/core/src/cli/analyze/charx/collectors.ts` — `collectVariablesCBS()`
  - Now reads from `variables/<sanitizedCharxName>.risuvar` (canonical charx workspace)
  - Falls back to `variables/default.risuvar` for backward compatibility
  - Added regression test: `composition-analysis.test.ts` — "reads charx variables from canonical .risuvar file with sanitized name"
  - All 12 composition tests pass, unblocking Final Wave
- [x] **Analyze Canonical Lua Support Fix**
  - Modified: `packages/core/src/cli/analyze/charx/collectors.ts` — canonical `.risulua` discovery with legacy `.lua` fallback
  - Modified: `packages/core/src/cli/analyze/compose/workflow.ts` — charx compose now prefers fresh Lua artifacts over sidecar-only import
  - Modified: `packages/core/src/cli/analyze/workflow.ts` — top-level `analyze` auto-detect accepts `.risulua`
  - Modified: `packages/core/src/cli/analyze/shared/cross-cutting.ts` — Lua token component collection matches canonical `.risulua`
  - Added regression coverage: `packages/core/tests/module-analyze-workflow.test.ts`, `packages/core/tests/cli-main-dispatch.test.ts`, `packages/core/tests/composition-analysis.test.ts`
  - Verified: `npx vitest run tests/module-analyze-workflow.test.ts`, `npx vitest run tests/cli-main-dispatch.test.ts`, `npx vitest run tests/composition-analysis.test.ts`, `npm --workspace packages/core run build`
- [x] **Analyze Shared Canonical Migration Fix**
  - Modified: `packages/core/src/cli/analyze/shared/cross-cutting.ts` — lorebook/regex dead-code and token-budget collectors now prefer canonical `.risulorebook` / `.risuregex` / `.risulua` with legacy fallback
  - Canonical ordering now respects `_order.json` instead of drifting to alphabetical order
  - Added regression coverage: `packages/core/tests/cross-cutting-canonical.test.ts`
  - Verified: `npx vitest run tests/cross-cutting-canonical.test.ts`, `npx vitest run tests/module-analyze-workflow.test.ts`, `npx vitest run tests/composition-analysis.test.ts`, `npm --workspace packages/core run build`
- [x] **Analyze Canonical Lorebook Folder Identity Fix**
  - Modified: `packages/core/src/cli/analyze/charx/workflow.ts` — canonical analyze now reconstructs lorebook folder identity from current `lorebooks/` path layout instead of stale frontmatter `folder`
  - Modified: `packages/core/src/domain/custom-extension/extensions/lorebook.ts` — nested parent folder derivation now uses the full relative directory path, not only the first path segment
  - Added regression coverage: `packages/core/tests/charx-analyze-workflow.test.ts`
  - Verified: `npx vitest run tests/charx-analyze-workflow.test.ts`, `npx vitest run tests/force-graph-dedup.test.ts`, `npx vitest run tests/lorebook-folder-layout.test.ts`, `npx vitest run tests/charx-extract.test.ts`, `npx vitest run tests/module-extract.test.ts`, `npx vitest run tests/pack-character-roundtrip.test.ts`, `npm --workspace packages/core run build`
- [x] **Relationship Network Root Group Pin Fix**
  - Modified: `packages/core/src/cli/analyze/shared/relationship-network-builders.ts` — root-level lorebooks no longer invent a fake `folder:(root)` pinned cluster
  - Added regression coverage: `packages/core/tests/force-graph-dedup.test.ts` — root-level lorebooks must not receive `lorebook-folder` grouping metadata
  - Verified: `npx vitest run tests/force-graph-dedup.test.ts`, `npx vitest run tests/analysis-visualization-contract.test.ts`, `npx vitest run tests/charx-analyze-workflow.test.ts`, `npm --workspace packages/core run build`
- [x] **Relationship Network Hidden Trigger Physics Fix**
  - Modified: `packages/core/src/cli/analyze/shared/report-shell/client.js` — relationship-network now builds render/simulation sets from the active visible node/edge types instead of letting default-hidden trigger nodes keep influencing layout off-screen
  - Force-graph signature now includes active node/edge filter state, so legend toggles rebuild the graph with a matching simulation instead of only changing DOM visibility
  - Added contract coverage: `packages/core/tests/analysis-visualization-contract.test.ts`
  - Verified: `npx vitest run tests/analysis-visualization-contract.test.ts`, `npm --workspace packages/core run build`
- [x] **F4 Blocker Fix**: Aligned T16 guard test with approved deferred scope
  - Modified: `packages/core/tests/custom-extension/no-root-json-legacy-surface.test.ts`
  - Test now allows deferred T16 wording (legacy/fallback/deferred) in active docs
  - Still protects against root-JSON being presented as current standard
  - All 10 tests pass, unblocking F4 approval
- [x] 루트 `AGENTS.md` 추가 (TODO 업데이트/잔여 작업 리마인드 규칙 명시)
- [x] `pack.js` 구현 (`png`, `charx`, `charx-jpg`)
- [x] `lorebooks/manifest.json` 기반 lorebook 재구성
- [x] `regex/_order.json` 기반 customScripts 재구성
- [x] `module.risum` 재생성 로직 추가
- [x] 현재 제한사항 문서화 (`docs/what_we_extract.md`, `template/AGENT.md`, `pack --help`)
- [x] `template/scripts/analyze-card/correlators.js` 추가 (`buildUnifiedCBSGraph` 구현, 브리지/정렬/트렁케이션)
- [x] `analyze-card.js` 종합 분석기 구현 (4-phase pipeline: collect → correlate → analyze → report)
- [x] `analyze-card/collectors.js` — lorebook/regex/variables/HTML/TS/Lua CBS 수집기
- [x] `analyze-card/collectors.js` — card.json 대신 추출 폴더(lorebooks/ regex/ variables/ html/) 우선 읽기 + card.json fallback
- [x] `analyze-card/constants.js` — MAX_* 상수, ELEMENT_TYPES, CBS_OPS
- [x] `analyze-card/correlators.js` — unified CBS graph + lorebook-regex 상관관계
- [x] `analyze-card/lorebook-analyzer.js` — 폴더 트리, 활성화 통계, 키워드 분석
- [x] `analyze-card/reporting.js` — 8섹션 Markdown 리포트 생성기
- [x] `analyze-card/reporting/htmlRenderer.js` — Chart.js 포함 자체완결 HTML 리포트
- [x] `analyze-card/reporting/htmlRenderer.js` — sharedVars 키 불일치(`lorebookEntries`/`regexScripts`) 대응 패치
- [x] `extract.js` Phase 9 통합 (analyze-card.js 자동 실행, non-fatal)
- [x] `extract.js` Lua 분석 호출에 `--json` 추가 (lua/*.analysis.json 자동 생성)
- [x] `phase4_extractTriggerLua` 파일명 fallback 개선 (comment 없으면 Lua 함수명 추론 사용)
- [x] `extract.js` Phase 8 Character Card 추출 추가 (`character/` 8개 파일: 6x `.txt` 텍스트 필드 + `alternate_greetings.json` + `metadata.json`)
- [x] `packages/core` preset extract 추가 (`extract/preset/` + `.risup/.risupreset` 바이너리 디코드 지원)
- [x] `packages/core` preset `prompt_template/` 계약 정리 (`<label>.json` + `_order.json`, 번호 prefix 제거)
- [x] `packages/core` module extract 추가 (`extract/module/phases.ts`, `extract/module/workflow.ts`)
- [x] `packages/core/tests/module-extract.test.ts` 추가 (module extract phase1-7 + 라우팅 판별 통합 테스트)
- [x] `extract.js` Phase 5 에셋 타입별 서브디렉토리 분리 (`assets/icons/`, `assets/additional/`, `assets/emotions/`, `assets/other/`)
- [x] `analyze-card` Unified Variables에서 Lua writer/reader를 파일명 대신 `writtenBy`/`readBy` owner로 표시
- [x] core 테스트 전략 문서 추가 (`docs/core-test-strategy.md`)
- [x] `packages/core/scripts` 파이프라인 분석 문서 추가 (`../docs/core-scripts-pipeline.md`)
- [x] extract 파이프라인 문서 갱신 (`../docs/core-scripts-pipeline.md`에 Phase 8 Character Card 추출 반영)
- [x] `pack.js` Character Card round-trip 병합 지원 (`character/` -> `card.json`)
- [x] lorebook 폴더를 실제 디렉토리로 추출하고 raw metadata는 `lorebooks/manifest.json`에 보존
- [x] `lorebooks/manifest.json` 정책 확정 (extract always writes manifest, build/pack manifest-first)
- [x] repack contract & validation 문서화 (`../docs/repack-contract-validation.md`)
- [x] `packages/core/structure.md` 구조 문서 추가
- [x] `packages/core/core-structure-ko.md` 한글 번역 문서 추가
- [x] **Monorepo Restructure (Tasks 1-15)**
  - [x] Task 1: Root monorepo configuration (package.json, workspaces)
  - [x] Task 2: packages/core scaffold + package.json
  - [x] Task 3: Core types extraction from workbench.ts
  - [x] Task 4: shared/ TypeScript conversion (4 files)
  - [x] Task 5: packages/core tsconfig.json setup
  - [x] Task 6: Copy extract pipeline to core
  - [x] Task 7: Copy pack.js + rpack_map.bin to core
  - [x] Task 8: Copy analyze pipeline + fix luaparse path
  - [x] Task 9: Copy analyze-card pipeline to core
  - [x] Task 10: Copy build-components.js + shared/ JS to core
  - [x] Task 11: Core CLI entry point + index.ts
  - [x] Task 12: packages/vscode scaffold
  - [x] Task 13: Root .gitignore update
- [x] Task 14: vitest setup for packages/core
- [x] Task 15: TODO.md update + root test.js cleanup
- [x] `packages/core/src/shared/phase-helpers.ts` 분해 이관 완료 (lorebook 순수 계획은 `domain/lorebook/folders.ts`, 실행 I/O는 `node/lorebook-io.ts`, 소비자 phase는 plan+execute로 전환)
- [x] `packages/core` Task 9 완료: `cli/analyze` 순수 로직 domain 추출 (`lua-collector.ts`, `lua-analyzer.ts`, correlation 순수 로직 분리)
### Remaining

#### Repack Contract & Validation

- [x] 병합 우선순위(contract) 문서화 (`card.json` vs 추출 컴포넌트)
- [x] `--out` 경로 해석 규칙 문서화 (파일 경로 vs 디렉토리)
- [x] `pack -> extract` 검증 체크리스트 문서화

#### Lorebook & Regex Policy

- [ ] regex 파일 누락/불일치 시 에러 정책 문서화

#### Format Support Decisions

- [ ] strict cover 모드 추가 여부 결정 (현재는 1x1 fallback)
- [ ] `lua/*.lua -> triggerscript` 역변환 지원 여부 결정/설계

#### Analyze Pipeline

- [ ] custom extension analyze 후속 정리: reporting/preset-module fallback/legacy surface final cleanup (`docs/custom-extension-analyze-impact.md`)

#### Architecture Restructure (source of truth: `docs/architecture-proposal.md`)

- [x] `template/` 퇴역 결정 반영: 루트 역할을 scaffold 패키지에서 workspace/product 루트로 재정의
- [x] `bin/create.js`, `template/`, README의 scaffold 흐름 제거/축소 계획 수립
- [x] 구조 제안 문서 작성 (`docs/architecture-proposal.md`)
- [x] 프로젝트 철학/제품 방향성 Octto 세션 및 설계 문서 작성 (`../docs/plans/2026-03-17-risuai-workbench-philosophy-design.md`)
- [x] 프로젝트 정체성 정교화 Octto 세션 및 설계 문서 작성 (`docs/plans/2026-03-18-risuai-workbench-identity-design.md`)

##### Phase 1: Core 내부 정리 (domain/node/cli 분리, scripts/ 제거)

- [x] 1차 계약 테스트 보강 (package root import smoke, CLI smoke, 실제 workflow seam 고정)
- [x] `src/shared` ↔ `scripts/shared` helper parity 정리 (`risu-api`, `extract-helpers` 중심)
- [x] **1-1. `src/domain/` 생성 + 순수 로직 분리**
  - [x] `src/domain/index.ts` + 초기 pure helper 모듈 생성 (`card/cbs.ts`, `card/filenames.ts`, `card/asset-uri.ts`, `lorebook/folders.ts`, `analyze/lua-helpers.ts`)
  - [x] 기존 `src/shared/*` 중 순수 helper를 domain 구현으로 이관하고 shared는 compatibility facade로 유지
  - [x] `src/shared/`에서 Node.js 의존성 없는 순수 로직을 `src/domain/`으로 이동
  - [x] `domain/card/` — CardData 파싱, CBS 분석
  - [x] `domain/lorebook/` — lorebook 구조 분석
  - [x] `domain/regex/` — regex script 처리
  - [x] `domain/analyze/` — 분석 로직 (상관관계, 통계)
  - [x] 완료 기준: domain/ 내 모든 함수가 Node.js import 0
- [x] **1-2. `src/node/` 정비 (I/O 어댑터 전용)**
  - [x] `src/node/fs-helpers.ts`, `src/node/png.ts`, `src/node/card-io.ts` 추가
  - [x] `src/node/index.ts`를 node/domain 기반의 단일 explicit compatibility/export surface로 정리 (`legacy` 중간 레이어 없이 유지)
  - [x] `tests/domain-node-structure.test.ts` 추가로 Phase 1 domain/node 경계 스모크 고정
  - [x] `node/fs-helpers.ts` — ensureDir, writeJson, writeText, writeBinary
  - [x] `node/png.ts` — PNG chunk 파싱 (Buffer 의존)
  - [x] `node/card-io.ts` — parseCardFile (fs + fflate)
  - [x] 완료 기준: node/가 domain/에만 의존, 역방향 의존 없음
- [x] **1-3. `src/cli/` 생성 + scripts/*.js 로직 TS 이관**
  - [x] `cli/main.ts` — subcommand dispatcher (bin/risu-core.js의 로직 흡수)
  - [x] `cli/extract.ts` ← `scripts/extract.js` + `scripts/extract/phases.js`, `parsers.js`
  - [x] `cli/pack.ts` ← `scripts/pack.js`
  - [x] `cli/analyze.ts` ← `scripts/analyze.js` + `scripts/analyze/*.js`
  - [x] `cli/analyze-card.ts` ← `scripts/analyze-card.js` + `scripts/analyze-card/*.js`
  - [x] `cli/build.ts` ← `scripts/build-components.js`
  - [x] 이관 원칙: JS→TS 변환, strict mode, I/O는 node/ 사용, 순수 로직은 domain/ 사용
  - [x] 이관 전 각 커맨드별 integration test 작성 (현재 동작 고정)
  - [x] 완료 기준: 모든 CLI 커맨드가 src/cli/에서 동작, 기존 테스트 통과
- [x] **1-4. `bin/risu-core.js` → `dist/cli/main.js` 직접 호출**
  - [x] `execSync` 제거, 같은 프로세스에서 `require('../dist/cli/main').run()` 호출
  - [x] 완료 기준: `risu-core extract/pack/analyze` 등 기존 CLI 동일 동작
- [x] **1-5. `scripts/shared/` bridge 삭제**
  - [x] `scripts/shared/risu-api.js` 삭제
  - [x] `scripts/shared/extract-helpers.js` 삭제
  - [x] `scripts/shared/analyze-helpers.js` 삭제
  - [x] `scripts/shared/uri-resolver.js` 삭제
- [x] **1-6. `scripts/` 폴더 삭제**
  - [x] 모든 직접 구현체 이관 확인 후 `scripts/` 디렉토리 제거
  - [x] `scripts/rpack_map.bin` → `src/node/` 또는 `assets/`로 이동
  - [x] `scripts/package.json` 삭제
- [x] **1-7. barrel export 정비 + 계약 테스트 최종 보강**
  - [x] `src/index.ts` — types + domain만 export (브라우저 safe)
  - [x] `src/node/index.ts` — Node.js I/O 전용 export
  - [x] package.json exports 필드 확인: `"."` = types+domain, `"./node"` = I/O
  - [x] CLI smoke + domain unit + node integration 전체 통과 확인

##### Phase 2: VSCode Extension 구조 확장

- [x] **2-1. `services/` 계층 도입 (core import 시작)**
  - [x] `services/card-service.ts` — core domain + node를 조합하는 서비스
  - [x] `services/analysis-service.ts` — 분석 기능 서비스
  - [x] 완료 기준: core `"."`, `"./node"` import 정상 동작
- [x] **2-2. `providers/` 도입 (VSCode UI 제공자)**
  - [x] `providers/tree-provider.ts` — TreeView 제공자
  - [ ] `providers/codelens-provider.ts` — CodeLens 제공자 (필요시)
  - [x] 완료 기준: VSCode UI 제공자 1개 이상 동작
- [x] **2-3. `commands/` 도입 (command palette 바인딩)**
  - [x] extract, pack, analyze 등 핵심 기능 command palette 연동
  - [x] 완료 기준: command palette에서 core 기능 호출 가능
- [x] **2-4. `panels/` 도입 (webview host 준비)**
  - [x] `panels/card-panel.ts` — webview panel skeleton + 메시지 라우팅 준비
  - [x] 완료 기준: 빈 webview panel 생성 가능

##### Phase 3: Contracts + Webview

- [ ] **3-1. `packages/contracts/` 생성**
  - [ ] `contracts/src/messages.ts` — Extension ↔ Webview 메시지 프로토콜 (discriminated union)
  - [ ] `contracts/src/ui-types.ts` — PanelState, TreeItemData 등 공유 UI 타입
  - [ ] `contracts/src/index.ts` — barrel export
  - [ ] `contracts/package.json` — 의존성 0, 순수 타입만
  - [ ] 완료 기준: typed message map 존재, vscode + webview 양쪽에서 import 가능
- [ ] **3-2. `packages/webview/` 생성 (ui-mockup/ 승격)**
  - [ ] webview UI 프레임워크 선정 + vite 빌드 설정
  - [ ] contracts import 연동
  - [ ] `messaging.ts` — postMessage wrapper (contracts 기반 typed 통신)
  - [ ] 완료 기준: vite 빌드 + contracts import 동작
- [ ] **3-3. Extension ↔ Webview postMessage 연동**
  - [ ] vscode panels/ → webview 양방향 typed 메시지 전달
  - [ ] 완료 기준: 양방향 메시지 round-trip 검증
- [ ] **3-4. `ui-mockup/` 퇴역**
  - [ ] webview 패키지로 이관 완료 확인 후 `ui-mockup/` 디렉토리 삭제

---

## Build Tooling Notes

### 2025-04-14: tsc-alias resolution fix
- **Problem**: `pnpm --dir packages/core build` failed with `sh: 1: tsc-alias: not found`
- **Root cause**: Mixed npm/pnpm setup - npm installs deps at root, but pnpm package-local builds couldn't resolve the binary
- **Fix**: Changed build scripts from `tsc-alias` to `npx tsc-alias` in:
  - `packages/core/package.json`
  - `packages/vscode/package.json`
- **Result**: Both `npm --workspace` and `pnpm --dir` builds now work correctly
