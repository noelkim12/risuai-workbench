# RisuLua runtime 개선 제안

이 문서는 최근 OpenCode 세션에서 확인된 `risulua.debug_call` 사용 실패와 반복 비용을 근거로, MCP runtime surface에서 실제로 개선해야 할 항목을 정리합니다. 현재 사용법은 [`risulua-runtime.md`](risulua-runtime.md), 장애 대응은 [`troubleshooting.md`](troubleshooting.md)를 봅니다.

## 분석 요약

최근 3일간 RisuAI Workbench workspace의 OpenCode 기록에서 다음을 확인했습니다.

| 항목                           | 관측값 |
| ------------------------------ | -----: |
| 분석한 session                 |    596 |
| `risulua.debug_call` 호출      |  2,135 |
| runtime `status: "ok"`         |  1,378 |
| structured runtime error       |    366 |
| `INVALID_ARGS`                 |    317 |
| MCP tool error                 |     68 |
| MCP `-32001 Request timed out` |     65 |
| workspace source 호출          |  2,065 |
| `exportName: "run"` 호출       |  1,168 |
| `risulua.runtime_smoke` 호출   |    109 |

정상 완료 호출의 중앙값은 약 892ms, p95는 약 2.25초였습니다. 이 수치는 `debug_call` 실행 엔진이 전면적으로 고장 난 것이 아니라, 입력 discovery, 큰 workspace 실행, timeout 경계, 반복 source resolution에 집중된 문제가 있음을 보여 줍니다.

## P0. 유효한 runtime 입력을 생성하는 schema discovery

### 문제

`workbench.prepare_action`은 `source`를 `type: "union"`으로만 표시하고 실행 예제를 제공하지 않습니다. validation 실패 시 생성되는 retry도 `source: {}`를 포함하므로 다시 실패할 수 있습니다.

최근 `INVALID_ARGS`의 주요 원인은 다음과 같습니다.

- `source.form` 누락 또는 잘못된 값: 127회
- `source.workspaceRoot`: 71회
- `source.root`: 51회
- `source.path`: 46회
- `source.kind` 누락 또는 잘못된 값: 31회
- 잘못된 `hostProfile`: 20회
- `limits.maxInstructions`: 19회

### 개선

1. `prepare_action`이 workspace, context, inline source variant의 nested 필드와 제약을 각각 노출합니다.
2. `risulua.debug_call`과 `risulua.runtime_smoke`에 최소 실행 예제를 등록합니다.
3. `generateMinimalArgsExample()`이 Zod discriminated union에서 유효한 variant를 생성하도록 수정합니다.
4. retry에는 placeholder `{}` 대신 실행 가능한 최소 workspace source를 넣습니다.
5. 잘못된 alias에는 정확한 대체 필드를 제안합니다. 예: `maxInstructions` → `instructionLimit`.

### 구현 위치

- `src/actions/schemas/runtime-schemas.ts`
- `src/actions/errors.ts`
- `src/actions/adapters/runtime-actions.ts`
- `src/tools/facade/prepare-action-tool.ts` 또는 prepare metadata 생성 경계

### 완료 조건

- `prepare_action("risulua.debug_call")` 결과만 사용해 canonical, context, inline 호출을 각각 성공시킬 수 있습니다.
- validation retry가 다시 `INVALID_ARGS`를 발생시키지 않습니다.
- runtime action schema snapshot에 세 source variant와 limits enum/필드가 포함됩니다.

## P0. MCP transport timeout으로 누출되지 않는 end-to-end deadline

### 문제

Worker 실행에는 `RUNTIME_TIMEOUT` 경계가 있지만 `resolveRuntimeSource()`는 Worker timeout이 시작되기 전에 실행됩니다. 세션 기록에서는 structured diagnostic 대신 약 60초 뒤 MCP `-32001 Request timed out`으로 끝난 호출이 65회 있었습니다.

현재 timeout은 worker execution만 보호하므로 source resolution, action queue, result presentation에서 지연되면 runtime diagnostic을 반환하지 못할 수 있습니다.

### 개선

1. source resolution부터 result presentation까지 하나의 action-level `AbortSignal`과 deadline을 전달합니다.
2. deadline phase를 `source-resolution`, `worker-execution`, `result-presentation`으로 구분합니다.
3. MCP client deadline보다 짧은 server-side guard를 두고 항상 structured error를 먼저 반환합니다.
4. timeout 발생 시 Worker 종료와 listener 정리를 보장합니다.
5. `runtime_smoke`의 여러 scenario도 전체 deadline과 scenario deadline을 구분합니다.

### 구현 위치

- `src/actions/adapters/runtime-actions.ts`
- `src/tools/runtime/source-resolver.ts`
- `src/tools/runtime/result-presenter.ts`
- `packages/core/src/node/risulua-runtime/worker-runner.ts`

### 완료 조건

- 의도적으로 느린 source resolution과 무한 루프가 모두 MCP transport timeout 전에 structured diagnostic을 반환합니다.
- 결과에 timeout phase가 포함됩니다.
- timeout 후 Worker와 pending listener가 남지 않습니다.

## P0. 요청 한도와 실제 적용 한도의 정직한 노출

### 문제

현재 `timeoutMs`와 `instructionLimit`은 양의 정수로 validation되지만 runtime에서는 각각 최대 2,000ms와 1,000,000으로 제한됩니다. 사용자가 더 큰 값을 전달해도 조용히 clamp되므로 15초 또는 더 큰 instruction budget이 적용됐다고 오해할 수 있습니다.

### 개선

