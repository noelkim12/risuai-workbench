# custom-extension domain

이 문서는 `packages/core/src/domain/custom-extension/`이 들고 있는 순수 계약, artifact 분류, CBS fragment mapping만 다룬다. `.risu*` 포맷 상세는 여기서 다시 길게 풀지 않는다.

## 이 페이지가 맡는 범위

- canonical target, artifact, marker contract
- target별 ownership matrix와 canonical relative path 규칙
- pure discovery result type과 artifact 필터 helper
- shared allowed-loss registry
- custom-extension 파일을 CBS fragment로 매핑하는 pure helper
- root entry에서 실제로 다시 export되는 Lua, Toggle adapter

## current truth

- `packages/core/src/domain/custom-extension/index.ts`는 `contracts`, `allowed-loss`, `cbs-fragments`, `file-discovery`, `extensions/toggle`, `extensions/lua`만 root domain barrel로 노출한다.
- target 집합은 `charx`, `module`, `preset`으로 고정돼 있다.
- artifact 집합은 `lorebook`, `regex`, `lua`, `prompt`, `toggle`, `variable`, `html`이다.
- path 규칙은 artifact contract가 source of truth다. lorebook/regex/prompt는 stem 기반, lua/variable은 target name 기반, html은 fixed `background`, preset toggle은 fixed `prompt_template`를 쓴다.
- CBS-bearing artifact는 `lorebook`, `regex`, `prompt`, `html`, `lua`이고, `toggle`, `variable`은 명시적으로 non-CBS다.

## notable exported surface

| 축 | 현재 public 예시 |
|---|---|
| contract | `CUSTOM_EXTENSION_TARGETS`, `CUSTOM_EXTENSION_ARTIFACTS`, `CUSTOM_EXTENSION_ARTIFACT_CONTRACTS` |
| ownership/path | `listOwnedCustomExtensionArtifacts`, `supportsCustomExtensionArtifact`, `buildCanonicalArtifactPath` |
| suffix/path resolve | `parseCustomExtensionArtifactFromSuffix`, `parseCustomExtensionArtifactFromPath` |
| allowed loss | `ALLOWED_LOSS_CATEGORIES`, `ALLOWED_LOSS_RULES`, `listAllowedLossRules` |
| CBS fragment mapping | `mapToCbsFragments`, `mapLorebookToCbsFragments`, `mapRegexToCbsFragments`, `mapPromptToCbsFragments`, `mapHtmlToCbsFragments`, `mapLuaToCbsFragments` |
| raw adapters | `parseLuaContent`, `serializeLuaContent`, `resolveDuplicateLuaSources`, `parseToggleContent`, `serializeToggleContent`, `resolveDuplicateToggleSources` |

## 이 페이지가 포맷 상세를 대신하지 않는 이유

- lorebook 세부 포맷은 [`../../custom-extension/extensions/lorebook.md`](../../custom-extension/extensions/lorebook.md)
- regex 세부 포맷은 [`../../custom-extension/extensions/regex.md`](../../custom-extension/extensions/regex.md)
- lua 세부 포맷은 [`../../custom-extension/extensions/lua.md`](../../custom-extension/extensions/lua.md)
- prompt template 세부 포맷은 [`../../custom-extension/extensions/prompt-template.md`](../../custom-extension/extensions/prompt-template.md)
- toggle 세부 포맷은 [`../../custom-extension/extensions/toggle.md`](../../custom-extension/extensions/toggle.md)
- variable 세부 포맷은 [`../../custom-extension/extensions/variable.md`](../../custom-extension/extensions/variable.md)
- html 세부 포맷은 [`../../custom-extension/extensions/html.md`](../../custom-extension/extensions/html.md)
- 전체 탐색 순서는 [`../../custom-extension/README.md`](../../custom-extension/README.md)

## scope boundary

- Node에서 실제 폴더를 걷는 workspace discovery는 [`../node/README.md`](../node/README.md) 쪽 설명이 먼저다. 이 페이지는 pure discovery result shape만 다룬다.
- charx/module/preset pack workflow 전체는 소유하지 않는다. target별 canonical layout은 [`./charx.md`](./charx.md), [`./module.md`](./module.md), [`./preset.md`](./preset.md)와 위 custom-extension target 문서로 보낸다.
- lorebook/regex adapter의 세부 parse, inject, round-trip 규칙은 각 artifact 문서가 source of truth다.

## evidence anchors

- `../../../packages/core/src/domain/custom-extension/index.ts`
- `../../../packages/core/src/domain/custom-extension/contracts.ts`
- `../../../packages/core/src/domain/custom-extension/allowed-loss.ts`
- `../../../packages/core/src/domain/custom-extension/cbs-fragments.ts`
- `../../../packages/core/src/domain/custom-extension/file-discovery.ts`
- `../../../packages/core/src/domain/custom-extension/extensions/lua.ts`
- `../../../packages/core/src/domain/custom-extension/extensions/toggle.ts`
- `../../../packages/core/tests/custom-extension/foundation.test.ts`
- `../../../packages/core/tests/custom-extension/cbs-fragments.test.ts`
- `../../../packages/core/tests/custom-extension/lua-canonical.test.ts`
- `../../../packages/core/tests/custom-extension/toggle-canonical.test.ts`

## 같이 읽을 문서

- [`../targets/root-browser.md`](../targets/root-browser.md)
- [`../../custom-extension/README.md`](../../custom-extension/README.md)
- [`./charx.md`](./charx.md)
- [`./module.md`](./module.md)
- [`./preset.md`](./preset.md)
