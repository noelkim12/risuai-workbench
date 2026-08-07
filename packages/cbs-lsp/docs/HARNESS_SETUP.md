# CBS Language Server harness별 설정 가이드

이 문서는 standalone `cbs-language-server`를 Codex, OpenCode, Claude Code, Pi, Hermes에 연결하는 방법과 각 harness의 지원 경계를 설명합니다. 먼저 [`INSTALLATION.md`](INSTALLATION.md)에 따라 executable을 준비하세요.

예시는 설치 없이 실행 가능한 `npx` 방식을 사용합니다. 기본 설정에는 `--workspace`를 넣지 않으며, harness가 보내는 현재 project의 `workspaceFolders[0]` 또는 `rootUri`를 사용합니다.

## 지원 요약

| Harness     | Custom LSP 연결       | 권장 경로                                                      |
| ----------- | --------------------- | -------------------------------------------------------------- |
| OpenCode    | 기본 지원             | `opencode.json`의 `lsp` 설정                                   |
| Claude Code | plugin으로 지원       | project 또는 user plugin의 `.lsp.json`                         |
| Pi          | core에는 없음         | third-party `@narumitw/pi-lsp` extension                       |
| Hermes      | CBS custom route 없음 | MCP package 또는 CBS CLI `report/query` 사용                   |
| Codex       | 직접 등록 표면 없음   | CBS CLI `report/query`, MCP package, 또는 LSP 지원 editor 병행 |

LSP와 MCP는 서로 다른 protocol입니다. `cbs-language-server --stdio`를 MCP server 항목에 등록하면 연결되지 않습니다. Agent tool이 필요하면 별도 패키지인 [`@risuai-workbench/mcp`](../../risuai-workbench-mcp/README.md)를 사용하세요.

## OpenCode

OpenCode는 custom LSP server를 기본 지원합니다. 프로젝트 루트의 `opencode.json` 또는 사용자 config의 `lsp` 객체에 다음 항목을 추가합니다.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "lsp": {
    "cbs": {
      "command": [
        "npx",
        "--yes",
        "--package",
        "@risuai-workbench/cbs-language-server",
        "cbs-language-server",
        "--stdio"
      ],
      "extensions": [".risulorebook", ".risuregex", ".risuprompt", ".risuhtml", ".risulua", ".risutext"]
    }
  }
}
```

OpenCode를 다시 시작한 뒤 대상 파일을 열고 LSP diagnostics를 확인합니다. 프로젝트별 설치를 사용한다면 `command`를 다음처럼 줄일 수 있습니다.

```json
["./node_modules/.bin/cbs-language-server", "--stdio"]
```

Workspace root는 OpenCode가 보내는 현재 workspace folder로 결정됩니다. 현재 project와 다른 workspace를 의도적으로 분석할 때만 `--workspace` override를 사용합니다.

## Claude Code

Claude Code의 LSP는 plugin component입니다. 아래 예시는 repository에 공유 가능한 project plugin을 만듭니다.

```text
.claude/skills/cbs-lsp/
├── .claude-plugin/
│   └── plugin.json
└── .lsp.json
```

`.claude/skills/cbs-lsp/.claude-plugin/plugin.json`:

```json
{
  "name": "cbs-lsp",
  "description": "CBS and RisuAI artifact language support"
}
```

`.claude/skills/cbs-lsp/.lsp.json`:

```json
{
  "cbs": {
    "command": "npx",
    "args": [
      "--yes",
      "--package",
      "@risuai-workbench/cbs-language-server",
      "cbs-language-server",
      "--stdio"
    ],
    "extensionToLanguage": {
      ".risulorebook": "cbs",
      ".risuregex": "cbs",
      ".risuprompt": "cbs",
      ".risuhtml": "html",
      ".risulua": "lua",
      ".risutext": "cbs"
    }
  }
}
```

Repository root에서 Claude Code를 시작하고 workspace trust를 승인한 뒤 다시 시작하거나 `/reload-plugins`를 실행합니다. `claude plugin list`에서 `cbs-lsp@skills-dir`을 확인할 수 있습니다. 서버가 보이지 않으면 `claude --debug`와 `/plugin`의 Errors 탭을 확인하세요.

Workspace root는 Claude Code가 LSP initialize request로 보내는 현재 project workspace를 사용합니다.

## Pi

Pi core는 LSP client를 내장하지 않습니다. 아래 설정은 third-party Pi package `@narumitw/pi-lsp`를 사용하며, 해당 package의 보안과 호환성은 Pi package 작성자가 관리합니다.

```bash
pi install npm:@narumitw/pi-lsp
```

Canonical workspace의 `.pi/pi-lsp.json`을 작성합니다.

```json
{
  "timeout": 30000,
  "servers": {
    "cbs": {
      "command": [
        "npx",
        "--yes",
        "--package",
        "@risuai-workbench/cbs-language-server",
        "cbs-language-server",
        "--stdio"
      ],
      "extensions": [".risulorebook", ".risuregex", ".risuprompt", ".risuhtml", ".risulua", ".risutext"],
      "diagnosticsSettleMs": 1000
    }
  }
}
```

Pi를 다시 시작하고 `/lsp`로 command가 발견되는지 확인한 다음 `lsp_diagnostics`를 호출합니다.

`@narumitw/pi-lsp`는 현재 diagnostics와 source code action 중심의 tool surface를 제공합니다. CBS LSP의 hover, completion, definition, references 같은 전체 interactive editor 기능을 Pi에서 모두 사용할 수 있다는 의미는 아닙니다.

## Hermes

Hermes Agent에는 LSP subsystem이 있지만 현재 공개 설정은 Hermes가 이미 알고 있는 language server ID의 command, environment, initialization option을 override하는 방식입니다. `.risulorebook`, `.risuregex`, `.risuprompt`, `.risuhtml`, `.risulua`, `.risutext`를 새 `cbs-language-server` route에 매핑하는 arbitrary extension 설정은 제공하지 않습니다.

따라서 `~/.hermes/config.yaml`의 `lsp.servers`에 `cbs-language-server` command만 추가하는 방식은 권장하지 않습니다. Hermes에서는 다음 중 하나를 사용하세요.

1. **Agent 분석과 변경 workflow:** [`@risuai-workbench/mcp`](../../risuai-workbench-mcp/docs/HARNESS_SETUP.md#hermes)를 Hermes MCP client에 등록합니다.
2. **Read-only CBS query:** terminal tool로 `cbs-language-server report/query`를 실행합니다.
3. **Interactive editor 기능:** OpenCode, Claude Code plugin, 공식 VS Code client처럼 CBS extension mapping을 지원하는 LSP client를 병행합니다.

```bash
cbs-language-server report layer1 \
  --workspace /absolute/path/to/extracted-workspace
