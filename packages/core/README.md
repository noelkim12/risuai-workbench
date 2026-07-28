# @risuai-workbench/core

RisuAI Workbench의 재사용 가능한 core engine package입니다.

> RisuAI와 제휴·승인되지 않은 비공식 companion 도구입니다.

이 패키지는 RisuAI 아티팩트를 다루는 순수 도메인 로직, Node.js I/O 어댑터, `risu-core` CLI workflow를 한곳에 모읍니다. 다른 패키지는 이 패키지의 공개 경계를 통해 CharX, module, preset, CBS, Lua, lorebook, regex 관련 로직을 재사용합니다.

> **패키지:** `packages/core/`  
> **root import:** `@risuai-workbench/core`
> **browser CBS import:** `@risuai-workbench/core/cbs-browser`
> **Node import:** `@risuai-workbench/core/node`
> **CLI:** `risu-core`

## 언제 쓰나요?

- 브라우저나 webview에서 Node.js I/O 없이 core domain helper를 써야 할 때
- Node.js 도구에서 CharX/card, PNG text chunk, rpack, canonical workspace file을 읽고 써야 할 때
- `.charx`, `.risum`, `.risup` 계열 아티팩트를 추출, 패킹, 분석, 빌드, 스캐폴딩해야 할 때
- CBS/Lua/lorebook/regex/variable 관계를 batch 분석하거나 리포트로 만들어야 할 때
- RisuAI runtime을 직접 호출하지 않고 CBS preview나 regex preview를 dry-run 해야 할 때

## Public surface

| surface | import / command | 역할 | package-local 문서 |
|---|---|---|---|
| root browser entry | `@risuai-workbench/core` | Node.js I/O 없는 domain 중심 public API | [`docs/public-surface.md`](docs/public-surface.md) |
| browser CBS entry | `@risuai-workbench/core/cbs-browser` | webview/browser용 CBS registry, lorebook decorator, protocol guard | [`docs/public-surface.md`](docs/public-surface.md) |
| Node entry | `@risuai-workbench/core/node` | filesystem, PNG/card I/O, JSON listing, rpack, custom-extension discovery | [`docs/public-surface.md`](docs/public-surface.md) |
| CLI executable | `risu-core` | extract, pack, analyze, build, scaffold 실행 표면 | [`docs/cli.md`](docs/cli.md) |

각 surface는 서로 다른 계약입니다. root import는 browser-safe surface이고, Node helper는 `@risuai-workbench/core/node`로 분리됩니다. `risu-core`는 라이브러리 import가 아니라 executable boundary입니다.

## Node 전용 RisuLua Fengari runtime

`@risuai-workbench/core/node`는 canonical module map이나 생성된 dist Lua를 격리된 Fengari Worker에서 실행할 수 있습니다. browser-safe root entry에는 Worker와 Fengari가 포함되지 않습니다.

```ts
import { executeRisuLua } from '@risuai-workbench/core/node';

const result = await executeRisuLua({
  moduleMap: {
    entryModuleId: 'main',
    modules: {
      main: 'return { add = function(a, b) return a + b end }',
    },
  },
  target: { kind: 'export', exportName: 'add', args: [2, 3] },
  hostProfile: 'minimal',
});
```

각 요청은 새 Worker와 Lua state를 사용합니다. `require`는 전달된 module map만 읽고 `io`, `os`, `debug`, `package`, `load`, `loadfile`, `dofile`, filesystem, network를 노출하지 않습니다. Lua bytecode나 JavaScript callback도 입력으로 받지 않습니다.

| profile | 제공하는 RisuAI 호환 함수 |
|---|---|
| `minimal` | `async`, 결정적 `math.random` |
| `button-action` | `minimal` + chat/global variable get/set, alert, display reload, addChat |
| `chat-state` | `button-action` + state get/set |

기본 상한은 module 2 MiB, bundle 8 MiB, wall-clock 2초, Lua instruction 1,000,000회, host call 1,000회, retained trace 2,000건입니다. 호출자가 더 큰 값을 요청해도 이 상한을 넘지 않습니다. `runRisuLuaSmoke`는 JSON equality 기반 smoke assertion과 canonical/dist parity를 제공하며 별도 표현식 언어는 실행하지 않습니다.

이 runtime은 회귀 테스트와 함수 디버깅을 위한 결정적 부분 구현입니다. 실제 RisuAI 브라우저 lifecycle, chat application 전체 동작, filesystem/network side effect를 에뮬레이션하지 않습니다.

## 빠른 시작

저장소 루트에서 실행합니다.

```bash
npm run build --workspace @risuai-workbench/core
npm test --workspace @risuai-workbench/core
npm run lint --workspace @risuai-workbench/core
node packages/core/bin/risu-core.js --help
```

패키지 내부 스크립트는 [`package.json`](package.json)을 기준으로 합니다.

| script | 목적 |
|---|---|
| `build` | TypeScript build, alias 정리, report shell asset 복사 |
| `test` | `tests/**/*.test.ts` Vitest 실행 |
| `lint` | `src/**/*.ts` ESLint 검사 |
| `format:check` | `src/**/*.ts` Prettier 검사 |

## 아키텍처 레이어

