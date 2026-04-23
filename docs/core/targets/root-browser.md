# root browser entry

이 문서는 `risu-workbench-core` root import의 현재 보장 범위와 라우팅만 다룬다. 개별 domain leaf 의미론은 여기서 늘리지 않는다.

## 현재 계약

- `packages/core/package.json`의 `exports["."]`는 `./dist/index.js`다.
- `packages/core/src/index.ts`는 현재 `./domain`만 다시 export한다.
- 따라서 root entry는 browser-safe public surface로 읽는다.
- `packages/core/tests/root-entry-contract.test.ts`는 pure domain export가 존재하고 `parseCardFile`, `ensureDir`, `writeJson`, `writeBinary`, `parsePngTextChunks` 같은 Node helper가 root에 나오지 않는다는 점을 고정한다.
- `packages/core/tests/export-surface.test.ts`는 root entry의 실제 exported key set snapshot을 고정한다.

## routing

```text
consumer import 'risu-workbench-core'
  -> package.json exports["."]
  -> dist/index.js
  -> src/index.ts
  -> src/domain/index.ts
  -> 각 domain leaf module
```

문서에서 root entry를 설명할 때는 이 경로를 기본 라우팅으로 쓴다.

## 이 entry가 보장하는 것

- 순수 domain helper와 타입 중심 public surface
- 브라우저 안전 import 경계
- analyze 관련 helper를 포함한 domain barrel 재export

현재 `src/domain/index.ts`에는 CBS, custom-extension, lorebook, regex, analyze, asset, charx/module/preset helper가 함께 모여 있다. 다만 이 페이지는 "무엇이 root로 다시 export되는가"까지만 다루고, 각 helper의 세부 의미론은 각 subtree 문서로 넘긴다.

## 이 entry가 보장하지 않는 것

- filesystem I/O helper
- PNG/card parsing helper
- custom-extension workspace discovery의 Node runtime 동작
- CLI 서브커맨드 동작

이런 내용은 [`node-entry`](node-entry.md)나 [`../node/README.md`](../node/README.md)로 보낸다.

## 언제 이 페이지를 먼저 읽나

| 작업 유형 | 이유 |
|---|---|
| public import surface 설명 수정 | root package import 계약을 직접 다루기 때문 |
| 브라우저 안전성 경계 확인 | node-only helper가 root로 새지 않아야 하기 때문 |
| analyze helper를 어디서 import하는지 설명 | analyze subtree도 현재 root barrel을 통해 나가기 때문 |

## 관련 근거 파일

- `../../packages/core/package.json`
- `../../packages/core/src/index.ts`
- `../../packages/core/src/domain/index.ts`
- `../../packages/core/tests/root-entry-contract.test.ts`
- `../../packages/core/tests/domain-node-structure.test.ts`
- `../../packages/core/tests/export-surface.test.ts`

## 같이 읽을 문서

- [`../common/principles.md`](../common/principles.md)
- [`../domains/analyze/README.md`](../domains/analyze/README.md)
- [`../node/README.md`](../node/README.md)
- [`node-entry.md`](node-entry.md)
