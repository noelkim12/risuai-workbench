# TODO

완료 이력과 운영 메모는 `FIN.md`에 기록합니다. 더 오래된 상세 아카이브는 `../docs/todo-done-archive.md`를 참고하면 됩니다.

### Remaining
#### Backlog

- [ ] CBS LSP full suite의 fragment-routing/workspace-state/release fixture 관련 기존 실패 24건을 별도 조사하기. 이번 LuaLS sidecar surface targeted tests와 build는 통과했지만 `npm run --workspace cbs-language-server test` 전체 실행에서는 Lua string fragment mapping 기대값, LuaLS workspace sync, workspace variable flow, activation CodeLens, watched-file refresh, `.changeset`/GitHub workflow fixture 기대값이 현재 작업트리와 맞지 않는 실패가 남아 있음
- [ ] `.risulua` LuaLS sidecar cross-file 결과 remap을 보강하기. 이번 수정은 현재 문서 shadow `.lua` URI를 source `.risulua` URI로 되돌리지만, LuaLS가 다른 mirrored `.risulua` 파일의 references/definition/documentSymbol(`SymbolInformation[]`) 결과를 반환하는 경우 다른 shadow URI가 editor에 노출될 수 있으므로 shadow workspace 전체 URI reverse map과 회귀 테스트가 필요함
- [ ] `tests/custom-extension-diagnostics.test.ts`의 `maps lua full file to single fragment` 기대값을 현재 Rust/WASM Lua string fragment mapping(`lua-string:1`) 정책에 맞게 재판정하기. 이번 definition targeted 검증 중 전체 custom-extension diagnostics 실행에서 기존 기대값 `full`과 현재 구현값이 불일치하는 것을 확인했으며, 변경한 availability snapshot 케이스는 별도 targeted test로 통과함
- [ ] `.risulua` CBS 인자에서 default-only `.risuvar` 변수까지 rename/references 표면을 definition/hover와 같은 수준으로 확장할지 검토하기. 현재 사용자 요청 범위였던 definition·hover·diagnostics는 보강됐지만, 후속 context review에서 rename provider의 `queryAt` 기반 eligibility와 references provider의 default definition 포함 여부는 별도 일관성 개선 후보로 남음
