# Troubleshooting

이 문서는 `risuai-workbench-mcp`를 실행하거나 MCP client에 연결할 때 자주 발생하는 문제를 증상별로 정리합니다.

## Server가 시작하지 않아요

확인할 항목:

- Node.js 20 이상인지 확인합니다.
- 저장소 source에서 실행한다면 `npm run build --workspace risuai-workbench-mcp`를 먼저 실행합니다.
- MCP client config의 `command`와 `args`가 실제 파일 경로를 가리키는지 확인합니다.
- stdio mode에서 stdout에 일반 로그가 섞이지 않는지 확인합니다. stdout은 JSON-RPC 전용입니다.

## Tools가 적게 보여요

정상 동작일 가능성이 높습니다.

- 기본 tool surface는 facade 8개만 노출합니다.
- 세부 기능은 `workbench.catalog`와 `workbench.prepare_action`으로 action을 찾아 실행합니다.
- legacy direct MCP tools는 기본 mode에서 숨겨져 있습니다.

공개 facade tool 목록은 [`facade-tools.md`](facade-tools.md)를 확인합니다.

## Mutation이 거부돼요

확인할 항목:

- target path가 workspace boundary 안에 있는지 확인합니다.
- preview 이후 파일이 바뀌어 stale hash가 되었는지 확인합니다.
- 요청한 operation이 현재 patch engine에서 지원되는지 확인합니다.
- apply가 거부되거나 stale 상태가 의심되면 최신 파일 기준으로 preview를 다시 생성합니다.

파일 변경 안전 규칙은 [`mutation-safety.md`](mutation-safety.md)를 확인합니다.

## `risulua.debug_call` 입력이 `INVALID_ARGS`로 거부돼요

Canonical workspace 호출의 최소 source는 다음과 같습니다.

```json
{ "kind": "workspace", "form": "canonical" }
```

확인할 항목:

- `source.kind`가 `workspace`, `context`, `inline` 중 하나인지 확인합니다.
- workspace source에는 `form: "canonical"` 또는 `form: "dist"`가 필요합니다.
- `workspaceRoot`, `workspacePath`, `root`, `rootPath`, `path`는 source 필드가 아닙니다.
- `hostProfile`은 `minimal`, `button-action`, `chat-state` 중 하나입니다.
- instruction 제한 필드명은 `instructionLimit`입니다. `maxInstructions`와 `instructions`는 거부됩니다.
- `workbench.prepare_action`으로 현재 action schema를 확인한 뒤 `workbench.run_action`을 호출합니다.

전체 입력 예시는 [`risulua-runtime.md`](risulua-runtime.md#debug-call-예시)를 확인합니다.

## `RUNTIME_INSTRUCTION_LIMIT`이 발생해요

이 결과는 MCP transport 실패가 아니라 Fengari Worker가 instruction 예산 안에서 실행을 중단했다는 뜻입니다.

다음 조합이면 module bootstrap 비용 초과를 먼저 의심합니다.

- trace 대부분이 `kind: "module"`
- 수십 개 module이 로드됨
- `hostCalls: 0`
- state diff가 비어 있음
- `metrics.instructions`가 정확히 1,000,000

현재 구현에서 instruction 상한은 1,000,000입니다. 더 큰 `instructionLimit`을 전달해도 상한이 늘어나지 않습니다. 다음 순서로 fixture를 줄입니다.

1. 테스트 module의 top-level `require`를 실제 scenario에 필요한 domain으로 제한합니다.
2. 애플리케이션 전체를 실행하는 `run` export를 production 경로별 bounded export로 나눕니다.
3. 여러 작은 export를 검증한다면 `risulua.runtime_smoke`의 scenarios로 묶습니다.
4. fixture가 production 구현을 복사하지 않고 같은 production helper를 호출하는지 확인합니다.

## `RUNTIME_TIMEOUT` 또는 MCP `-32001 Request timed out`이 발생해요

두 결과를 구분합니다.

| 증상                                       | 해석                                                                   |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| 결과 JSON의 diagnostic이 `RUNTIME_TIMEOUT` | Worker가 runtime wall-clock 상한 안에서 정상 중단됨                    |
| MCP error `-32001 Request timed out`       | structured runtime 결과를 받기 전에 client/transport deadline이 만료됨 |

현재 runtime wall-clock 상한은 2초이며 더 큰 `timeoutMs` 요청도 이 상한으로 제한됩니다. MCP timeout이 발생하면 같은 aggregate 호출을 반복하거나 client timeout만 늘리지 않습니다. 먼저 작은 named export로 재현하고, 그래도 transport timeout이면 다음 정보를 수집합니다.

- action ID와 전체 args에서 민감정보를 제거한 사본
- target `moduleId`와 `exportName`
- canonical/context/inline source 종류
- 마지막으로 성공한 bounded export
- MCP server stderr와 client의 timeout 시간

RisuLua 실행 제한과 결과 해석은 [`risulua-runtime.md`](risulua-runtime.md#실행-한도와-진단-해석)를 확인합니다.