```

Hermes의 built-in Lua LSP route는 일반 `.lua` language support이며, RisuAI `.risulua`와 CBS artifact graph를 처리하는 `cbs-language-server`를 대체하지 않습니다.

## Codex

Codex CLI와 IDE extension의 공개 설정에는 현재 arbitrary custom LSP server를 등록하는 항목이 없습니다. 따라서 `cbs-language-server`를 Codex의 MCP 설정에 넣지 마세요.

Codex에서는 다음 중 하나를 사용합니다.

1. **Agent 분석:** [`@risuai-workbench/mcp`](../../risuai-workbench-mcp/docs/HARNESS_SETUP.md)를 Codex MCP server로 등록합니다.
2. **Read-only CBS query:** shell에서 `cbs-language-server report/query`를 실행합니다.
3. **편집기 기능:** OpenCode, Claude Code plugin, 공식 VS Code client처럼 LSP attach를 지원하는 client를 병행합니다.

Codex가 실행할 수 있는 read-only 예시:

```bash
npx --yes --package @risuai-workbench/cbs-language-server \
  cbs-language-server query variable sharedVar \
  --workspace /absolute/path/to/extracted-workspace
```

## 설정 확인 체크리스트

1. Harness가 실행하는 command와 동일한 command로 `--version`이 성공하는지 확인합니다.
2. Canonical workspace 하나를 process 하나에 연결합니다.
3. `.risulorebook` 또는 `.risuregex` 파일을 열고 diagnostics를 확인합니다.
4. Lua 기능이 필요하면 LuaLS를 설치하고 `report availability`에서 상태를 확인합니다.
5. 외부 파일 변경이 반영되지 않으면 harness의 watched-file 지원 경계를 확인합니다.

문제가 계속되면 [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md)와 [`COMPATIBILITY.md`](COMPATIBILITY.md)를 참고하세요.
