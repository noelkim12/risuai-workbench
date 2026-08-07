# risuai-workbench-mcp harness별 설정 가이드

이 문서는 local stdio MCP server를 Codex, OpenCode, Claude Code, Pi, Hermes에 등록하는 방법을 설명합니다. 먼저 [`INSTALLATION.md`](INSTALLATION.md)에 따라 executable을 준비하세요.

예시는 별도 설치가 필요 없는 `npx` 방식을 사용합니다. Mutation mode를 지정하지 않으면 기본값 `enabled`로 시작해 patch preview와 apply를 모두 사용할 수 있습니다.

## 공통 command

모든 harness는 결국 다음 process를 실행합니다.

```text
npx --yes --package @risuai-workbench/mcp risuai-workbench-mcp --stdio
```

### Root와 설치 범위

기본 설정에는 `--root`를 넣지 않습니다. Server는 harness가 MCP process를 시작한 현재 project directory(`process.cwd()`)를 workspace root로 사용하므로 global MCP entry 하나가 project마다 올바른 root에서 동작합니다.

`--root /absolute/path`는 현재 project와 다른 workspace를 의도적으로 지정할 때만 사용하는 override입니다.

## Codex

Codex CLI로 global MCP entry를 추가합니다.

```bash
codex mcp add risuai-workbench -- \
  npx --yes --package @risuai-workbench/mcp \
  risuai-workbench-mcp --stdio
```

직접 설정하려면 user config `~/.codex/config.toml`에 추가합니다. 특정 project에서만 활성화하려면 trusted project의 `.codex/config.toml`을 사용합니다.

```toml
[mcp_servers.risuai-workbench]
command = "npx"
args = [
  "--yes",
  "--package",
  "@risuai-workbench/mcp",
  "risuai-workbench-mcp",
  "--stdio",
]
startup_timeout_sec = 20
enabled = true
```

확인:

```bash
codex mcp list
```

Codex TUI에서는 `/mcp`를 열고 `risuai-workbench`가 active인지 확인한 뒤 `workbench.smoke`를 요청합니다.

### Codex Windows App에서 직접 입력

Codex Windows App에서 **설정 → MCP → 맞춤형 MCP에 연결**을 열고 다음처럼 입력합니다. 먼저 PowerShell에서 package를 전역 설치합니다.

```powershell
npm install --global @risuai-workbench/mcp
risuai-workbench-mcp --version
```

화면의 각 항목:

| 화면 항목          | 입력값                 | 설명                                                |
| ------------------ | ---------------------- | --------------------------------------------------- |
| 이름               | `risuai-workbench`     | Codex에 표시할 MCP server 이름                      |
| 유형               | `STDIO`                | 이 package는 local stdio server입니다.              |
| 실행 명령          | `risuai-workbench-mcp` | 전역 설치로 생성된 executable                       |
| 인자 1             | `--stdio`              | stdio MCP transport 시작                            |
| 환경 변수          | 추가하지 않음          | 기본 실행에는 필수 환경 변수가 없습니다.            |
| 환경 변수 패스스루 | 추가하지 않음          | host environment에서 전달받아야 할 변수가 없습니다. |

인자는 한 칸에 합쳐 쓰지 말고 **인자 추가**를 눌러 아래 순서대로 한 항목씩 입력합니다.

```text
--stdio
```

`--root`는 입력하지 않습니다. Codex App이 MCP process를 시작한 현재 project directory가 workspace root가 됩니다. 화면 아래에 working directory 또는 `cwd` 항목이 보이면 비워 두어 현재 project를 사용하게 합니다.

전역 executable을 찾지 못하면 PowerShell에서 경로를 확인합니다.

```powershell
where.exe risuai-workbench-mcp
```

출력된 `risuai-workbench-mcp.cmd` 절대경로를 **실행 명령**에 넣을 수 있습니다.

#### 전역 설치 없이 `npx` 사용

전역 설치를 원하지 않으면 다음 값으로 바꿉니다.

| 화면 항목          | 입력값             |
| ------------------ | ------------------ |
| 이름               | `risuai-workbench` |
| 유형               | `STDIO`            |
| 실행 명령          | `npx`              |
| 환경 변수          | 추가하지 않음      |
| 환경 변수 패스스루 | 추가하지 않음      |

인자는 다음 순서로 하나씩 추가합니다.

```text
--yes
--package
@risuai-workbench/mcp
risuai-workbench-mcp
--stdio
```

저장한 뒤 Codex App에서 새 project session을 열고 MCP 목록에서 `risuai-workbench`가 connected인지 확인합니다. Agent에게 `workbench.smoke`를 호출하도록 요청하고, 응답의 workspace path가 현재 project인지 확인합니다.