1. 입력 schema에 실제 maximum을 선언해 validation 단계에서 초과값을 거부합니다.
2. 또는 configurable hard cap을 도입하고 요청값과 적용값을 결과에 함께 노출합니다.
3. metrics에 `requestedLimits`, `effectiveLimits`를 추가합니다.
4. clamp가 유지된다면 warning diagnostic을 반환합니다.

### 구현 위치

- `src/actions/schemas/runtime-schemas.ts`
- `packages/core/src/node/risulua-runtime/contracts.ts`
- `packages/core/src/node/risulua-runtime/worker-runner.ts`

### 완료 조건

- 사용자는 실행 전에 허용 가능한 최대값을 알 수 있습니다.
- 결과만 보고 요청값과 실제 적용값을 구분할 수 있습니다.
- 상한 초과가 silent behavior로 남지 않습니다.

## P1. Canonical workspace module map 캐시

### 문제

workspace source 호출이 2,065회로 `debug_call`의 약 96.7%였습니다. 현재 `resolveWorkspace()`는 매 호출마다 `lua/` 전체를 탐색하고 모든 module에 `realpathSync`, `readFileSync`, bundle validation을 반복합니다.

### 개선

1. workspace realpath, source form, entry module을 키로 module map을 캐시합니다.
2. 파일 path, mtime, size 또는 content hash로 변경된 module만 갱신합니다.
3. cache hit/miss, 읽은 module 수, source resolution 시간을 metrics로 반환합니다.
4. canonical과 dist cache를 분리하고 workspace boundary 검증은 유지합니다.
5. cache entry에 크기와 수명 제한을 둡니다.

### 구현 위치

- `src/tools/runtime/source-resolver.ts`
- MCP server lifecycle 또는 workspace-scoped service 등록 경계

### 완료 조건

- 변경 없는 workspace에서 두 번째 호출은 전체 파일을 다시 읽지 않습니다.
- 단일 module 변경 시 해당 module만 갱신됩니다.
- workspace 전환과 dist 변경에서 stale module map을 재사용하지 않습니다.

## P1. 큰 `run` fixture를 bounded scenario로 유도

### 문제

`exportName: "run"`이 1,168회로 전체 `debug_call`의 약 54.7%였습니다. 애플리케이션 대부분을 top-level에서 require하는 aggregate fixture는 테스트 본문 전에 1,000,000 instruction을 소진하기도 합니다. 반면 source를 한 번 해석해 여러 scenario를 실행하는 `runtime_smoke` 사용은 109회에 그쳤습니다.

### 개선

1. module trace만 많고 `hostCalls: 0`인 instruction-limit 결과에 bootstrap-specific guidance를 추가합니다.
2. `run` + 큰 module graph 조합이면 named bounded export와 `runtime_smoke`를 추천합니다.
3. `runtime_smoke` 준비 결과에 debug-call 여러 번 대신 scenarios를 사용하는 예제를 제공합니다.
4. scenario별 instruction, host call, module load 수를 요약합니다.

### 완료 조건

- bootstrap budget 초과와 실제 production loop 초과를 결과에서 구분할 수 있습니다.
- 같은 source의 여러 bounded 검증을 한 번의 `runtime_smoke` 요청으로 표현할 수 있습니다.
- guidance가 production 로직을 fixture에 복사하도록 유도하지 않습니다.

## P1. 명시된 action ID를 우선하는 intent routing

### 문제

요청이나 target에 `risulua.debug_call`이 명시되어도 문장에 “분석”이 포함되면 정적 `analyze.lua_handler`로 라우팅될 수 있습니다.

### 개선

1. 정확한 action ID match를 일반 자연어 intent보다 우선합니다.
2. `debug`, `execute`, `Fengari`, `runtime`, `smoke` 신호를 `risulua.runtime` capability에 연결합니다.
3. “debug_call 정상 여부 분석” 같은 혼합 요청은 정적 분석 action과 runtime action을 함께 추천합니다.

### 완료 조건

- target이 `risulua.debug_call`이면 catalog seed에 해당 action이 항상 포함됩니다.
- 정적 코드 분석 요청은 기존 `analyze.lua_handler` routing을 유지합니다.

## P2. Runtime 관측성

### 개선

결과 metrics에 다음 정보를 추가합니다.

- source resolution 시간과 실행 시간
- module 수와 bundle byte 수
- cache hit/miss
- requested/effective limits
- timeout 또는 abort phase
- Worker startup/termination 상태

로그에는 action ID, module ID, export name, phase, duration만 기록하고 source, host state, 사용자 데이터는 기록하지 않습니다.

### 완료 조건

- MCP timeout 보고만으로 source resolution과 Worker 실행 중 어느 단계가 느렸는지 구분할 수 있습니다.
- 로그에 Lua source, token, 개인 데이터가 포함되지 않습니다.

## 권장 구현 순서

1. schema examples와 valid retry 생성
2. requested/effective limit 노출
3. end-to-end deadline과 structured timeout
4. workspace module map cache
5. bounded fixture 및 `runtime_smoke` guidance
6. exact action ID routing
7. runtime metrics와 안전한 운영 로그

첫 세 항목은 오작동처럼 보이는 실패를 직접 줄이는 correctness/UX 작업입니다. 캐시와 batching은 그 다음 성능 최적화로 분리합니다.

## 회귀 검증 기준

- canonical, context, inline `debug_call` happy path
- invalid source alias에 대한 actionable retry
- Lua error, instruction limit, host-call limit, timeout diagnostic
- source resolution timeout과 Worker timeout의 phase 구분
- 변경 없는 workspace cache hit와 단일 파일 invalidation
- bounded exports를 사용하는 multi-scenario smoke
- 큰 trace/result의 ContextStore externalization
- exact action ID routing과 일반 Lua 분석 routing의 공존
