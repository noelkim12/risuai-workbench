# asset domain

이 문서는 `packages/core/src/domain/asset/asset-uri.ts` 한 파일이 맡는 URI 해석과 mime 확장자 추론만 다룬다.

## 이 페이지가 맡는 범위

- asset URI string을 pure data descriptor로 바꾸는 helper
- mime string에서 파일 확장자를 추정하는 helper

## current truth

- root export는 현재 `resolveAssetUri`, `guessMimeExt`, `AssetDict`, `ResolvedAsset`를 다시 노출한다.
- `resolveAssetUri`는 `__asset:`, `embeded://`, `embedded://`, `ccdefault:`, `data:...;base64,...`, `http://`, `https://`를 인식한다.
- return type은 실제 fetch 결과가 아니라 `{ data, type, metadata }` shape다.
- `data:` URI는 최대 50MB payload guard를 두고, 넘치면 `null`을 돌려준다.

## notable exported surface

| 축 | 현재 public 예시 |
|---|---|
| URI resolve | `resolveAssetUri`, `ResolvedAsset` |
| support dict | `AssetDict` |
| mime extension | `guessMimeExt` |

## 현재 코드가 고정하는 것

- `__asset:`는 asset index lookup으로 해석한다.
- `embeded://` 오탈자와 `embedded://` 둘 다 같은 embedded path로 받는다.
- remote URL은 실제 download를 하지 않고 `type: 'remote'`, `metadata.url`만 돌려준다.
- 알 수 없는 mime은 `.bin`으로 떨어진다.

## scope boundary

- 이 helper는 파일 저장, asset extraction, manifest assembly를 하지 않는다.
- remote fetch, cache, filesystem write는 pure domain 범위 밖이다.
- module asset workspace layout은 [`../../custom-extension/targets/module.md`](../../custom-extension/targets/module.md)와 node/CLI 흐름이 맡는다.

## evidence anchors

- `../../../packages/core/src/domain/asset/asset-uri.ts`
- `../../../packages/core/src/domain/index.ts`
- `../../../packages/core/tests/root-entry-contract.test.ts`
- `../../../packages/core/tests/export-surface.test.ts`

## 같이 읽을 문서

- [`../targets/root-browser.md`](../targets/root-browser.md)
- [`../node/README.md`](../node/README.md)
- [`./module.md`](./module.md)
