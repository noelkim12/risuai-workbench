# preset domain

이 문서는 `packages/core/src/domain/preset/`의 순수 preset object helper만 다룬다. preset template base overlay나 CLI workflow 전체는 여기서 늘리지 않는다.

## 이 페이지가 맡는 범위

- raw preset object에서 대표 prompt text를 읽는 helper
- raw preset object에서 `promptTemplate` 항목 배열을 읽는 helper

## current truth

- 현재 pure preset helper는 `getPresetPromptTextsFromPreset`, `getPresetPromptTemplateItemsFromPreset` 두 개다.
- prompt text helper는 `mainPrompt`, `jailbreak`, `globalNote`만 본다.
- 값이 string이고 비어 있지 않을 때만 결과에 남긴다.
- prompt template helper는 `promptTemplate`이 배열일 때만 각 item을 record로 정규화해서 돌려준다.

## notable exported surface

| 축 | 현재 public 예시 |
|---|---|
| prompt text | `getPresetPromptTextsFromPreset` |
| template items | `getPresetPromptTemplateItemsFromPreset` |

## 현재 코드가 고정하는 것

- prompt text 반환 이름은 `main`, `jailbreak`, `global_note` 세 가지로 고정된다.
- 누락된 필드는 조용히 빠진다. placeholder object를 만들지 않는다.
- helper는 preset의 regex, toggle, provider config, advanced settings를 직접 다루지 않는다.

## scope boundary

- canonical preset workspace layout, `prompt_template/`, `regex/`, `toggle/`, `prompts/`, `parameters.json` 같은 auxiliary surface는 [`../../custom-extension/targets/preset.md`](../../custom-extension/targets/preset.md)가 source of truth다.
- preset extract, `.risup` binary 처리, base template overlay는 node/CLI 영역이다.
- 이 페이지는 full preset authoring contract가 아니라 순수 object read helper만 설명한다.

## evidence anchors

- `../../../packages/core/src/domain/preset/index.ts`
- `../../../packages/core/tests/export-surface.test.ts`
- `../../../packages/core/tests/preset-extract-risup.test.ts`
- `../../../packages/core/tests/custom-extension/preset-canonical-pack.test.ts`

## 같이 읽을 문서

- [`../targets/root-browser.md`](../targets/root-browser.md)
- [`./custom-extension.md`](./custom-extension.md)
- [`./regex.md`](./regex.md)
- [`../../custom-extension/targets/preset.md`](../../custom-extension/targets/preset.md)
