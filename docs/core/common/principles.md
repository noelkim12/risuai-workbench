# core 문서 공통 원칙

이 문서는 `docs/core/`의 canonical wording page다. `packages/core` 관련 문서를 새로 쓰거나 고칠 때는 이 페이지를 먼저 기준으로 잡고, 세부 계약은 각 target 문서와 subtree 인덱스에서 이어서 읽는다.

## source of truth

- 문서 truth는 코드와 테스트를 따라간다. 현재 기준 파일은 `../../../packages/core/package.json`, `../../../packages/core/src/index.ts`, `../../../packages/core/src/node/index.ts`, `../../../packages/core/src/domain/index.ts`, `../../../packages/core/src/cli/main.ts`다.
- 엔트리포인트 계약은 `../../../packages/core/tests/root-entry-contract.test.ts`, `../../../packages/core/tests/node-entry.test.ts`, `../../../packages/core/tests/domain-node-structure.test.ts`, `../../../packages/core/tests/export-surface.test.ts`, `../../../packages/core/tests/cli-main-dispatch.test.ts`가 고정한다.
- `../../../packages/core/core-structure-ko.md`는 구조 설명의 좋은 요약이지만, 공개 계약 판단은 항상 코드와 테스트가 우선이다.
- 미래 희망사항, refactor 아이디어, leaf 문서 예정 내용은 현재 계약처럼 쓰지 않는다.

## 문서 경계

`docs/core/`는 아래 네 층으로 나눈다.

| 층 | 역할 | 이 폴더의 현재 문서 |
|---|---|---|
| common | 공통 용어, 경계 문장, 작성 규칙, evidence 규칙 | `principles.md`, `testing-and-evidence.md` |
| targets | 공개 엔트리포인트의 보장 범위와 라우팅 | `../targets/root-browser.md`, `../targets/node-entry.md`, `../targets/cli.md` |
| domains | 순수 도메인 subtree 인덱스와 leaf 분리 기준 | `../domains/analyze/README.md` |
| node | Node 전용 subtree 인덱스와 leaf 분리 기준 | `../node/README.md` |

target 문서는 entrypoint 보장과 routing만 다룬다. leaf 의미론, 알고리즘 세부, 개별 helper 스펙은 later leaf page로 넘긴다.

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
