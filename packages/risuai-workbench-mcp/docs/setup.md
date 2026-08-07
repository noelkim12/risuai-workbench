# 설치와 MCP client 설정

이 문서는 `risuai-workbench-mcp`를 로컬 stdio MCP server로 실행하기 위한 최소 설정만 다룹니다. tool 선택과 안전한 파일 변경 흐름은 [`workflows.md`](workflows.md)와 [`mutation-safety.md`](mutation-safety.md)를 읽습니다.

> 최신 분리 가이드: 설치는 [`INSTALLATION.md`](INSTALLATION.md), Codex / OpenCode / Claude Code / Pi / Hermes 설정은 [`HARNESS_SETUP.md`](HARNESS_SETUP.md)를 사용하세요. 이 페이지는 기존 링크를 위한 통합 요약으로 유지합니다.

## 요구사항

- Node.js 20 이상
- MCP-compatible client
- RisuAI Workbench workspace root

## npm에서 설치

여러 MCP client가 같은 executable을 재사용한다면 global install을 사용할 수 있습니다.

```bash
npm install --global @risuai-workbench/mcp
risuai-workbench-mcp --version
```

프로젝트별로 사용하려면 local devDependency로 설치합니다.

```bash
npm install --save-dev @risuai-workbench/mcp
./node_modules/.bin/risuai-workbench-mcp --version
```

설치 없이 한 번 실행하거나 MCP client 설정에 직접 넣으려면 package와 binary를 모두 명시합니다.

```bash
npx --yes --package @risuai-workbench/mcp risuai-workbench-mcp --help
```

## MCP client 설정

Claude Desktop / Cursor 계열 `mcpServers` 예시입니다. `--root`를 생략하면 harness가 server를 시작한 현재 project directory를 workspace root로 사용합니다.

```json
{
  "mcpServers": {
    "risuai-workbench": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "--yes",
        "--package",
        "@risuai-workbench/mcp",
        "risuai-workbench-mcp",
        "--stdio"
      ]
    }
  }
}
```

global install을 사용한다면 `command`를 `risuai-workbench-mcp`로 바꾸고 `args`에는 `--stdio`만 남깁니다. VS Code style `servers`도 같은 command와 args를 사용합니다. 현재 project와 다른 workspace를 의도적으로 지정할 때만 `--root`, 절대경로를 추가합니다.

파일 변경을 preview로만 제한하려면 args 끝에 `--mutation`, `preview-only`를 추가합니다. 지원 값은 `enabled`, `generated-only`, `preview-only`입니다.

## 업데이트와 제거

```bash
npm install --global @risuai-workbench/mcp
npm uninstall --global @risuai-workbench/mcp
```

## 설정 후 확인

MCP client에서 연결한 뒤 다음 순서로 확인합니다.

1. `tools/list`에 facade tool이 보이는지 확인합니다.
2. `workbench.smoke`로 server와 workspace 상태를 확인합니다.
3. 세부 기능이 필요하면 [`workflows.md`](workflows.md)의 facade 흐름을 따릅니다.

기본 tool 수가 적게 보이는 것은 정상입니다. 기본 공개 surface는 facade tool 8개로 제한됩니다.
