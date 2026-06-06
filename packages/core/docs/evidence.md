# 문서 근거 규칙

이 문서는 `packages/core` package-local 문서에서 claim을 어떻게 source와 tests에 묶을지 정합니다.

## 우선순위

| 근거 | 사용 범위 |
|---|---|
| `../package.json` | package name, exports, bin, scripts, files |
| `../src/index.ts`, `../src/cbs-browser.ts`, `../src/node/index.ts` | public import surface |
| `../src/cli/main.ts`, `../src/cli/**/workflow.ts` | CLI routing과 workflow 현재 구현 |
| `../src/domain/**`, `../src/simulator/**`, `../src/node/**` | 기능 의미론의 현재 구현 |
| `../tests/**/*.test.ts` | 보장 표현의 근거 |
| `../core-structure-ko.md`, source-local README/MD | 배경 설명. 최종 공개 명세 판정 근거로 단독 사용하지 않음 |

## 표현 규칙

- 구현 파일에서만 확인한 내용은 `현재 코드 기준`, `현재 구현상`처럼 씁니다.
- 테스트가 같은 범위를 직접 검증할 때만 `검증한다`, `보장한다`를 씁니다.
- 저장소 루트 `docs/core/` 문서는 현행화 여부를 별도 검증하지 않았다면 public source of truth로 링크하지 않습니다.
- 패키지 README와 package-local docs의 주요 탐색 링크는 `packages/core` 내부에 둡니다.

## 대표 anchor

| 주제 | source | tests |
|---|---|---|
| root import | `../src/index.ts` | `../tests/root-entry-contract.test.ts`, `../tests/domain-node-structure.test.ts` |
| Node import | `../src/node/index.ts` | `../tests/node-entry.test.ts`, `../tests/domain-node-structure.test.ts` |
| CLI dispatcher | `../src/cli/main.ts` | `../tests/cli-main-dispatch.test.ts`, `../tests/cli-smoke.test.ts` |
| CBS parser/simulator | `../src/domain/cbs/`, `../src/simulator/` | `../tests/domain/cbs/*.test.ts` |
| regex preview | `../src/simulator/regex/` | `../tests/simulator/regex/*.test.ts` |
| editor domain | `../src/domain/editor/` | `../tests/editor/*.test.ts` |
| RisuLua split | `../src/domain/risulua-split/` | `../tests/risulua-split-*.test.ts` |

## 빠른 체크리스트

- 링크가 package root 밖으로 나가야 하는가? 나간다면 배경 자료인지 명확히 표시했는가?
- 문장이 source에서 직접 확인되는가?
- 보장 표현에 대응하는 테스트가 있는가?
- 오래된 계획 문서를 현재 명세처럼 링크하지 않았는가?
