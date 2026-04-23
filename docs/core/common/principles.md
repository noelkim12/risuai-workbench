# core 문서 공통 원칙

이 문서는 `docs/core/` 하위 문서에서 사용하는 표준 용어 및 문구 가이드입니다. `packages/core` 관련 문서를 새로 작성하거나 수정할 때는 이 페이지를 최우선 기준으로 삼으며, 상세 명세는 각 대상(Target) 문서와 하위 트리 인덱스를 순차적으로 참조하십시오.

## 신뢰 기준 (Source of Truth)

- 문서가 보증하는 사실은 실제 코드와 테스트 결과를 근거로 합니다. 현재 기준 파일은 `../../../packages/core/package.json`, `../../../packages/core/src/index.ts`, `../../../packages/core/src/node/index.ts`, `../../../packages/core/src/domain/index.ts`, `../../../packages/core/src/cli/main.ts`입니다.
- 엔트리포인트 명세는 `../../../packages/core/tests/root-entry-contract.test.ts`, `../../../packages/core/tests/node-entry.test.ts`, `../../../packages/core/tests/domain-node-structure.test.ts`, `../../../packages/core/tests/export-surface.test.ts`, `../../../packages/core/tests/cli-main-dispatch.test.ts`에서 확정합니다.
- `../../../packages/core/core-structure-ko.md`는 전체 구조를 파악하기 좋은 요약본이지만, 공개 명세에 대한 최종 판단은 항상 코드와 테스트가 우선합니다.
- 미래의 희망 사항, 리팩터링 아이디어, 작성 예정인 하위 문서의 내용은 확정된 명세처럼 기술하지 않습니다.

## 문서 경계

`docs/core/`는 아래 네 계층으로 구성합니다.

| 계층 | 역할 | 주요 문서 |
|---|---|---|
| common | 공통 용어, 문구 템플릿, 작성 규칙, 근거(Evidence) 작성 가이드 | `principles.md`, `testing-and-evidence.md` |
| targets | 공개 엔트리포인트의 보장 범위와 라우팅 명세 | `../targets/root-browser.md`, `../targets/node-entry.md`, `../targets/cli.md` |
| domains | 순수 도메인 하위 트리 인덱스 및 리프 분리 기준 | `../domains/analyze/README.md` |
| node | Node.js 전용 하위 트리 인덱스 및 리프 분리 기준 | `../node/README.md` |

대상(Target) 문서는 엔트리포인트 보장 범위와 라우팅만을 다룹니다. 리프(Leaf) 수준의 상세 의미론, 알고리즘 세부 사항, 개별 헬퍼 명세는 하위 리프 페이지에서 상세히 기술합니다.

## 현재 패키지 경계

### root browser entry

- 패키지 root import 경로는 `risu-workbench-core`다.
- `../../../packages/core/package.json`의 `exports["."]`는 `./dist/index.js`를 가리킨다.
- `../../../packages/core/src/index.ts`는 현재 `./domain`만 다시 export한다.
- 따라서 root entry는 브라우저 안전 public surface로 읽는다. Node I/O helper는 여기서 계약하지 않는다.

### node entry

- Node 전용 import 경로는 `risu-workbench-core/node`다.
- `../../../packages/core/package.json`의 `exports["./node"]`는 `./dist/node/index.js`를 가리킨다.
- `../../../packages/core/src/node/index.ts`는 filesystem helper, PNG/card parser, lorebook/json listing, rpack encode, custom-extension workspace discovery를 묶어 다시 export한다.
- 이 경로는 Node 런타임 의존 surface다. root browser entry와 섞어 설명하지 않는다.

### CLI surface

- 실행 surface는 라이브러리 import가 아니라 `risu-core` 바이너리다.
- `../../../packages/core/src/cli/main.ts`는 `extract`, `pack`, `analyze`, `build`, `scaffold`를 디스패치한다.
- CLI는 public package root나 `./node` subpath의 대체 표현이 아니다. 별도 executable contract로 적는다.

## current truth를 쓰는 방식

- `현재`, `지금`, `코드 기준` 같은 표현은 실제 파일과 테스트가 뒷받침할 때만 쓴다.
- 문서가 다루는 범위 밖이면 `이 페이지는 다루지 않음`, `later leaf page에서 다룸`처럼 경계를 먼저 적는다.
- root entry 문서에서 개별 analyze 알고리즘을 풀지 않는다.
- node entry 문서에서 pure domain 의미론을 풀지 않는다.
- subtree 인덱스 문서에서 공개 엔트리포인트 보장을 새로 만들지 않는다.

## subagent 권장 로드 순서

1. 이 문서로 공통 경계를 맞춘다.
2. claim을 어떻게 고정할지 먼저 [`testing-and-evidence.md`](testing-and-evidence.md)에서 맞춘다.
3. 작업이 public import 문제면 [`../targets/root-browser.md`](../targets/root-browser.md), [`../targets/node-entry.md`](../targets/node-entry.md), [`../targets/cli.md`](../targets/cli.md) 중 해당 entry를 읽는다.
4. 작업이 subtree 정리면 [`../domains/analyze/README.md`](../domains/analyze/README.md) 또는 [`../node/README.md`](../node/README.md)를 읽는다.
5. 그다음 관련 source/test를 바로 읽는다.

## 문체 규칙

- 한국어는 짧고 단정하게 쓴다.
- 구현 우선, 현재 truth 우선으로 쓴다.
- 상대 링크만 쓴다.
- 문서 바깥 계약을 끌어오지 않는다.

## 같이 읽을 문서

- [`../targets/root-browser.md`](../targets/root-browser.md)
- [`../targets/node-entry.md`](../targets/node-entry.md)
- [`testing-and-evidence.md`](testing-and-evidence.md)
- [`../targets/cli.md`](../targets/cli.md)
- [`../domains/analyze/README.md`](../domains/analyze/README.md)
- [`../node/README.md`](../node/README.md)
