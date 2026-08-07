# risuai-workbench-mcp 설치 가이드

이 문서는 npm에 배포된 `@risuai-workbench/mcp` package만 독립적으로 설치하고 local stdio MCP server가 실행 가능한지 확인하는 절차를 설명합니다. `risuai-workbench` monorepo clone이나 전체 workspace build는 필요하지 않습니다. Codex, OpenCode, Claude Code, Pi, Hermes 설정은 [`HARNESS_SETUP.md`](HARNESS_SETUP.md)를 참고하세요.

## 요구사항

- Node.js 20 이상
- npm 또는 `npx`
- RisuAI Workbench에서 추출한 canonical workspace
- MCP-compatible client 또는 Pi MCP extension

## 권장: 전역 설치

```bash
npm install --global @risuai-workbench/mcp
risuai-workbench-mcp --version
```

Harness command:

```text
risuai-workbench-mcp --stdio
```

`--root`를 생략하면 harness가 MCP process를 시작한 현재 project directory(`process.cwd()`)를 workspace root로 사용합니다.

업데이트와 제거:

```bash
npm install --global @risuai-workbench/mcp
npm uninstall --global @risuai-workbench/mcp
```

## 프로젝트별 설치

특정 project에서 사용하려면 local devDependency로 설치합니다.

```bash
npm install --save-dev @risuai-workbench/mcp
./node_modules/.bin/risuai-workbench-mcp --version
```

Harness command:

```text
./node_modules/.bin/risuai-workbench-mcp --stdio
```

## 설치 없이 `npx`로 실행

```bash
npx --yes --package @risuai-workbench/mcp \
  risuai-workbench-mcp --version
```

Harness command vector:

```text
npx --yes --package @risuai-workbench/mcp risuai-workbench-mcp --stdio
```

## 실행 옵션

```text
risuai-workbench-mcp --stdio [--root PATH] [--mutation MODE]
risuai-workbench-mcp --help
risuai-workbench-mcp --version
```

- `--stdio`: MCP server를 시작할 때 필수입니다.
- `--root PATH`: canonical workspace root입니다. 생략하면 server process의 현재 directory를 사용합니다.
- `--mutation enabled`: preview와 승인된 apply를 허용합니다. 기본값입니다.
- `--mutation generated-only`: 생성물로 분류된 대상만 변경할 수 있습니다.
- `--mutation preview-only`: patch plan 생성만 허용하고 apply를 차단합니다.

기본값 `enabled`는 patch preview와 승인된 apply를 모두 허용합니다. Apply를 의도적으로 금지하려는 환경에서만 다음 제한 옵션을 사용합니다.

```text
--mutation preview-only
```

## 설치 확인

`--help`와 `--version`은 MCP protocol client 없이 실행할 수 있습니다.

```bash
npx --yes --package @risuai-workbench/mcp \
  risuai-workbench-mcp --help
```

`--stdio`는 JSON-RPC 입력을 기다리므로 터미널에서 직접 실행하면 멈춘 것처럼 보이는 것이 정상입니다. 실제 연결 확인은 harness에서 수행하세요.

연결 후 다음을 확인합니다.

1. `tools/list`에 `workbench.*` facade tool 8개가 보입니다.
2. `workbench.smoke`가 server와 workspace 상태를 반환합니다.
3. `workbench.route_intent` → `workbench.catalog` → `workbench.prepare_action` 흐름이 동작합니다.

기본 공개 tool이 8개만 보이는 것은 정상입니다. 내부 action은 `workbench.run_action`을 통해 실행합니다.

## Debug logging

일반 로그는 stdout이 아니라 stderr로 출력됩니다. 상세 startup 진단이 필요할 때만 `RISU_MCP_DEBUG`를 설정합니다.

```bash
RISU_MCP_DEBUG=/absolute/path/to/log-directory risuai-workbench-mcp --stdio
```

MCP JSON-RPC가 사용하는 stdout을 redirect하거나 일반 로그를 섞지 마세요.
