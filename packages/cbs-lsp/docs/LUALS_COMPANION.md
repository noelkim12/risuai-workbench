<!--
  LuaLS companion installation and operations guide for the CBS language server package.
  @file packages/cbs-lsp/docs/LUALS_COMPANION.md
-->

# CBS Language Server LuaLS companion guide

`cbs-language-server`는 LuaLS를 내장하거나 자동 다운로드하지 않습니다. Lua 기능은 **user-installed companion executable**을 붙이는 방식으로만 지원합니다.

## What the companion is responsible for

- `.risulua` hover proxy
- `.risulua` completion proxy
- LuaLS health/status reporting (`unavailable` / `stopped` / `starting` / `ready` / `crashed`)

CBS fragment 기능은 companion과 별개로 계속 동작합니다.

## Install options

### PATH-based install

LuaLS binary가 아래 이름 중 하나로 shell `PATH`에 있으면 됩니다.

- `lua-language-server`
- `lua-language-server.exe`

### Explicit override

PATH를 믿지 않으려면 아래 중 하나로 executable path를 직접 넘길 수 있습니다.

- CLI flag: `--luals-path /absolute/path/to/lua-language-server`
- env: `CBS_LSP_LUALS_PATH=/absolute/path/to/lua-language-server`
- config file / initialize option의 `cbs.luaLs.executablePath`

우선순위는 `packages/cbs-lsp/docs/STANDALONE_USAGE.md`의 runtime config precedence를 그대로 따릅니다.

## Verification checklist

1. LuaLS binary가 현재 shell에서 직접 실행되는지 확인
2. `cbs-language-server report availability --luals-path ...`로 runtime/operator surface를 먼저 확인
3. stdio LSP attach 뒤 `experimental.cbs.availability.companions.luals` 또는 trace payload `availability.companions.luals`를 확인
4. `.risulua` 문서에서 hover/completion이 실제로 응답하는지 확인
## Opt-in smoke test

real-binary 회귀는 기본 test matrix에 강제하지 않고 opt-in으로만 실행합니다.

```bash
CBS_LSP_RUN_LUALS_INTEGRATION=true \
CBS_LSP_LUALS_PATH=/absolute/path/to/lua-language-server \
npm run --workspace cbs-language-server test:luals-integration

CBS_LSP_RUN_LUALS_INTEGRATION=true \
CBS_LSP_LUALS_PATH=/absolute/path/to/lua-language-server \
npm run --workspace cbs-language-server test:product-matrix:luals
```

현재 opt-in smoke는 real LuaLS 기준으로 hover roundtrip을 검증합니다. diagnostics는 fake transport/mock companion 계약은 고정됐지만, real binary에서는 custom mirror URI와 LuaLS 진단 게이트(`enableScheme`, file existence, server-side trigger model) 때문에 아직 별도 검증 항목으로 남아 있습니다.

WSL/Linux 로컬 설치 예시는 project-local release tarball을 풀어 `./.tools/lua-language-server/<version>/bin/lua-language-server`를 `CBS_LSP_LUALS_PATH`로 넘기는 방식이 가장 안정적이에요. PATH 상속 문제를 피하고 exact version을 고정할 수 있기 때문입니다.

## Runtime behavior

- `ready` — mirrored virtual Lua document를 통해 hover/completion proxy가 활성화됩니다.
- `starting` — companion initialize/initialized handshake 진행 중입니다.
- `crashed` / `unavailable` — CBS fragment 기능은 유지되고 `.risulua` 기능만 degraded 됩니다.
- crash 뒤에는 bounded auto-restart를 먼저 시도합니다.

이 동작은 `packages/cbs-lsp/docs/COMPATIBILITY.md`의 degraded policy와 일치해야 합니다.

## Official client and standalone relation

공식 VS Code client와 외부 agent/client는 모두 같은 companion contract를 공유합니다.

- standalone attach/config: `packages/cbs-lsp/docs/STANDALONE_USAGE.md`
- official VS Code settings: `packages/vscode/README.md`
- failure mode 복구: `packages/cbs-lsp/docs/TROUBLESHOOTING.md`
