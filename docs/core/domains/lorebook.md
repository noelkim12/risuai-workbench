# lorebook domain

이 문서는 `packages/core/src/domain/lorebook/`가 맡는 순수 lorebook 구조 분석과 activation chain 분석만 다룬다.

## 이 페이지가 맡는 범위

- lorebook entry 배열을 구조 정보로 정규화하는 helper
- folder path, keyword overlap, activation mode 계산
- lorebook content 안의 정적 activation chain 가능성 계산
- lorebook content의 CBS read/write 수집

## current truth

- root export는 `analyzeLorebookStructure`, `analyzeLorebookStructureFromCharx`, `collectLorebookCBS`, `analyzeLorebookActivationChains`, `analyzeLorebookActivationChainsFromCharx`, `analyzeLorebookActivationChainsFromModule`를 다시 노출한다.
- structure 분석은 folder entry와 regular entry를 나눠서 `folders`, `entries`, `stats`, `keywords`를 만든다.
- activation mode는 `constant`, `keyword`, `keywordMulti`, `referenceOnly` 네 가지다.
- chain 분석은 실제 runtime 실행이 아니라 content 안 keyword hit를 바탕으로 한 static 가능성 분석이다.
- chain edge status는 `possible`, `partial`, `blocked`다.

## notable exported surface

| 축 | 현재 public 예시 |
|---|---|
| structure | `analyzeLorebookStructure`, `LorebookStructureEntry`, `LorebookStructureResult` |
| CBS collection | `collectLorebookCBS`, `collectLorebookCBSFromCharx`, `collectLorebookCBSFromCard` |
| activation chain | `analyzeLorebookActivationChains`, `analyzeLorebookActivationChainsFromCharx`, `analyzeLorebookActivationChainsFromModule` |
| chain types | `LorebookActivationEntry`, `LorebookActivationEdge`, `LorebookActivationChainResult` |
| folder helpers | `buildRisuFolderMap`, `resolveRisuFolderName`, `buildLorebookFolderDirMap`, `planLorebookExtraction` |

## 현재 코드가 고정하는 것

- structure 분석은 nested folder path를 `Root/Child/Entry` 같은 path id로 보존한다.
- lorebook content 안 `extractCBSVarOps` 결과가 있으면 `hasCBS`, `collectLorebookCBS`에 반영된다.
- activation chain은 `@@recursive`, `@@unrecursive`, `@@no_recursive_search` directive를 읽는다.
- selective lorebook은 secondary key가 빠지면 `partial`로 남는다.
- charx 입력은 `character_book.recursive_scanning` 값을 읽어 global recursive scanning on/off를 반영한다.

## scope boundary

- `.risulorebook` canonical 파일 포맷과 round-trip 규칙은 여기서 소유하지 않는다. [`../../custom-extension/extensions/lorebook.md`](../../custom-extension/extensions/lorebook.md)를 본다.
- lorebook extract/pack workflow와 on-disk layout은 pure domain 범위가 아니다.
- lorebook과 regex, lua를 엮는 상관관계 그래프는 [`./analyze/README.md`](./analyze/README.md) 이후 문서가 맡는다.

## evidence anchors

- `../../../packages/core/src/domain/lorebook/structure.ts`
- `../../../packages/core/src/domain/lorebook/activation-chain.ts`
- `../../../packages/core/src/domain/lorebook/folders.ts`
- `../../../packages/core/tests/domain-phase1-extraction.test.ts`
- `../../../packages/core/tests/lorebook-activation-chain.test.ts`
- `../../../packages/core/tests/lorebook-folder-layout.test.ts`
- `../../../packages/core/tests/export-surface.test.ts`

## 같이 읽을 문서

- [`../targets/root-browser.md`](../targets/root-browser.md)
- [`./charx.md`](./charx.md)
- [`./module.md`](./module.md)
- [`../../custom-extension/extensions/lorebook.md`](../../custom-extension/extensions/lorebook.md)
