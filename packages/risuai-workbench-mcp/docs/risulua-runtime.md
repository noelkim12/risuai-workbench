# RisuLua Fengari runtime

RisuLua runtime은 split/build 결과에서 정적 분석만으로 찾기 어려운 실행 회귀를 재현하고, 한 module export나 button action을 결정적으로 디버깅하는 read-only MCP workflow입니다.

공개 MCP tool은 추가되지 않습니다. 기본 8-tool facade를 다음 순서로 사용합니다.

```text
workbench.route_intent
  -> workbench.catalog (capability: risulua.runtime)
  -> workbench.prepare_action
  -> workbench.context (큰 입력일 때)
  -> workbench.run_action
```

내부 action은 두 개입니다.

| actionId                | 용도                                                 |
| ----------------------- | ---------------------------------------------------- |
| `risulua.debug_call`    | 선택한 module export 한 번 호출                      |
| `risulua.runtime_smoke` | 여러 smoke assertion 또는 canonical/dist parity 실행 |

## Source 선택

세 source form 모두 arbitrary filesystem path를 받지 않습니다.

```json
{ "kind": "workspace", "form": "canonical", "entryModuleId": "main" }
```

Canonical form은 workspace의 `lua/**/*.risulua`를 module map으로 읽습니다. Dist form은 `dist/`의 단일 `.risulua` 파일을 `__dist` module로 읽으며, 결과가 없거나 여러 개면 모호성 오류를 반환합니다.

```json
{ "kind": "inline", "moduleId": "main", "source": "return { value = 1 }" }
```

Inline source는 UTF-8 128 KiB까지입니다.

```json
{ "kind": "context", "contextId": "ctx_..." }
```

Context payload는 다음 module bundle 형태입니다.

```json
{
  "entry": "main",
  "modules": {
    "main": "return require(\"domain.phase\")",
    "domain.phase": "return { phase = 2 }"
  }
}
```

`source.contextId`와 `run_action.contextId`는 역할이 다릅니다.

- `source.contextId`: runtime source bundle 자체를 가리킵니다.
- 최상위 `run_action.contextId`: 저장된 object를 action args에 shallow merge한 뒤 schema validation을 수행합니다.

큰 Lua bundle만 재사용하면서 export, profile, args를 매번 바꾸려면 `source.contextId`를 사용합니다.

## Debug call 예시

Canonical workspace의 export를 실행할 때는 workspace 경로를 args에 넣지 않습니다. MCP server가 시작된 workspace root를 사용하며 `source.kind`와 `source.form`을 모두 지정합니다.

```json
{
  "actionId": "risulua.debug_call",
  "args": {
    "source": { "kind": "workspace", "form": "canonical" },
    "moduleId": "tests.tentacle_deck_integration_smoke",
    "exportName": "run",
    "args": [],
    "hostProfile": "minimal"
  }
}
```

`source`에는 `workspaceRoot`, `workspacePath`, `root`, `rootPath`, `path`를 추가하지 않습니다. 다른 workspace를 실행해야 한다면 MCP server의 workspace root를 바꾸거나, 허용된 module bundle을 `workbench.context`에 저장한 뒤 `source.kind: "context"`를 사용합니다.

`limits`의 정확한 필드명은 `timeoutMs`, `instructionLimit`, `hostCallLimit`, `maxTraceEvents`입니다. 예를 들어 `maxInstructions`나 `instructions`는 유효하지 않습니다. 호출 전 `workbench.prepare_action({ "actionId": "risulua.debug_call" })`로 현재 schema를 확인합니다.

Inline source의 최소 예시는 다음과 같습니다.

```json
{
  "actionId": "risulua.debug_call",
  "args": {
    "source": {
      "kind": "inline",
      "moduleId": "main",
      "source": "return { add = function(a, b) return a + b end }"
    },
    "exportName": "add",
    "args": [2, 3],
    "hostProfile": "minimal"
  }
}
```

`hostProfile`은 `minimal`, `button-action`, `chat-state` 중 하나입니다. Host override는 JSON-compatible globals, chat/global variables, state, random seed만 받으며 JavaScript callback은 받지 않습니다.

## 실행 한도와 진단 해석

