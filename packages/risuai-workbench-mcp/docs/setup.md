# 설치와 MCP client 설정

이 문서는 `risuai-workbench-mcp`를 로컬 stdio MCP server로 실행하기 위한 최소 설정만 다룹니다. tool 선택과 안전한 파일 변경 흐름은 [`workflows.md`](workflows.md)와 [`mutation-safety.md`](mutation-safety.md)를 읽습니다.

## 요구사항

- Node.js 20 이상
- MCP-compatible client
- RisuAI Workbench workspace root
- 저장소 source에서 실행할 경우 root dependency install과 package build

## 저장소에서 직접 실행

```bash
npm install
npm run build --workspace risuai-workbench-mcp
node packages/risuai-workbench-mcp/bin/risuai-workbench-mcp.js --help
```

## MCP client 설정

Claude Desktop / Cursor 계열 `mcpServers` 예시입니다.

```json
{
  "mcpServers": {
    "risuai-workbench": {
      "type": "stdio",
      "command": "node",
      "args": [
        "/absolute/path/to/risuai-workbench/packages/risuai-workbench-mcp/bin/risuai-workbench-mcp.js",
        "--stdio"
      ]
    }
  }
}
```

VS Code style `servers`도 같은 `command`와 `args`를 사용합니다. client의 실행 위치가 달라도 안정적으로 동작하도록 absolute path를 권장합니다.

## 설정 후 확인

MCP client에서 연결한 뒤 다음 순서로 확인합니다.

1. `tools/list`에 facade tool이 보이는지 확인합니다.
2. `workbench.smoke`로 server와 workspace 상태를 확인합니다.
3. 세부 기능이 필요하면 [`workflows.md`](workflows.md)의 facade 흐름을 따릅니다.

기본 tool 수가 적게 보이는 것은 정상입니다. 기본 공개 surface는 facade tool 8개로 제한됩니다.
