# node entry

이 문서는 `risu-workbench-core/node` subpath의 현재 보장 범위와 라우팅만 다룬다. Node helper 내부 의미론은 leaf 문서에서 풀고, 여기서는 public entry boundary만 고정한다.

## 현재 계약

- `packages/core/package.json`의 `exports["./node"]`는 `./dist/node/index.js`다.
- public import 경로는 `risu-workbench-core/node`다.
- `packages/core/src/node/index.ts`는 Node 전용 helper를 묶어 다시 export한다.
- `packages/core/tests/node-entry.test.ts`는 subpath export 선언과 built node entry의 대표 helper 노출을 검증한다.
- `packages/core/tests/export-surface.test.ts`는 node entry의 실제 exported key set snapshot을 고정한다.
- `packages/core/tests/domain-node-structure.test.ts`는 `parseCardFile`, `parseCharxFile`, `ensureDir` 같은 helper가 node entry에 있고 domain entry에는 없다는 점을 같이 검증한다.

## routing

```text
consumer import 'risu-workbench-core/node'
  -> package.json exports["./node"]
  -> dist/node/index.js
  -> src/node/index.ts
  -> 각 Node adapter module
```

CLI는 별도 경로다. `risu-core` 바이너리는 `src/cli/main.ts`로 들어가며, `./node` subpath를 그대로 대신하지 않는다. CLI 경계는 [`cli.md`](cli.md)에서 따로 다룬다.

## 이 entry가 보장하는 것

- filesystem helper access
- PNG/card parsing helper access
- lorebook/json listing helper access
- rpack encode helper access
- custom-extension workspace discovery helper access

현재 export 묶음의 자세한 목록은 [`../node/README.md`](../node/README.md)에 정리한다.

## 이 entry가 보장하지 않는 것

- browser-safe import surface
- pure domain helper의 전체 의미론 설명
- CLI command dispatch와 help text contract
- analyze workflow의 세부 라우팅 규칙

그 내용은 [`root-browser`](root-browser.md), [`../domains/analyze/README.md`](../domains/analyze/README.md), `packages/core/src/cli/main.ts`, `packages/core/src/cli/analyze/workflow.ts`에서 다룬다.

## 언제 이 페이지를 먼저 읽나

| 작업 유형 | 이유 |
|---|---|
| Node 전용 public import 문구 수정 | `./node` subpath 계약을 직접 다루기 때문 |
| root와 node export 경계 점검 | 어떤 helper가 어느 entry에 있어야 하는지 나누기 때문 |
| fs/png/workspace discovery leaf 문서 시작 | public 진입 경계를 먼저 맞춰야 하기 때문 |

## 관련 근거 파일

- `../../packages/core/package.json`
- `../../packages/core/src/node/index.ts`
- `../../packages/core/tests/node-entry.test.ts`
- `../../packages/core/tests/domain-node-structure.test.ts`
- `../../packages/core/tests/export-surface.test.ts`
- `../../packages/core/src/cli/main.ts`

## 같이 읽을 문서

- [`../common/principles.md`](../common/principles.md)
- [`../common/testing-and-evidence.md`](../common/testing-and-evidence.md)
- [`../node/README.md`](../node/README.md)
- [`cli.md`](cli.md)
- [`root-browser.md`](root-browser.md)
- [`../domains/analyze/README.md`](../domains/analyze/README.md)
