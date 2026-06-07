# core package 문서 인덱스

이 폴더는 `packages/core` 안에서 닫히는 package-local 문서입니다.

저장소 루트의 `docs/core/` 문서는 배경 자료로 참고할 수 있지만, 이 폴더는 그 문서들의 현행화를 전제로 하지 않습니다. 공개 경계와 기능 설명은 현재 패키지의 source와 tests를 우선합니다.

## 문서 목록

| 문서 | 역할 | 우선 근거 |
|---|---|---|
| [`public-surface.md`](public-surface.md) | root, cbs-browser, node, CLI 공개 경계 | `../package.json`, `../src/index.ts`, `../src/cbs-browser.ts`, `../src/node/index.ts`, `../src/cli/main.ts` |
| [`features.md`](features.md) | 기능군별 현재 코드 기준 지도 | `../src/domain/`, `../src/simulator/`, `../src/cli/analyze/` |
| [`cli.md`](cli.md) | `risu-core` workflow 지도 | `../src/cli/main.ts`, `../src/cli/**/workflow.ts` |
| [`evidence.md`](evidence.md) | claim을 source/test에 묶는 규칙 | `../tests/` |

## Source of Truth

- 공개 export와 bin은 [`../package.json`](../package.json), [`../src/index.ts`](../src/index.ts), [`../src/cbs-browser.ts`](../src/cbs-browser.ts), [`../src/node/index.ts`](../src/node/index.ts)를 우선합니다.
- CLI 라우팅은 [`../src/cli/main.ts`](../src/cli/main.ts)와 각 workflow 파일을 우선합니다.
- 기능 의미론은 `../src/domain/`, `../src/simulator/`, `../src/cli/`의 현재 구현을 우선합니다.
- 보장 표현은 관련 테스트가 있을 때만 씁니다.

## 같이 읽을 package-local 문서

- [`../README.md`](../README.md)
- [`../core-structure-ko.md`](../core-structure-ko.md)
- [`../src/simulator/README.md`](../src/simulator/README.md)
- [`../src/domain/editor/README.md`](../src/domain/editor/README.md)
- [`../src/cli/analyze/README.md`](../src/cli/analyze/README.md)
