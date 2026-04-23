<!--
  Standalone usage guide for the CBS language server package.
  @file packages/cbs-lsp/docs/STANDALONE_USAGE.md
-->

# CBS Language Server standalone usage

이 문서는 `cbs-language-server`를 VS Code 내부 부속 서버가 아니라 외부 editor/agent가 직접 붙는 standalone stdio server로 실행할 때의 운영 계약을 정리합니다.

## Supported attach modes

### 1. Local devDependency

프로젝트에 서버 버전을 고정하고 싶다면 local install을 권장합니다.

```bash
npm install --save-dev cbs-language-server
./node_modules/.bin/cbs-language-server --stdio
```

### 2. `npx`

빠르게 attach만 확인할 때는 ephemeral `npx` 실행을 지원합니다.

```bash
npx cbs-language-server --stdio
```

### 3. Global install

여러 editor가 같은 binary를 재사용한다면 global install을 사용할 수 있습니다.

```bash
npm install -g cbs-language-server
cbs-language-server --stdio
```

이 모드는 `cbs-language-server` binary가 shell `PATH`에 잡혀 있어야 합니다.

## Official VS Code client handoff

`packages/vscode`는 이 standalone contract를 직접 소비하는 공식 VS Code client입니다. 설정 키와 launch matrix는 `packages/vscode/README.md`를 source-of-truth로 두고, 이 문서에는 standalone server 쪽에서 알아야 하는 handoff만 남깁니다.

```json
{
  "risuWorkbench.cbs.server.launchMode": "auto",
  "risuWorkbench.cbs.server.installMode": "local-devDependency",
  "risuWorkbench.cbs.server.path": ""
}
```

- `launchMode = "auto"` — selected install mode를 먼저 시도하고, `local-devDependency`가 workspace에서 해석되지 않을 때만 monorepo embedded module로 fallback합니다.
- `launchMode = "standalone"` — public standalone surface만 사용합니다. resolution 실패 시 client가 바로 error UX를 띄웁니다.
- `launchMode = "embedded"` — monorepo 개발용 `packages/cbs-lsp/dist/server.js` IPC launch를 강제합니다.
- `installMode = "local-devDependency"` / `"npx"` / `"global"`는 standalone attach command를 어떻게 구성할지만 바꿉니다.
- `path`는 explicit executable override이며, 상대 경로는 first workspace folder 기준으로 해석합니다.

## Runtime config precedence

standalone 설정은 아래 우선순위로 해석됩니다.

1. CLI flag (`--workspace`, `--log-level`, `--config`, `--luals-path`)
2. Environment (`CBS_LSP_WORKSPACE`, `CBS_LSP_LOG_LEVEL`, `CBS_LSP_CONFIG`, `CBS_LSP_LUALS_PATH`)
3. Config file (`cbs-language-server.json`, `.cbs-language-server.json`, `cbs-lsp.json`, `.cbs-lsp.json`)
4. `initialize.initializationOptions.cbs`

## Workspace root selection

startup root는 아래 순서로 선택됩니다.

1. precedence가 반영된 `runtime-config.workspacePath`
2. `initialize.workspaceFolders[0]`
3. `initialize.rootUri`

initialize 시점에 root가 없으면 `experimental.cbs.operator.failureModes`에 `workspace-root-unresolved`가 active로 보고됩니다.

그래도 이후 열린 문서가 canonical `.risu*` artifact 경로를 가지면, 서버는 그 경로에서 workspace root를 역산해 workspace graph 기능을 다시 붙일 수 있습니다.

## Multi-root status

현재 `cbs-language-server`는 startup root로 `initialize.workspaceFolders[0]`만 사용합니다. 추가 workspace folder는 무시되며, 이 상태는 runtime payload에서 `multi-root-reduced` failure mode로 같이 노출됩니다.

권장 운영 방식은 extracted workspace 하나당 서버 프로세스 하나입니다.

## Watched-file refresh contract

client가 `workspace/didChangeWatchedFiles` dynamic registration을 지원하면 lorebook/regex/prompt/html/lua 파일의 외부 변경이 incremental rebuild 경로로 들어갑니다.

지원하지 않으면 open/change/close 문서 이벤트만 refresh에 사용되며, 이 상태는 `watched-files-client-unsupported` failure mode로 노출됩니다.

## Client capability degradation

서버는 동일한 core capability set을 항상 광고하지만, client capability payload와 workspace 구성에 따라 일부 기능은 graceful degradation으로 전환됩니다. 이 전환은 silent failure가 아니라 `experimental.cbs.operator.failureModes`와 trace payload에 명확히 노출됩니다.

대표 client profile별 degradation 경로:

- **Neovim minimum** — `watchedFilesDynamicRegistration` + `codeActionLiteralSupport` + `prepareRename` + `publishDiagnostics.versionSupport`가 있으면 LuaLS companion ready 상태에서 failure mode가 활성화되지 않습니다.
- **Zed minimum** — Neovim 조합에 `codeLens.refreshSupport` + `relativePatternSupport`를 추가합니다. LuaLS ready 상태에서도 failure mode가 활성화되지 않습니다.
- **Emacs minimum** — `codeActionLiteralSupport`만 존재하고 `workspaceFolders`/`watchedFiles`/`prepareRename`/`publishDiagnostics.versionSupport`가 없으면 `luals-unavailable`, `watched-files-client-unsupported`, `workspace-root-unresolved` failure mode가 함께 노출됩니다.
- **VS Code-family minimum** — Zed 조합과 동일한 capability에 multi-root `workspaceFolders`를 내면 `multi-root-reduced` failure mode가 활성화됩니다.

각 profile의 initialize payload snapshot과 expected capability/availability 매트릭스는 `packages/cbs-lsp/tests/fixtures/capability-matrix.ts`와 `tests/capability-matrix.test.ts`에서 source-of-truth로 고정되어 있습니다.

## LuaLS companion fallback

LuaLS executable이 PATH에 없거나 `--luals-path`가 잘못되어도 서버 전체는 실패하지 않습니다.

- CBS fragment 기능: 계속 활성
- `.risulua` companion 기능: unavailable/degraded
- runtime payload key: `luals-unavailable`

자세한 복구 절차는 `packages/cbs-lsp/docs/TROUBLESHOOTING.md`를 참고하세요.

설치/검증 절차와 companion health/status 해석은 `packages/cbs-lsp/docs/LUALS_COMPANION.md`를 source-of-truth로 봐 주세요.

## Related guides

- `packages/cbs-lsp/docs/AGENT_INTEGRATION.md`
- `packages/cbs-lsp/docs/LUALS_COMPANION.md`
- `packages/cbs-lsp/docs/TROUBLESHOOTING.md`
- `packages/vscode/README.md`
