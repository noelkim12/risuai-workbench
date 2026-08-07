# CBS Language Server 설치 가이드

이 문서는 npm에 배포된 `@risuai-workbench/cbs-language-server` package만 독립적으로 설치하고 standalone stdio language server가 실행 가능한지 확인하는 절차를 설명합니다. `risuai-workbench` monorepo clone이나 전체 workspace build는 필요하지 않습니다. Harness별 연결 설정은 [`HARNESS_SETUP.md`](HARNESS_SETUP.md)를 참고하세요.

## 요구사항

- Node.js 20 이상
- npm 또는 `npx`
- RisuAI Workbench에서 추출한 canonical workspace
- 선택 사항: `.risulua` 지원에 사용할 `lua-language-server`

버전을 확인합니다.

```bash
node --version
npm --version
```

## 권장: 전역 설치

여러 editor나 harness에서 `cbs-language-server` executable을 바로 사용하려면 전역 설치가 가장 단순합니다.

```bash
npm install --global @risuai-workbench/cbs-language-server
cbs-language-server --version
```

Harness 설정에서는 다음 command를 사용합니다. `cbs-language-server`가 harness process의 `PATH`에 있어야 합니다.

```text
cbs-language-server --stdio
```

업데이트와 제거:

```bash
npm install --global @risuai-workbench/cbs-language-server
npm uninstall --global @risuai-workbench/cbs-language-server
```

## 프로젝트별 설치

특정 project에서 사용하려면 local devDependency로 설치합니다.

```bash
npm install --save-dev @risuai-workbench/cbs-language-server
./node_modules/.bin/cbs-language-server --version
```

Harness command:

```text
./node_modules/.bin/cbs-language-server --stdio
```

## 설치 없이 `npx`로 실행

먼저 연결을 시험하거나 프로젝트에 dependency를 추가하지 않으려면 다음 command를 사용합니다.

```bash
npx --yes --package @risuai-workbench/cbs-language-server cbs-language-server --version
```

Harness가 실행할 command vector는 다음과 같습니다.

```text
npx --yes --package @risuai-workbench/cbs-language-server cbs-language-server --stdio
```

`npx` 방식은 harness가 서버를 시작할 때 npm package resolution이 발생할 수 있습니다. 반복 사용하거나 오프라인 재현성이 중요하면 프로젝트별 설치를 사용하세요.

## 설치 확인

`report availability`는 LSP 세션을 열지 않고 runtime 계약을 JSON으로 출력합니다.

```bash
npx --yes --package @risuai-workbench/cbs-language-server \
  cbs-language-server report availability
```

Canonical workspace까지 확인하려면 다음 read-only query를 실행합니다.

```bash
npx --yes --package @risuai-workbench/cbs-language-server \
  cbs-language-server report layer1 \
  --workspace /absolute/path/to/extracted-workspace
```

정상 출력에는 `schema: "cbs-lsp-agent-contract"`와 `schemaVersion: "1.0.0"`이 포함됩니다.

> `cbs-language-server --stdio`를 터미널에서 직접 실행하면 LSP JSON-RPC 입력을 기다리므로 멈춘 것처럼 보이는 것이 정상입니다. 실제 stdio 실행은 LSP client가 시작하게 두세요.

## Workspace와 LuaLS 설정

기본 LSP 연결은 harness가 보내는 `workspaceFolders[0]` 또는 `rootUri`를 사용하므로 `--workspace`를 지정하지 않습니다. 현재 project와 다른 workspace를 의도적으로 고정할 때만 다음 override를 사용합니다.

```text
--workspace /absolute/path/to/extracted-workspace
```

LuaLS는 선택 dependency입니다. 설치되어 있지 않아도 CBS 기능은 계속 동작하고 `.risulua` companion 기능만 degraded 상태가 됩니다. PATH 밖의 executable을 사용하려면 다음 중 하나를 선택합니다.

```text
--luals-path /absolute/path/to/lua-language-server
```

```bash
export CBS_LSP_LUALS_PATH=/absolute/path/to/lua-language-server
```

전체 CLI flag, config precedence, multi-root 정책은 [`STANDALONE_USAGE.md`](STANDALONE_USAGE.md), LuaLS 설치는 [`LUALS_COMPANION.md`](LUALS_COMPANION.md)를 참고하세요.
