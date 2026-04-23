# 루트 브라우저 엔트리 (Root Browser Entry)

이 문서는 `risu-workbench-core` 루트 임포트(Import)의 현재 보장 범위와 라우팅만을 다룹니다. 개별 도메인 리프(Leaf)의 상세 의미론은 이 문서에서 다루지 않습니다.

## 현재 명세

- `packages/core/package.json`의 `exports["."]`는 `./dist/index.js`를 가리킵니다.
- `packages/core/src/index.ts`는 현재 `./domain`만을 다시 내보냅니다(Re-export).
- 따라서 루트 엔트리는 브라우저 환경에서 안전하게 사용할 수 있는 공개 인터페이스(Public Surface)로 정의합니다.
- `packages/core/tests/root-entry-contract.test.ts`는 순수 도메인 내보내기가 존재하며, `parseCardFile`, `ensureDir`, `writeJson`, `writeBinary`, `parsePngTextChunks`와 같은 Node.js 전용 헬퍼가 루트에 노출되지 않음을 보증합니다.
- `packages/core/tests/export-surface.test.ts`는 루트 엔트리의 실제 내보내기 키 집합 스냅샷을 확정합니다.

## 라우팅 (Routing)

```text
소비자 임포트 'risu-workbench-core'
  -> package.json exports["."]
  -> dist/index.js
  -> src/index.ts
  -> src/domain/index.ts
  -> 각 도메인 리프 모듈
```

문서에서 루트 엔트리를 설명할 때는 위 경로를 기본 라우팅으로 사용합니다.

## 이 엔트리가 보장하는 사항

- 순수 도메인 헬퍼 및 타입 중심의 공개 인터페이스
- 브라우저 환경에서 안전한 임포트 경계
- 분석(Analyze) 관련 헬퍼를 포함한 도메인 배럴(Barrel) 재내보내기

현재 `src/domain/index.ts`에는 CBS, 커스텀 익스텐션, 로어북, 정규식, 분석, 에셋, 캐릭터/모듈/프리셋 헬퍼가 집약되어 있습니다. 다만, 이 페이지는 "무엇이 루트로 재내보내기되는가"에 집중하며, 각 헬퍼의 상세 의미론은 해당 하위 트리 문서에서 다룹니다.

## 이 엔트리가 보장하지 않는 사항

- 파일 시스템 I/O 헬퍼
- PNG/카드 파싱 헬퍼
- 커스텀 익스텐션 워크스페이스 탐색의 Node.js 런타임 동작
- CLI 서브커맨드 동작

위 내용은 [`node-entry`](node-entry.md) 또는 [`../node/README.md`](../node/README.md)를 참조하십시오.


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