```text
packages/core/
├── docs/            package-local 문서
├── src/domain/      순수 도메인 로직. Node.js I/O 없음
├── src/node/        Node.js runtime adapter. fs, buffer, PNG, card I/O
├── src/cli/         risu-core command dispatcher와 workflow orchestration
├── src/simulator/   CBS/regex preview용 local dry-run evaluator
├── src/shared/      내부 호환성 및 convenience facade
├── src/utils/       공용 소형 유틸리티
├── bin/             배포 CLI shim
├── assets/          pack workflow 등에서 쓰는 정적 자산
└── tests/           entry, boundary, workflow, domain 회귀 테스트
```

기본 규칙은 단순합니다.

- 메모리 안의 값만 다루는 재사용 로직은 `src/domain/`에 둡니다.
- 파일시스템, buffer, PNG, archive, runtime adapter는 `src/node/`에 둡니다.
- command dispatch와 단계별 orchestration은 `src/cli/**/workflow.ts`에 둡니다.
- `src/shared/`는 내부 호환성 경로입니다. 1차 외부 계약은 root entry와 `./node` entry입니다.
- `dist/`, `.tmp/`, `node_modules/`는 source of truth가 아닙니다.

## 주요 기능

| 영역 | 대표 기능 | package-local 문서 / 근거 |
|---|---|---|
| Public surface | root, cbs-browser, node, CLI 경계 | [`docs/public-surface.md`](docs/public-surface.md) |
| Domain feature map | CBS, regex, lorebook, analyze, custom-extension, editor | [`docs/features.md`](docs/features.md) |
| CLI workflow | extract, pack, analyze, build, scaffold | [`docs/cli.md`](docs/cli.md) |
| 검증 근거 | source/test anchor와 claim 범위 | [`docs/evidence.md`](docs/evidence.md) |
| CBS simulator | preview, trace, diagnostics, context injection | [`src/simulator/README.md`](src/simulator/README.md) |
| Analyze pipeline | `collect -> correlate/analyze -> report`, 관계 네트워크 | [`src/cli/analyze/README.md`](src/cli/analyze/README.md) |
| Editor domain | `.risulorebook`, `.risuregex`, `.risuprompt`, `.risuhtml` document model | [`src/domain/editor/README.md`](src/domain/editor/README.md) |

README는 전체 API 목록을 반복하지 않습니다. 현재 export surface는 `src/index.ts`, `src/cbs-browser.ts`, `src/node/index.ts`, `src/domain/index.ts`를 기준으로 확인합니다.

## 이 패키지가 하지 않는 일

- VS Code UI, webview layout, editor watching을 직접 소유하지 않습니다.
- 실제 RisuAI chat runtime을 호출하거나 runtime state를 변경하지 않습니다.
- MCP patch preview/apply 같은 agent-facing mutation flow를 직접 제공하지 않습니다.
- root browser entry에서 Node.js filesystem helper를 노출하지 않습니다.
- README에서 개별 helper의 전체 의미론을 확정하지 않습니다. 세부 의미론은 package-local `docs/`, source, tests를 기준으로 확인합니다.

## 문서 세트

| 문서 | 역할 |
|---|---|
| [`docs/README.md`](docs/README.md) | package-local 문서 인덱스 |
| [`docs/public-surface.md`](docs/public-surface.md) | root / cbs-browser / node / CLI 공개 경계 |
| [`docs/features.md`](docs/features.md) | 기능군별 현재 코드 기준 지도 |
| [`docs/cli.md`](docs/cli.md) | `risu-core` CLI workflow 지도 |
| [`docs/evidence.md`](docs/evidence.md) | source/test 근거와 문서 claim 규칙 |
| [`core-structure-ko.md`](core-structure-ko.md) | 구조 파악용 보조 문서 |
| [`src/simulator/README.md`](src/simulator/README.md) | CBS simulator와 regex preview simulator |
| [`src/domain/editor/README.md`](src/domain/editor/README.md) | editor document model과 serializer 정책 |
| [`src/cli/analyze/README.md`](src/cli/analyze/README.md) | analyze pipeline과 관계 네트워크 모델 |

저장소 루트의 `docs/core/` 문서들은 배경 자료로 참고할 수 있습니다. 이 README는 그 문서들이 모두 현행화되어 있다고 가정하지 않습니다. 공개 명세 판단은 이 패키지의 source와 tests를 우선합니다.

## 변경할 때의 기준

- 공개 데이터 모델이나 pure helper가 바뀌면 `src/domain/`와 [`docs/features.md`](docs/features.md)를 먼저 확인합니다.
- Node.js 파일/buffer/runtime adapter가 바뀌면 `src/node/`와 [`docs/public-surface.md`](docs/public-surface.md)를 확인합니다.
- CLI 동작이 바뀌면 `src/cli/<command>/workflow.ts`와 [`docs/cli.md`](docs/cli.md)를 확인합니다.
- export surface가 바뀌면 `src/index.ts`, `src/cbs-browser.ts`, `src/node/index.ts`, `package.json`, 관련 entry contract test를 함께 확인합니다.
- 구현만 바뀌고 테스트가 없으면 문서에서는 `현재 구현상`, `코드 기준`처럼 보장 범위를 좁혀 씁니다.

## License

GPL-3.0-only
