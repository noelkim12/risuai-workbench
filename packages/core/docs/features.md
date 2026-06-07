# 기능 지도

이 문서는 `packages/core`의 주요 기능군을 현재 source tree 기준으로 찾기 위한 지도입니다.

## 기능군

| 영역 | 현재 주요 위치 | 설명 | 관련 테스트 예시 |
|---|---|---|---|
| CBS | `../src/domain/cbs/` | parser, tokenizer, builtin registry, documentation, CBS variable op 추출 | `../tests/domain/cbs/*.test.ts` |
| CBS simulator | `../src/simulator/` | RisuAI runtime 호출 없는 local dry-run evaluator | `../tests/domain/cbs/cbs-simulator-*.test.ts` |
| Regex preview simulator | `../src/simulator/regex/` | `.risuregex` preview DTO, native regex run, replacement, directive plan, CBS section adapter | `../tests/simulator/regex/*.test.ts` |
| Analyze | `../src/domain/analyze/`, `../src/cli/analyze/` | token budget, variable flow, dead code, composition, prompt chain, correlation, Lua analysis, report workflow | `../tests/token-budget.test.ts`, `../tests/variable-flow.test.ts`, `../tests/dead-code.test.ts`, `../tests/composition-analysis.test.ts`, `../tests/lua-core.test.ts` |
| Lorebook | `../src/domain/lorebook/` | folder map, extraction plan, structure analysis, activation chain, decorator helper | `../tests/lorebook-folder-layout.test.ts`, `../tests/lorebook-activation-chain.test.ts`, `../tests/domain/lorebook/decorators/*.test.ts` |
| Regex domain | `../src/domain/regex/` | `.risuregex` parse/serialize, CharX/module/preset extract/inject, CBS 추출 | regex 관련 domain/test 파일 |
| Custom extension | `../src/domain/custom-extension/` | canonical `.risu*` artifact contract, CBS fragment mapping, allowed-loss policy | `../tests/cross-cutting-canonical.test.ts`, editor/LSP 연계 테스트 |
| Editor domain | `../src/domain/editor/` | `.risulorebook`, `.risuregex`, `.risuprompt`, `.risuhtml` document model과 preview adapter | `../tests/editor/*.test.ts` |
| RisuLua split | `../src/domain/risulua-split/` | RisuLua source profiling, split/rewrite/render, module-table workflow | `../tests/risulua-split-*.test.ts` |
| Node adapter | `../src/node/` | fs, PNG, CharX/card I/O, lorebook I/O, JSON listing, rpack | `../tests/node-entry.test.ts`, workflow 테스트 |

## Source-local 상세 문서

- [`../src/simulator/README.md`](../src/simulator/README.md)
- [`../src/simulator/CASE_STUDY.md`](../src/simulator/CASE_STUDY.md)
- [`../src/domain/editor/README.md`](../src/domain/editor/README.md)
- [`../src/domain/editor/ARCHITECTURE.md`](../src/domain/editor/ARCHITECTURE.md)
- [`../src/cli/analyze/README.md`](../src/cli/analyze/README.md)
- [`../src/cli/CLI.md`](../src/cli/CLI.md)
- [`../src/cli/extract/workflow-output-structures.md`](../src/cli/extract/workflow-output-structures.md)
- [`../src/domain/risulua-split/WORKFLOW.md`](../src/domain/risulua-split/WORKFLOW.md)
- [`../src/domain/risulua-split/OUTPUT_STRUCTURE.md`](../src/domain/risulua-split/OUTPUT_STRUCTURE.md)
- [`../src/domain/risulua-split/CUSTOMIZING.md`](../src/domain/risulua-split/CUSTOMIZING.md)

## 작성 경계

- 이 문서는 기능 위치를 찾는 지도입니다. 개별 helper의 전체 API reference가 아닙니다.
- 기능을 보장한다고 쓰려면 [`evidence.md`](evidence.md)에 따라 source와 test를 함께 확인합니다.
- 저장소 루트 `docs/core/` 문서는 이 지도보다 상위 권위를 갖지 않습니다.
