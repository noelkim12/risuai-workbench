# CLI workflow

이 문서는 `risu-core` executable의 현재 command routing을 package-local source 기준으로 요약합니다.

## 최상위 dispatcher

[`../src/cli/main.ts`](../src/cli/main.ts)는 현재 다음 명령어를 등록합니다.

| command | 현재 라우팅 대상 | 설명 |
|---|---|---|
| `extract` | `../src/cli/extract/workflow.ts` | character/module/preset 계열 입력을 canonical workspace 구성으로 분해 |
| `pack` | `../src/cli/pack/workflow.ts` | 추출된 구성요소를 card/module/preset 출력물로 재조립 |
| `analyze` | `../src/cli/analyze/workflow.ts` | lua/charx/module/preset/compose 분석 라우팅 |
| `build` | `../src/cli/build/workflow.ts` | canonical component에서 export JSON 생성 |
| `scaffold` | `../src/cli/scaffold/workflow.ts` | 새 charx/module/preset 프로젝트 구조 생성 |

## Routing

```text
shell
  -> risu-core
  -> bin/risu-core.js
  -> dist/cli/main.js run(argv)
  -> src/cli/main.ts COMMANDS
  -> src/cli/<command>/workflow.ts
```

## Analyze workflow

[`../src/cli/analyze/workflow.ts`](../src/cli/analyze/workflow.ts)는 `--type` 옵션을 우선 보고, 없으면 target 경로와 canonical marker로 타입을 감지합니다. `compose`는 자동 감지 대상이 아니라 `--type compose`가 필요한 explicit workflow입니다.

분석 파이프라인의 상세 관계 모델은 [`../src/cli/analyze/README.md`](../src/cli/analyze/README.md)를 봅니다.

## Source-local CLI 문서

- [`../src/cli/CLI.md`](../src/cli/CLI.md)
- [`../src/cli/analyze/README.md`](../src/cli/analyze/README.md)
- [`../src/cli/extract/workflow-output-structures.md`](../src/cli/extract/workflow-output-structures.md)

## 검증 anchor

- [`../tests/cli-main-dispatch.test.ts`](../tests/cli-main-dispatch.test.ts)
- [`../tests/cli-smoke.test.ts`](../tests/cli-smoke.test.ts)
- [`../tests/analyze-workflow-lazy-loading.test.ts`](../tests/analyze-workflow-lazy-loading.test.ts)
- workflow별 회귀 테스트는 `../tests/*workflow*.test.ts`와 각 domain test를 함께 확인합니다.

## 이 문서가 보장하지 않는 것

- 각 command의 모든 옵션
- 각 workflow phase의 전체 출력 schema
- `dist/`에 생성된 코드의 수동 편집 가능성

상세 옵션과 단계는 각 workflow 파일을 직접 확인합니다.
