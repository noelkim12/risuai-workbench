# risuai-workbench-mcp

RisuAI Workbench의 Canonical Workspace를 AI agent가 안전하게 읽고, 검증하고, 필요한 경우 수정할 수 있게 해 주는 local stdio MCP server입니다.

기본 `tools/list`에는 8개 facade tool만 노출됩니다. 기존 domain tool들은 내부 Action Registry action으로 실행되며, 파일 변경은 preview/apply flow로 처리됩니다.

## 빠른 시작

요구사항:

- Node.js 20 이상
- MCP-compatible client
- RisuAI Workbench workspace root

저장소에서 직접 사용할 때:

```bash
npm install
npm run build --workspace risuai-workbench-mcp
node packages/risuai-workbench-mcp/bin/risuai-workbench-mcp.js --help
```

## MCP client 설정

Claude Desktop / Cursor 계열 `mcpServers` 예시:

```json
{
  "mcpServers": {
    "risuai-workbench": {
      "type": "stdio",
      "command": "node",
      "args": [
        "./packages/risuai-workbench-mcp/bin/risuai-workbench-mcp.js",
        "--stdio"
      ]
    }
  }
}
```

VS Code style `servers`도 같은 `command`와 `args`를 사용합니다.

## Facade workflow

일반 read-only / preview workflow:

```text
workbench.route_intent
  -> workbench.catalog
  -> workbench.prepare_action
  -> workbench.run_action
```

파일 변경 workflow:

```text
workbench.route_intent
  -> workbench.catalog
  -> workbench.prepare_action
  -> workbench.patch_preview
  -> workbench.patch_apply
```

## 기본 facade tools

| MCP tool | 역할 | Mutation |
| --- | --- | --- |
| `workbench.smoke` | server와 workspace 상태를 확인합니다. | no |
| `workbench.route_intent` | 사용자 요청을 capability, risk, 추천 internal action 후보로 라우팅합니다. | no |
| `workbench.catalog` | 현재 intent에 맞는 내부 action 후보만 짧게 반환합니다. | no |
| `workbench.prepare_action` | 선택한 internal action 하나의 입력 가이드와 예시를 반환합니다. | no |
| `workbench.run_action` | 내부 action을 schema 검증 후 실행합니다. | action-dependent |
| `workbench.context` | 큰 context payload를 handle로 만들고, 읽고, 검색하고, 해제합니다. | no |
| `workbench.patch_preview` | patch preview action 또는 patch plan pass-through를 실행하고 plan을 저장합니다. | preview only |
| `workbench.patch_apply` | 저장된 patch plan을 적용합니다. | commit |

`catalog`와 `prepare_action`이 반환하는 `actionId` 값은 MCP tool 이름이 아니라 내부 Action Registry ID입니다. 예: `inspect.path`, `analyze.query_lua_analysis`, `creative.brainstorm_scamper`, `patch.suggest_order`.

## CLI

```bash
risuai-workbench-mcp --stdio
risuai-workbench-mcp --help
risuai-workbench-mcp --version
```

| 옵션 | 기본값 | 설명 |
| --- | --- | --- |
| `--stdio` | 없음 | MCP stdio server를 시작합니다. stdout은 JSON-RPC 전용입니다. |
| `--help` | 없음 | stdio 시작 없이 사용법을 출력합니다. |
| `--version` | 없음 | package version을 출력합니다. |

## Write behavior

- path input은 상대 경로와 absolute path를 모두 받을 수 있습니다. 상대 경로는 startup context 기준으로 해석합니다.
- 파일 변경은 preview/apply flow와 append-only journal을 사용합니다.
- mutation 결과는 append-only journal에 기록됩니다.

## 더 보기

- 상세 운영/구현 reference: [README-reference.md](./README-reference.md)
- Prompt asset 목록: [prompt-assets/README.md](./prompt-assets/README.md)
- Tool 구현 구조: [src/tools/README.md](./src/tools/README.md)

## 개발

```bash
npm run build --workspace risuai-workbench-mcp
npm test --workspace risuai-workbench-mcp
npm run watch --workspace risuai-workbench-mcp
```

Manual smoke:

```bash
node packages/risuai-workbench-mcp/bin/risuai-workbench-mcp.js --help
node packages/risuai-workbench-mcp/bin/risuai-workbench-mcp.js --stdio
```

## Troubleshooting

### Server가 시작하지 않아요

- Node.js 20 이상인지 확인하세요.
- `npm run build --workspace risuai-workbench-mcp`를 먼저 실행하세요.
- MCP client config의 `command`와 `args`가 실제 파일 경로를 가리키는지 확인하세요.
- stdio mode에서 stdout은 JSON-RPC 전용입니다. 진단 로그는 stderr로 출력해야 합니다.

### Tools가 client에 보이지 않아요

- MCP client를 재시작하세요.
- built `dist/`가 최신인지 확인하세요.
- client가 `mcpServers`와 `servers` 중 어떤 config 형식을 요구하는지 확인하세요.

### Mutation이 거부돼요

- apply가 거부되거나 stale 상태가 의심되면 최신 파일 기준으로 preview를 다시 생성하세요.

## License

MIT
