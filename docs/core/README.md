# core 문서 인덱스

이 폴더는 `packages/core`의 공개 경계와 하위 트리를, 필요한 페이지만 발췌하여 읽을 수 있도록 구성한 개발 문서입니다. 문서의 신뢰 기준(Source of Truth)은 코드와 테스트를 따르며, 이 폴더는 `packages/core` 문서를 탐색하는 기본 진입점입니다.

## 이 문서는 왜 나뉘었나

- `packages/core`는 루트 브라우저 엔트리, `./node` 하위 경로, `risu-core` CLI, 도메인 하위 트리, Node 헬퍼 하위 트리가 공존하므로, 한 파일에 모든 내용을 담기에는 진입 비용이 큽니다.
- 작업 성격에 따라 참조해야 할 근거가 다릅니다. 내보내기(Export) 경계 수정 시에는 엔트리 문서를, 분석 의미론 확인 시에는 하위 트리 및 리프(Leaf) 문서를 우선 참조해야 합니다.
- 공통 문체와 근거(Evidence) 작성 규칙은 `common/`으로 일원화하고, 엔트리 경계는 `targets/`, 세부 의미론은 `domains/`와 `node/`로 분리하여 중복 설명을 최소화했습니다.

## 디렉토리 구조

```text
docs/core/
├── README.md                         ← 이 파일. 인덱스 + 탐색 가이드
├── common/
│   ├── principles.md                 ← 공통 경계, 용어, 문체 규칙
│   └── testing-and-evidence.md       ← 코드/테스트 근거 작성 규칙
├── targets/
│   ├── root-browser.md               ← `risu-workbench-core` root entry
│   ├── node-entry.md                 ← `risu-workbench-core/node` subpath
│   └── cli.md                        ← `risu-core` 실행 경계와 디스패치
├── domains/
│   ├── analyze/README.md             ← analyze subtree 인덱스
│   ├── analyze/*.md                  ← analyze leaf pages
│   └── *.md                          ← 다른 domain leaf pages
└── node/
    ├── README.md                     ← node subtree 인덱스
    └── *.md                          ← Node helper leaf pages
```

## Entry × Page 매트릭스

현재 public 진입 경계를 어디서 읽어야 하는지의 1차 매트릭스다.

| surface | 먼저 읽을 페이지 | 현재 근거 파일 |
|---|---|---|
| root browser import | [`targets/root-browser.md`](targets/root-browser.md) | `../../packages/core/src/index.ts`, `../../packages/core/tests/root-entry-contract.test.ts`, `../../packages/core/tests/export-surface.test.ts` |
| Node subpath import | [`targets/node-entry.md`](targets/node-entry.md) | `../../packages/core/src/node/index.ts`, `../../packages/core/tests/node-entry.test.ts`, `../../packages/core/tests/domain-node-structure.test.ts` |
| CLI executable | [`targets/cli.md`](targets/cli.md) | `../../packages/core/package.json`, `../../packages/core/bin/risu-core.js`, `../../packages/core/src/cli/main.ts`, `../../packages/core/tests/cli-main-dispatch.test.ts`, `../../packages/core/tests/cli-smoke.test.ts` |
| analyze semantics | [`domains/analyze/README.md`](domains/analyze/README.md) | `../../packages/core/src/domain/analyze/*`, `../../packages/core/src/cli/analyze/workflow.ts`, 관련 테스트 |
| Node helper semantics | [`node/README.md`](node/README.md) | `../../packages/core/src/node/*.ts`, 관련 테스트 |

## Subagent 사용 가이드

subagent가 작업을 시작할 때는 다음 순서로 읽는다.

1. **[공통 원칙](common/principles.md)**, 문서 경계와 용어를 먼저 맞춘다.
2. **[근거 규칙](common/testing-and-evidence.md)**, 현재 문장이 어떤 코드와 테스트에 기대는지 정한다.
3. **[진입 경계 문서](targets/)**, import surface나 CLI boundary를 다룰 때 먼저 읽는다.
4. **subtree 인덱스**, [`domains/analyze/README.md`](domains/analyze/README.md)와 [`node/README.md`](node/README.md) 중 필요한 쪽으로 내부 leaf 범위를 좁힌다.
5. **관련 leaf 페이지**, 필요한 의미론만 읽는다.
6. **관련 source/test**, 마지막에 실제 구현과 테스트로 문장을 고정한다.

### 작업 유형별 권장 로드 조합

