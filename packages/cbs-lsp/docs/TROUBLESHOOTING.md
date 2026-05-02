<!--
  Troubleshooting guide mapped to cbs-lsp runtime operator failure modes.
  @file packages/cbs-lsp/docs/TROUBLESHOOTING.md
-->

# CBS Language Server troubleshooting

이 문서는 `experimental.cbs.operator.failureModes[*].key`와 trace payload `availability.operator.failureModes[*].key`에 직접 대응합니다.

설치/실행은 `packages/cbs-lsp/docs/STANDALONE_USAGE.md`, LuaLS companion 설치는 `packages/cbs-lsp/docs/LUALS_COMPANION.md`, 공식 VS Code client 설정은 `packages/vscode/README.md`를 함께 보시면 좋습니다.

## `workspace-root-unresolved`

### Meaning

initialize 시점에 startup workspace root를 결정하지 못한 상태에요.

### Common causes

- `--workspace` / `CBS_LSP_WORKSPACE` / config file / initialization option을 주지 않았음
- client가 `workspaceFolders`와 `rootUri`를 보내지 않았음
- 아직 canonical `.risu*` 문서를 열지 않았음

### Recovery

- `cbs-language-server --stdio --workspace /path/to/extracted-workspace`
- 또는 `CBS_LSP_WORKSPACE=/path/to/workspace cbs-language-server --stdio`
- 또는 initialize payload에 `workspaceFolders`/`rootUri`를 포함
- 또는 canonical `.risu*` artifact를 열어 document-path fallback이 root를 유추할 수 있게 함

## `multi-root-reduced`

### Meaning

client가 여러 workspace folder를 보냈지만 서버는 현재 `workspaceFolders[0]`만 startup root로 사용한 상태에요.

### Recovery

- extracted workspace마다 cbs-lsp 프로세스를 따로 실행
- 가장 canonical한 workspace를 첫 번째 folder로 보내기

## `watched-files-client-unsupported`

### Meaning

client가 `workspace/didChangeWatchedFiles` dynamic registration을 지원하지 않아 외부 파일 변경 push가 비활성화된 상태에요.

### Symptoms

- editor 밖에서 lorebook/regex/lua 파일을 바꿔도 diagnostics나 CodeLens가 즉시 갱신되지 않음

### Recovery

- watched-file dynamic registration을 지원하는 client를 사용
- 외부 변경 후 관련 문서를 다시 열거나 저장해 open/change/close refresh를 트리거

## `luals-unavailable`

### Meaning

LuaLS executable을 찾지 못했거나 sidecar가 unhealthy/crashed 상태에요.

### Symptoms

- `.risulua` hover/completion 같은 Lua companion 기능이 비활성 또는 degraded
- CBS fragment 기능은 계속 동작

### Recovery

- LuaLS binary를 설치
- binary가 `PATH`에 있는지 확인
- 필요하면 `--luals-path /absolute/path/to/lua-language-server` 사용
- WSL/Linux에서는 project-local release tarball install 뒤 explicit absolute path override를 주는 편이 가장 재현성이 높음
- sidecar crash 뒤에는 cbs-lsp가 bounded auto-restart를 먼저 시도함
- retry budget 이후에도 degraded 상태가 남으면 서버를 재시작하거나 다시 initialize

## `luals-diagnostics-empty`

### Meaning

LuaLS companion은 ready이지만 `.risulua` 문서에 diagnostics가 방출되지 않아요. shadow-file workspace나 Lua.workspace.library 설정 문제일 수 있어요.

### Symptoms

- Hover/completion은 정상 동작
- Diagnostics panel에 `.risulua` 파일이 보이지 않음
- `textDocument/publishDiagnostics` notification이 오지 않거나 empty payload로 옴

### Common causes

- LuaLS는 `file://` scheme 문서에서만 diagnostics를 방출하는데, virtual mirror(`risu-luals://`)를 사용 중
- Shadow workspace root가 `Lua.workspace.library`에 포함되지 않음
- Workspace scan이 완료되기 전에 diagnostics를 기대함

### Recovery

1. **Check shadow files exist**: `/tmp/luals-shadow-{pid}/*.lua` 파일이 실제로 생성됐는지 확인
2. **Verify library config**: server trace에서 `workspace/didChangeConfiguration` payload에 `Lua.workspace.library`에 shadow root가 포함됐는지 확인
3. **Wait for workspace ready**: LuaLS는 workspace scan 완료 후 diagnostics를 방출함. hover 테스트가 통과했다면 1-2초 더 기다려보기
4. **Restart with explicit path**: `--luals-path`를 명시적으로 지정하고 서버 재시작
5. **Check test conditions**: `CBS_LSP_RUN_LUALS_INTEGRATION=true`와 `CBS_LSP_LUALS_PATH`가 설정됐는지 확인

### Prevention

- VS Code 사용 시: `risuWorkbench.cbs.server.lualsPath`에 absolute path 설정
- CI/자동화 환경: project-local LuaLS tarball + explicit path 사용
- 개발 환경: `docs/LUALS_COMPANION.md`의 "Execution conditions" 섹션 참조

## PATH check checklist

global install이나 LuaLS companion 문제를 볼 때는 아래 순서를 먼저 확인하세요.

1. `cbs-language-server --version`이 현재 shell에서 실행되는지 확인
2. LuaLS binary도 같은 shell에서 직접 실행 가능한지 확인
3. editor/agent가 실제로 같은 shell 환경의 `PATH`를 상속받는지 확인
4. 불확실하면 global PATH 의존 대신 local install + explicit absolute path override를 우선 사용

VS Code에서 explicit `risuWorkbench.cbs.server.path`를 사용 중이라면, client 쪽 경로 해석 규칙과 failure UX는 `packages/vscode/README.md`를 기준으로 다시 확인하세요.
