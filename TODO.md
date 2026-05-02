# TODO

완료 이력과 운영 메모는 `FIN.md`에 기록합니다. 더 오래된 상세 아카이브는 `../docs/todo-done-archive.md`를 참고하면 됩니다.

### Remaining
#### Backlog

- [ ] CBS LSP full suite의 fragment-routing/workspace-state/release fixture 관련 기존 실패 24건을 별도 조사하기. 이번 LuaLS sidecar surface targeted tests와 build는 통과했지만 `npm run --workspace cbs-language-server test` 전체 실행에서는 Lua string fragment mapping 기대값, LuaLS workspace sync, workspace variable flow, activation CodeLens, watched-file refresh, `.changeset`/GitHub workflow fixture 기대값이 현재 작업트리와 맞지 않는 실패가 남아 있음
- [ ] `tests/custom-extension-diagnostics.test.ts`의 `maps lua full file to single fragment` 기대값을 현재 Rust/WASM Lua string fragment mapping(`lua-string:1`) 정책에 맞게 재판정하기. 이번 definition targeted 검증 중 전체 custom-extension diagnostics 실행에서 기존 기대값 `full`과 현재 구현값이 불일치하는 것을 확인했으며, 변경한 availability snapshot 케이스는 별도 targeted test로 통과함
- [ ] `.risuvar` default-only 변수 보강 검증 중 `tests/lsp-server-integration.test.ts`에 남아 있는 기존 server seam 실패 15건을 별도 조사하기. Provider/service focused tests와 build는 통과했지만 required targeted command에서는 LuaLS workspace sync/overlay, workspace symbol, cross-file references/rename/hover/completion, CodeLens, watched-file refresh, diagnostics refresh, incremental rebuild 관련 기존 기대값 불일치가 계속 남아 있음
- [ ] `rtk npm run --workspace risu-workbench-core test` 전체 suite의 `tests/domain-phase1-extraction.test.ts > domain purity guard > keeps Node.js imports out of src/domain` 실패를 별도 조사하기. `src/domain/lua-wasm/loader.ts`에서 `node:module` / `createRequire`를 import해 domain purity guard가 reject하고 있으며, 이는 이번 replaceGlobalNote migration과 무관한 기존 unrelated failure임
- [ ] `rtk npm run --workspace risu-workbench-core test` 전체 suite의 `tests/export-surface.test.ts > export surface (snapshot) > root entry exports match snapshot` 실패를 별도 조사하기. 루트 export snapshot이 `CBS_ARTIFACT_EXTENSIONS`, Lua WASM analyzer/runtime export, `mapTextToCbsFragments` 등 현재 export key와 불일치해 stale snapshot으로 판단되며, 이번 replaceGlobalNote migration과 무관한 기존 unrelated failure임
