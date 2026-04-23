# regex domain

이 문서는 `packages/core/src/domain/regex/`의 순수 regex canonical adapter와 CBS variable helper만 다룬다.

## 이 페이지가 맡는 범위

- `.risuregex` 한 파일을 canonical object로 parse, serialize 하는 helper
- charx, module, preset upstream shape와 canonical regex 배열 사이의 순수 inject, extract
- regex script 안 CBS read/write 추출
- defaultVariables raw payload를 text, json에서 평평한 맵으로 읽는 helper

## current truth

- root export는 `parseRegexContent`, `serializeRegexContent`, `extractRegexFromCharx`, `extractRegexFromModule`, `extractRegexFromPreset`, `injectRegexIntoCharx`, `injectRegexIntoModule`, `injectRegexIntoPreset`, `buildRegexPath`, `extractRegexScriptOps`, `collectRegexCBSFromScripts`, `parseDefaultVariablesText`, `parseDefaultVariablesJson`를 다시 노출한다.
- accepted regex type은 현재 여섯 개다. `editinput`, `editoutput`, `editdisplay`, `editprocess`, `edittrans`, `disabled`.
- canonical regex entry는 `comment`, `type`, optional `flag`, optional `ableFlag`, `in`, `out`으로 고정된다.
- preset bridge는 extract 때 `presetRegex`, pack 쪽 canonical 문서에서는 payload `regex`로 이어지는 비대칭이 있다.

## notable exported surface

| 축 | 현재 public 예시 |
|---|---|
| canonical file adapter | `parseRegexContent`, `serializeRegexContent`, `CanonicalRegexEntry`, `RegexAdapterError` |
| upstream bridge | `extractRegexFromCharx`, `extractRegexFromModule`, `extractRegexFromPreset`, `injectRegexIntoCharx`, `injectRegexIntoModule`, `injectRegexIntoPreset` |
| naming | `buildRegexPath`, `REGEX_TYPES` |
| CBS helper | `extractRegexScriptOps`, `collectRegexCBSFromCharx`, `collectRegexCBSFromScripts` |
| variable parsing | `parseDefaultVariablesText`, `parseDefaultVariablesJson` |

## 현재 코드가 고정하는 것

- frontmatter는 required `comment`, `type`만 허용하고, 모르는 key는 reject한다.
- `@@@ IN`, `@@@ OUT` 둘 다 있어야 한다.
- absent optional field와 explicit default는 다르게 보존한다.
- `buildRegexPath`는 sanitize된 stem으로 `regex/<stem>.risuregex`를 만든다.
- regex script CBS 추출은 `in`, `out`, `flag`를 먼저 보고, 비어 있으면 `script`, `content` fallback을 본다.

## scope boundary

- regex directory ordering과 `_order.json` workspace layout 설명은 [`../../custom-extension/extensions/regex.md`](../../custom-extension/extensions/regex.md)가 맡는다.
- regex를 실제 파일로 extract, pack 하는 CLI workflow는 이 페이지 범위가 아니다.
- lorebook, lua와의 correlation report는 [`./analyze/README.md`](./analyze/README.md) 이후 문서가 맡는다.

## evidence anchors

- `../../../packages/core/src/domain/regex/index.ts`
- `../../../packages/core/src/domain/regex/contracts.ts`
- `../../../packages/core/src/domain/regex/adapter.ts`
- `../../../packages/core/src/domain/regex/scripts.ts`
- `../../../packages/core/tests/custom-extension/regex-canonical.test.ts`
- `../../../packages/core/tests/domain-phase1-extraction.test.ts`
- `../../../packages/core/tests/module-extract.test.ts`
- `../../../packages/core/tests/export-surface.test.ts`

## 같이 읽을 문서

- [`../targets/root-browser.md`](../targets/root-browser.md)
- [`./charx.md`](./charx.md)
- [`./module.md`](./module.md)
- [`./preset.md`](./preset.md)
- [`../../custom-extension/extensions/regex.md`](../../custom-extension/extensions/regex.md)