Runtime은 요청마다 새 Worker/VM을 생성합니다. 현재 구현의 기본 상한과 요청 가능한 최대 상한은 wall-clock 2초, instruction 1,000,000회, host call 1,000회, trace 2,000건입니다. 더 큰 `timeoutMs`나 `instructionLimit`을 전달해도 이 상한으로 제한되므로, 큰 통합 fixture를 실행하기 위해 숫자만 늘리는 방식은 동작하지 않습니다.

| 결과                           | 의미                                                            | 다음 조치                                                                                 |
| ------------------------------ | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `status: "ok"`                 | export가 한도 안에서 완료됨                                     | value, state diff, trace를 검토합니다.                                                    |
| `RUNTIME_LUA_ERROR`            | Lua 코드가 실행 중 오류를 발생시킴                              | diagnostic의 module/line과 trace를 확인합니다.                                            |
| `RUNTIME_INSTRUCTION_LIMIT`    | Fengari가 instruction 예산을 모두 사용함                        | top-level `require`와 초기화를 줄이고 bounded export로 분리합니다.                        |
| `RUNTIME_TIMEOUT`              | Worker가 wall-clock 한도를 넘김                                 | 무거운 계산이나 aggregate scenario를 작은 export로 분리합니다.                            |
| `RUNTIME_HOST_CALL_LIMIT`      | virtual host API 호출 예산을 넘김                               | 반복 host write/read를 줄이고 상태 변경을 묶습니다.                                       |
| MCP `-32001 Request timed out` | structured runtime 결과 전에 client/transport deadline이 만료됨 | 같은 큰 호출을 반복하지 말고 작은 export로 재현한 뒤 server log와 호출 args를 수집합니다. |

`RUNTIME_INSTRUCTION_LIMIT`은 MCP 장애가 아닙니다. 예를 들어 trace에 module load만 수십 건 있고 `hostCalls: 0`, 빈 state diff와 함께 instruction이 정확히 1,000,000이면, 테스트 본문보다 top-level module graph 초기화가 예산을 소진한 경우로 봅니다.

## Bounded fixture 권장 패턴

`run` 하나가 애플리케이션 전체를 require하는 aggregate smoke라면 `debug_call` 한 번으로 검증하기 어렵습니다. 실제 production helper를 호출하는 작고 이름이 구체적인 export로 시나리오를 나눕니다.

```lua
return {
  projectionAndReset = projectionAndReset,
  heroineDeletionLifecycle = heroineDeletionLifecycle,
  targetProjectionSafety = targetProjectionSafety,
}
```

- 각 export는 검증할 production 경로 하나만 호출합니다.
- fixture 안에 production 로직을 복사하지 않습니다.
- host state와 random seed를 입력으로 고정합니다.
- 여러 bounded scenario를 같은 source에서 실행한다면 `risulua.runtime_smoke`로 묶습니다.
- 전체 통합 로딩 자체를 검증해야 하는 경우에는 현재 runtime 상한을 acceptance 조건에 명시하고, 한도 초과를 기능 실패와 구분합니다.

## Smoke와 parity 예시

```json
{
  "actionId": "risulua.runtime_smoke",
  "args": {
    "source": { "kind": "workspace", "form": "canonical" },
    "compareSource": { "kind": "workspace", "form": "dist" },
    "scenarios": [
      {
        "id": "vg-init",
        "target": { "kind": "export", "exportName": "vg_Init" },
        "hostProfile": "button-action",
        "expected": { "status": "ok" }
      }
    ]
  }
}
```

`compareSource`가 있으면 각 scenario의 status, return value, state diff, host-call summary, diagnostic ID를 canonical과 dist 사이에서 비교합니다. Assertion은 JSON equality만 지원합니다.

## 결과와 trace

결과는 status, return value, virtual state diff, host-call/module trace, structured diagnostic을 포함합니다. Trace가 250건을 넘거나 compact JSON이 256 KiB를 넘으면 전체 bounded result를 ContextStore에 저장하고 `contextId`, event count, 최대 20건 preview를 반환합니다. Worker가 보존하는 trace 자체도 최대 2,000건입니다.

`io`, `os`, `debug`, default package loader, filesystem, network는 사용할 수 없습니다.