| 작업 유형 | 권장 로드 파일 |
|---|---|
| root export 문구 수정 | `common/principles.md` + `common/testing-and-evidence.md` + `targets/root-browser.md` |
| Node subpath 문구 수정 | `common/principles.md` + `common/testing-and-evidence.md` + `targets/node-entry.md` + `node/README.md` |
| CLI boundary 설명 수정 | `common/principles.md` + `common/testing-and-evidence.md` + `targets/cli.md` |
| analyze leaf 문서 수정 | `common/principles.md` + `common/testing-and-evidence.md` + `domains/analyze/README.md` + 관련 leaf |
| Node helper leaf 문서 수정 | `common/principles.md` + `common/testing-and-evidence.md` + `node/README.md` + 관련 leaf |
| 새 문서가 어느 subtree에 속하는지 판단 | 이 문서 + `common/principles.md` |

## 페이지 로딩 매트릭스

세부 주제가 어느 페이지에 있는지 빠르게 고를 때 쓴다.

| 주제 | 페이지 |
|---|---|
| 공통 경계, 문체, source of truth | [`common/principles.md`](common/principles.md) |
| claim을 코드/테스트에 묶는 법 | [`common/testing-and-evidence.md`](common/testing-and-evidence.md) |
| root browser import | [`targets/root-browser.md`](targets/root-browser.md) |
| Node import | [`targets/node-entry.md`](targets/node-entry.md) |
| CLI 바이너리, 커맨드 디스패치 | [`targets/cli.md`](targets/cli.md) |
| analyze subtree entry | [`domains/analyze/README.md`](domains/analyze/README.md) |
| CBS domain | [`domains/cbs.md`](domains/cbs.md) |
| custom-extension domain | [`domains/custom-extension.md`](domains/custom-extension.md) |
| lorebook domain | [`domains/lorebook.md`](domains/lorebook.md) |
| regex domain | [`domains/regex.md`](domains/regex.md) |
| module domain | [`domains/module.md`](domains/module.md) |
| preset domain | [`domains/preset.md`](domains/preset.md) |
| charx domain | [`domains/charx.md`](domains/charx.md) |
| asset domain | [`domains/asset.md`](domains/asset.md) |
| token budget | [`domains/analyze/token-budget.md`](domains/analyze/token-budget.md) |
| variable flow | [`domains/analyze/variable-flow.md`](domains/analyze/variable-flow.md) |
| dead code | [`domains/analyze/dead-code.md`](domains/analyze/dead-code.md) |
| composition | [`domains/analyze/composition.md`](domains/analyze/composition.md) |
| prompt chain | [`domains/analyze/prompt-chain.md`](domains/analyze/prompt-chain.md) |
| text mention | [`domains/analyze/text-mention.md`](domains/analyze/text-mention.md) |
| correlation | [`domains/analyze/correlation.md`](domains/analyze/correlation.md) |
| Lua analysis | [`domains/analyze/lua-analysis.md`](domains/analyze/lua-analysis.md) |
| fs helper | [`node/fs-helpers.md`](node/fs-helpers.md) |
| PNG helper | [`node/png.md`](node/png.md) |
| charx/card I/O | [`node/charx-io.md`](node/charx-io.md) |
| lorebook I/O | [`node/lorebook-io.md`](node/lorebook-io.md) |
| JSON listing | [`node/json-listing.md`](node/json-listing.md) |
| rpack | [`node/rpack.md`](node/rpack.md) |
| custom-extension discovery | [`node/custom-extension-discovery.md`](node/custom-extension-discovery.md) |

## 파일 수정 규칙

- root package, Node subpath, CLI executable 경계는 각각 `targets/root-browser.md`, `targets/node-entry.md`, `targets/cli.md`가 먼저 설명한다.
- subtree 인덱스는 leaf를 소개하고 읽는 순서를 정한다. leaf가 이미 있으면 인덱스에서 링크로 연결하고, 인덱스 안에 상세 의미론을 다시 길게 복사하지 않는다.
- claim은 항상 구현 파일과 테스트 파일에 같이 묶는다. 관찰된 코드가 있어도 테스트가 없으면 `코드 기준`, `현재 구현`처럼 적고, 보장으로 승격하지 않는다.
- 새 문장은 상대 링크만 쓴다.
- `docs/core/` 밖 문서는 이 폴더의 근거로 참조할 수는 있지만, 여기 문장을 대신 고정하는 canonical page로 취급하지 않는다.

## 같이 읽을 문서

- [`common/principles.md`](common/principles.md)
- [`common/testing-and-evidence.md`](common/testing-and-evidence.md)
- [`targets/root-browser.md`](targets/root-browser.md)
- [`targets/node-entry.md`](targets/node-entry.md)
- [`targets/cli.md`](targets/cli.md)
- [`domains/analyze/README.md`](domains/analyze/README.md)
- [`node/README.md`](node/README.md)
