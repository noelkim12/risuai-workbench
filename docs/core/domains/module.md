# module domain

이 문서는 `packages/core/src/domain/module/`의 순수 module object helper만 다룬다. pack, extract, CLI workflow 전체는 여기서 설명하지 않는다.

## 이 페이지가 맡는 범위

- raw module object에서 lorebook, regex, trigger, background embedding을 읽는 얇은 helper
- module DTO 타입 export

## current truth

- `packages/core/src/domain/module/index.ts`의 public helper는 네 개다. `getModuleLorebookEntriesFromModule`, `getModuleRegexScriptsFromModule`, `getModuleTriggersFromModule`, `getModuleBackgroundEmbeddingFromModule`.
- 모든 배열 helper는 배열이 아니면 빈 배열을 돌려준다.
- `backgroundEmbedding` helper는 string이 아니면 빈 문자열을 돌려준다.
- root domain barrel은 여기에 `MCPModule`, `RisuModule` 타입도 같이 다시 export한다.

## notable exported surface

| 축 | 현재 public 예시 |
|---|---|
| array helpers | `getModuleLorebookEntriesFromModule`, `getModuleRegexScriptsFromModule`, `getModuleTriggersFromModule` |
| string helper | `getModuleBackgroundEmbeddingFromModule` |
| types | `MCPModule`, `RisuModule` |

## 현재 코드가 고정하는 것

- helper는 module payload를 해석하거나 보정하지 않는다. 단순한 safe read adapter에 가깝다.
- lorebook은 `module.lorebook`, regex는 `module.regex`, trigger는 `module.trigger`, background HTML은 `module.backgroundEmbedding`만 본다.
- 반환 타입은 모두 pure data다. filesystem이나 archive parsing은 섞지 않는다.

## scope boundary

- canonical module workspace layout과 `metadata.json`, `toggle/`, `variables/`, `assets/` ownership은 [`../../custom-extension/targets/module.md`](../../custom-extension/targets/module.md)가 맡는다.
- module extract, pack, `.risum` 처리, asset file unpack은 node/CLI 영역이다.
- 이 페이지는 full workflow나 validation policy를 보장하지 않는다. 순수 object helper만 다룬다.

## evidence anchors

- `../../../packages/core/src/domain/module/index.ts`
- `../../../packages/core/src/domain/module/contracts.ts`
- `../../../packages/core/tests/export-surface.test.ts`
- `../../../packages/core/tests/module-extract.test.ts`
- `../../../packages/core/tests/custom-extension/module-canonical-pack.test.ts`

## 같이 읽을 문서

- [`../targets/root-browser.md`](../targets/root-browser.md)
- [`./custom-extension.md`](./custom-extension.md)
- [`./lorebook.md`](./lorebook.md)
- [`./regex.md`](./regex.md)
- [`../../custom-extension/targets/module.md`](../../custom-extension/targets/module.md)
