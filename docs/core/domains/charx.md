# charx domain

이 문서는 `packages/core/src/domain/charx/`의 순수 card-shaped object helper만 다룬다. PNG, disk, archive parsing은 의도적으로 밖에 둔다.

## 이 페이지가 맡는 범위

- charx object에서 이름, lorebook, module lorebook, regex, defaultVariables raw를 읽는 helper
- root-package compatibility DTO 타입
- blank character, blank v3 envelope 생성 helper

## current truth

- `data.ts`는 `getCharacterName`, `getLorebookEntriesFromCharx`, `getModuleLorebookEntries`, `getAllLorebookEntriesFromCharx`, `getCustomScriptsFromCharx`, `getDefaultVariablesRawFromCharx`를 제공한다.
- `getCharacterName`은 `data.name`을 우선하고, 없으면 root `name`, 둘 다 없으면 `Unknown`을 돌려준다.
- lorebook helper는 `character_book.entries`와 `extensions.risuai._moduleLorebook`를 분리해서 읽고, 통합 helper도 따로 둔다.
- `blank-char.ts`는 upstream 기본값을 채운 blank character와 v3 envelope 생성 helper를 둔다.

## notable exported surface

| 축 | 현재 public 예시 |
|---|---|
| safe read helpers | `getCharxName`, `getCardName`, `getCharacterBookEntries`, `getModuleLorebookEntries`, `getAllLorebookEntries` |
| regex, variable raw | `getCustomScripts`, `getDefaultVariablesRaw` |
| types | `CardData`, `CharxData`, `CharxStructure`, `LorebookEntry`, `RegexScript`, `Variable` |

## 현재 코드가 고정하는 것

- helper는 object shape read만 한다. decode, unzip, image metadata, PNG text chunk parsing은 하지 않는다.
- module lorebook은 charx 내부 extension field에 들어와도 별도 helper로 읽는다.
- defaultVariables는 normalized map이 아니라 raw payload 그대로 반환한다.
- blank builder는 upstream 기본값과 chara_card_v3 envelope shape를 mirror하려고 한다.

## scope boundary

- `.charx` 파일 열기, PNG text chunk decode, card file sniffing, disk I/O는 [`../node/README.md`](../node/README.md)와 node entry 문서가 맡는다.
- canonical workspace layout과 `character/`, `lorebooks/`, `regex/`, `lua/`, `variables/`, `html/` ownership은 [`../../custom-extension/targets/charx.md`](../../custom-extension/targets/charx.md)를 본다.
- 이 페이지는 PNG parsing contract를 새로 만들지 않는다.

## evidence anchors

- `../../../packages/core/src/domain/charx/data.ts`
- `../../../packages/core/src/domain/charx/contracts.ts`
- `../../../packages/core/src/domain/charx/blank-char.ts`
- `../../../packages/core/tests/export-surface.test.ts`
- `../../../packages/core/tests/charx-extract.test.ts`
- `../../../packages/core/tests/custom-extension/charx-canonical-pack.test.ts`

## 같이 읽을 문서

- [`../targets/root-browser.md`](../targets/root-browser.md)
- [`../node/README.md`](../node/README.md)
- [`./lorebook.md`](./lorebook.md)
- [`./regex.md`](./regex.md)
- [`../../custom-extension/targets/charx.md`](../../custom-extension/targets/charx.md)
