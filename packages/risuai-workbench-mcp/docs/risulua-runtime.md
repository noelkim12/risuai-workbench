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

| actionId | 용도 |
|---|---|
| `risulua.debug_call` | 선택한 module export 한 번 호출 |
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

Runtime은 요청마다 새 Worker/VM을 생성하며 기본 상한은 wall-clock 2초, instruction 1,000,000회, host call 1,000회입니다. `io`, `os`, `debug`, default package loader, filesystem, network는 사용할 수 없습니다.