Codex의 필드 의미와 config 대응은 [OpenAI Codex MCP 공식 문서](https://developers.openai.com/codex/mcp)를 기준으로 합니다.

## OpenCode

프로젝트 root의 `opencode.json` 또는 사용자 config에 local MCP entry를 추가합니다.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "risuai-workbench": {
      "type": "local",
      "command": [
        "npx",
        "--yes",
        "--package",
        "@risuai-workbench/mcp",
        "risuai-workbench-mcp",
        "--stdio"
      ],
      "enabled": true,
      "timeout": 10000
    }
  }
}
```

OpenCode를 다시 시작한 뒤 MCP 상태와 `workbench.smoke`를 확인합니다. Tool context를 줄이고 싶다면 agent별 tool 설정으로 `risuai-workbench*`를 필요한 agent에서만 활성화할 수 있습니다.

## Claude Code

CLI에서 local scope로 등록합니다.

```bash
claude mcp add --transport stdio --scope local risuai-workbench -- \
  npx --yes --package @risuai-workbench/mcp \
  risuai-workbench-mcp --stdio
```

팀과 설정을 공유하려면 `--scope project`를 사용합니다. 이 경우 project root의 `.mcp.json`에 기록되고, 각 사용자는 workspace trust와 server 승인을 완료해야 합니다.

직접 작성하는 `.mcp.json` 예시:

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

확인:

```bash
claude mcp list
```

Claude Code 안에서는 `/mcp`에서 연결 상태를 확인한 뒤 `workbench.smoke`를 요청합니다.

## Pi

Pi core는 MCP client를 내장하지 않습니다. 아래 절차는 third-party `pi-mcp-adapter` package를 사용합니다. 설치 전에 package source와 권한을 검토하세요.

```bash
pi install npm:pi-mcp-adapter
```

Pi를 다시 시작한 뒤 canonical workspace root에 `.mcp.json`을 작성합니다.

```json
{
  "mcpServers": {
    "risuai-workbench": {
      "command": "npx",
      "args": [
        "--yes",
        "--package",
        "@risuai-workbench/mcp",
        "risuai-workbench-mcp",
        "--stdio"
      ],
      "lifecycle": "lazy"
    }
  }
}
```

Pi에서 `/mcp` 또는 `/mcp reconnect risuai-workbench`로 상태를 확인합니다. `pi-mcp-adapter`의 기본값은 proxy tool 방식이므로 `workbench.smoke`가 Pi의 최상위 tool 목록에 직접 나타나지 않을 수 있습니다. 먼저 MCP proxy에서 `smoke`를 검색하거나 server를 연결한 뒤 호출하세요.

## Hermes

Hermes Agent는 local stdio MCP server를 기본 지원합니다. `~/.hermes/config.yaml`의 global `mcp_servers`에 한 번 추가하면 Hermes가 시작한 project cwd를 사용합니다.

```yaml
mcp_servers:
  risuai-workbench:
    command: 'npx'
    args:
      - '--yes'
      - '--package'
      - '@risuai-workbench/mcp'
      - 'risuai-workbench-mcp'
      - '--stdio'
    enabled: true
    connect_timeout: 60
    timeout: 300
    tools:
      resources: false
      prompts: false
```

표준 Hermes installer는 MCP dependency를 포함합니다. 최소 extras로 설치한 Hermes에서 MCP support가 없다면 Hermes 공식 설치 가이드에 따라 `mcp` extra를 먼저 설치하세요.

설정 변경 후 Hermes session에서 `/reload-mcp`를 실행합니다. MCP 상태에 `risuai-workbench`가 표시되는지 확인하고 `workbench.smoke`를 요청하세요. 연결되지 않으면 Hermes log에서 `npx` command discovery와 initialize timeout을 확인합니다.

## Global 또는 local install로 바꾸기

전역 설치를 사용한다면 모든 예시의 command를 다음처럼 바꿉니다.

```text
command: risuai-workbench-mcp
args: --stdio
```

프로젝트별 설치를 사용한다면 executable 절대경로를 지정하는 방식이 가장 안정적입니다.

```text
/absolute/path/to/project/node_modules/.bin/risuai-workbench-mcp
```

## 연결 확인과 선택적 mutation 제한

1. Harness의 MCP 목록에서 `risuai-workbench`가 connected/active인지 확인합니다.
2. `workbench.smoke`를 실행해 workspace root가 현재 project directory이고 mutation mode가 올바른지 확인합니다.
3. 기본 mutation mode는 `enabled`이며 `workbench.patch_preview`와 `workbench.patch_apply`를 모두 사용할 수 있습니다.
4. Apply를 의도적으로 금지하려는 환경에서만 command args에 `--mutation`, `preview-only`를 추가합니다.
5. 생성물만 변경하게 제한하려면 `--mutation`, `generated-only`를 사용합니다.

문제가 있으면 [`troubleshooting.md`](troubleshooting.md)를 참고하고, startup 문제에는 `RISU_MCP_DEBUG` log를 사용하세요.
