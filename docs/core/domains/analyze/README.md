# analyze domain

이 문서는 `packages/core`의 analyze subtree 인덱스다. `packages/core/src/domain/analyze/`와 `packages/core/src/cli/analyze/`를 따라 현재 leaf 페이지를 어디서 읽어야 하는지 먼저 정한다.

## 이 subtree가 맡는 범위

- `packages/core/src/domain/analyze/`는 순수 분석 로직을 둔다.
- public import는 root browser entry를 통해 노출된다. 현재 export 경로는 [`../../targets/root-browser.md`](../../targets/root-browser.md)를 따른다.
- CLI analyze는 별도 실행 surface이며, `packages/core/src/cli/analyze/workflow.ts`가 `lua`, `charx`, `module`, `preset`, `compose`로 라우팅한다. CLI boundary 요약은 [`../../targets/cli.md`](../../targets/cli.md)에 둔다.
- 이 페이지는 각 분석기의 상세 규칙을 다시 풀지 않는다. 상세 알고리즘은 아래 leaf 페이지로 보낸다.

## 현재 파일 축

| 축 | 현재 파일 |
|---|---|
| 공통 분석 primitive | `constants.ts`, `token-budget.ts`, `variable-flow.ts`, `variable-flow-types.ts`, `dead-code.ts`, `composition.ts`, `prompt-chain.ts`, `text-mention.ts`, `correlation.ts` |
| Lua 분석 | `lua-api.ts`, `lua-helpers.ts`, `lua-analysis-types.ts`, `lua-collector.ts`, `lua-analyzer.ts`, `lua-core.ts` |
| CLI 라우팅 | `../../../../packages/core/src/cli/analyze/workflow.ts` |

이 묶음은 현재 `../../../../packages/core/src/domain/index.ts`를 통해 root entry로 다시 export된다.

## public surface에서 이미 고정된 것

- root entry snapshot은 analyze 관련 export가 실제 public surface에 포함되는지 고정한다. 근거는 `../../../../packages/core/tests/export-surface.test.ts`다.
- `analyzeTokenBudget`, `analyzeVariableFlow`, `detectDeadCode`, `analyzeComposition`, `analyzePromptChain`, `buildUnifiedCBSGraph`, `buildLorebookRegexCorrelation`, `buildElementPairCorrelationFromUnifiedGraph`, `analyzeLuaSource`, `runCollectPhase`, `runAnalyzePhase`는 현재 `src/domain/index.ts`에서 다시 export된다.
- 이 subtree는 pure domain layer다. filesystem I/O를 직접 소유하지 않는다는 설명은 `../../../../packages/core/core-structure-ko.md`와 `../../../../packages/core/tests/domain-node-structure.test.ts`의 방향과 맞아야 한다.

## CLI analyze routing 메모

`packages/core/src/cli/analyze/workflow.ts` 기준 현재 라우팅 truth는 아래다.

- `--type lua | charx | module | preset | compose`를 명시할 수 있다.
- `--all`은 aggregate mode이며, 기본 `wiki/workspace.yaml` 또는 `--wiki-root` 아래 `workspace.yaml`에 선언된 artifact 목록을 순회한다.
- `.lua`, `.risulua` 파일은 Lua analyze로 간다.
- 디렉토리는 canonical marker를 보고 `module`, `preset`, `charx`를 자동 판별한다.
- `compose`는 auto-detect 없이 명시형이다.

이 라우팅 설명은 CLI 진입 경계만 다룬다. report 형식, 세부 collector, HTML shell 구조는 leaf 페이지로 넘긴다.

## 현재 leaf 페이지

| 주제 | 페이지 |
|---|---|
| token budget | [`token-budget.md`](token-budget.md) |
| variable flow | [`variable-flow.md`](variable-flow.md) |
| dead code | [`dead-code.md`](dead-code.md) |
| composition | [`composition.md`](composition.md) |
| prompt chain | [`prompt-chain.md`](prompt-chain.md) |
| text mention | [`text-mention.md`](text-mention.md) |
| correlation | [`correlation.md`](correlation.md) |
| Lua analysis | [`lua-analysis.md`](lua-analysis.md) |

## subagent 권장 로드 조합

| 작업 유형 | 먼저 읽을 문서 |
|---|---|
| analyze public API 문구 수정 | [`../../common/principles.md`](../../common/principles.md) + [`../../targets/root-browser.md`](../../targets/root-browser.md) + 이 문서 |
| analyze CLI 라우팅 설명 수정 | [`../../common/principles.md`](../../common/principles.md) + [`../../common/testing-and-evidence.md`](../../common/testing-and-evidence.md) + [`../../targets/cli.md`](../../targets/cli.md) + 이 문서 |
| 특정 분석기 leaf 문서 작성 | 이 문서 + 관련 source 1개 또는 2개 + 관련 테스트 |
| root export 검증 | [`../../targets/root-browser.md`](../../targets/root-browser.md) + `../../../../packages/core/tests/export-surface.test.ts` |

## leaf 사용 규칙

- leaf 문서는 입력, 출력, 현재 테스트 근거만 다룬다.
- root entry나 CLI routing 설명을 leaf 문서에 다시 길게 복사하지 않는다.
- subtree 인덱스는 leaf 사이의 역할 분담과 읽는 순서만 요약한다.

## 같이 읽을 문서

- [`../../common/principles.md`](../../common/principles.md)
- [`../../common/testing-and-evidence.md`](../../common/testing-and-evidence.md)
- [`../../targets/root-browser.md`](../../targets/root-browser.md)
- [`../../targets/cli.md`](../../targets/cli.md)
- [`../../node/README.md`](../../node/README.md)
