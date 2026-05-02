# 분석 도메인 (Analyze Domain)

이 문서는 `packages/core` 분석 하위 트리(Analyze Subtree)의 인덱스입니다. `packages/core/src/domain/analyze/` 및 `packages/core/src/cli/analyze/` 구현에 따라 하위 리프(Leaf) 페이지의 탐색 우선순위와 참조 경로를 정의합니다.

## 이 하위 트리가 담당하는 범위

- `packages/core/src/domain/analyze/`는 순수 분석 로직만을 포함합니다.
- 공개 임포트는 루트 브라우저 엔트리를 통해 노출됩니다. 현재 내보내기 경로는 [`../../targets/root-browser.md`](../../targets/root-browser.md) 명세를 따릅니다.
- CLI 분석은 별도의 실행 인터페이스이며, `packages/core/src/cli/analyze/workflow.ts`에서 `lua`, `charx`, `module`, `preset`, `compose` 명령어로 라우팅됩니다. CLI 경계 요약은 [`../../targets/cli.md`](../../targets/cli.md)를 참조하십시오.
- 이 페이지는 각 분석기의 세부 규칙을 중복하여 기술하지 않습니다. 상세 알고리즘은 하위 리프 페이지에서 다룹니다.

## 현재 파일 구성

| 구분 | 관련 파일 |
|---|---|
| 공통 분석 프리미티브 | `constants.ts`, `token-budget.ts`, `variable-flow.ts`, `variable-flow-types.ts`, `dead-code.ts`, `composition.ts`, `prompt-chain.ts`, `text-mention.ts`, `correlation.ts` |
| Lua 분석 | `lua-api.ts`, `lua-helpers.ts`, `lua-analysis-types.ts`, `lua-collector.ts`, `lua-analyzer.ts`, `lua-core.ts` |
| CLI 라우팅 | `../../../../packages/core/src/cli/analyze/workflow.ts` |

위 파일들은 현재 `../../../../packages/core/src/domain/index.ts`를 통해 루트 엔트리로 재내보내기됩니다.

## 공개 인터페이스 확정 사항

- 루트 엔트리 스냅샷은 분석 관련 내보내기가 실제 공개 인터페이스에 포함됨을 보증합니다. 근거는 `../../../../packages/core/tests/export-surface.test.ts`입니다.
- `analyzeTokenBudget`, `analyzeVariableFlow`, `detectDeadCode`, `analyzeComposition`, `analyzePromptChain`, `buildUnifiedCBSGraph`, `buildLorebookRegexCorrelation`, `buildElementPairCorrelationFromUnifiedGraph`, `analyzeLuaSource`, `runCollectPhase`, `runAnalyzePhase` 함수가 현재 `src/domain/index.ts`에서 다시 내보내기됩니다.
- 이 하위 트리는 순수 도메인 계층(Pure Domain Layer)입니다. 파일 시스템 I/O를 직접 소유하지 않는다는 원칙은 `../../../../packages/core/core-structure-ko.md` 및 `../../../../packages/core/tests/domain-node-structure.test.ts`의 방향성과 일치해야 합니다.

## CLI 분석 라우팅 명세

`packages/core/src/cli/analyze/workflow.ts` 기준, 현재 라우팅에 대한 신뢰 기준(Source of Truth)은 다음과 같습니다.

- `--type lua | charx | module | preset | compose` 옵션을 명시할 수 있습니다.
- `--all`은 집계 모드(Aggregate Mode)이며, 기본 `wiki/workspace.yaml` 또는 `--wiki-root` 경로 하위의 `workspace.yaml`에 선언된 아티팩트 목록을 순회합니다.
- `.lua`, `.risulua` 파일은 Lua 분석 워크플로우로 전달됩니다.
- 디렉토리는 표준 마커(Canonical Marker)를 분석하여 `module`, `preset`, `charx` 타입을 자동으로 판별합니다.
- `compose` 명령어는 자동 감지 대상이 아니며 반드시 명시적으로 호출해야 합니다.

이 라우팅 설명은 CLI 진입 경계만을 다룹니다. 리포트 형식, 세부 수집기(Collector), HTML 셸 구조는 하위 리프 페이지를 참조하십시오.


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
