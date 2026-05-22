# Webview testing policy

`packages/webview`는 Svelte/Vite 기반 VS Code webview bundle을 소유한다. 이 패키지의 테스트는 production source tree를 깨끗하게 유지하면서도, 테스트가 검증하는 source module을 쉽게 찾을 수 있도록 아래 배치 규칙을 따른다.

## Directory layout

- 테스트 파일은 `packages/webview/tests/` 아래에 둔다.
- `tests/` 아래 경로는 가능한 한 `src/` 아래 경로를 mirror한다.
  - 예: `src/lib/monaco/mainEditorCbsLanguage.ts`
  - 테스트: `tests/lib/monaco/mainEditorCbsLanguage.test.ts`
- 테스트 파일명은 source 파일명에 `.test.ts`를 붙인다.

## What belongs in `tests/`

다음 테스트는 `packages/webview/tests/`에 둔다.

- Monaco adapter/helper 단위 테스트
- Svelte component 주변 pure state/view-model helper 테스트
- webview message/controller helper 테스트
- source contract나 static boundary를 고정하는 빠른 Vitest 테스트

## What does not belong here

다음 테스트는 성격에 맞는 다른 패키지나 더 구체적인 하위 suite로 둔다.

- VS Code extension host, real custom editor provider, document open/reveal 검증은 `packages/vscode/tests/e2e/`에 둔다.
- parser, simulator, document model, export contract처럼 webview와 무관한 domain behavior는 `packages/core/tests/`에 둔다.
- browser automation 또는 packaged VSIX 수준 검증이 필요하면 별도 e2e/integration suite를 만들고, `src/` 아래에 섞지 않는다.

## Build boundary

Vite production bundle은 `index.html`과 runtime import graph를 entry로 삼는다. 테스트 파일은 runtime code에서 import하지 않는다. broad `import.meta.glob`를 runtime code에 추가할 때는 `**/*.test.ts`, `**/*.spec.ts`, `**/__tests__/**`를 명시적으로 제외한다.

## Commands

```bash
rtk npm run --workspace risu-workbench-webview test
rtk npm run --workspace risu-workbench-webview check
rtk npm run --workspace risu-workbench-webview build
```
