# charx

## 범위

이 문서는 `charx` target이 workbench의 canonical workspace surface와 upstream character card, CharX container 처리 경로에 어떻게 닿는지 기록합니다. 초점은 `packages/core`의 extract/pack 경로, `character/` subtree, charx 전용 custom-extension artifact 경계입니다.

## local reference anchor

- 문서: `docs/custom-extension/README.md`, `docs/custom-extension/common/principles.md`, `docs/custom-extension/targets/charx.md`
- source tier: `local-reference`
- contract status: `reference-only`
- coverage boundary: canonical workspace layout, artifact ownership, root JSON 배제 원칙은 로컬 문서가 먼저 설명합니다. upstream truth는 아래 `characterCards.ts`, `processzip.ts`, `database.svelte.ts`를 다시 확인해야 합니다.

## 핵심 upstream anchor

- `risuai-pork/src/ts/characterCards.ts`
  - `importCharacterProcess`, `importCharacterCardSpec` 진입점
  - CCv3 envelope와 CharX import 흐름 확인 시작점
- `risuai-pork/src/ts/process/processzip.ts`
  - `CharXImporter`, `CharXWriter`
  - CharX ZIP 내부 `card.json`, `module.risum`, asset 저장 흐름 확인 시작점
- `risuai-pork/src/ts/storage/database.svelte.ts`
  - character 관련 stored shape, default preset 외부 경계, `setDatabase` 기본값 확인 시작점

## field entrypoint / test anchor

- field entrypoint
  - `data.description`, `data.first_mes`, `data.system_prompt`, `data.replaceGlobalNote`
  - `data.creator_notes`, `data.alternate_greetings`
  - `data.extensions.risuai.customScripts`, `data.extensions.risuai.triggerscript`
  - `data.extensions.risuai.defaultVariables`, `data.extensions.risuai.backgroundHTML`, `data.extensions.risuai.additionalText`
- test anchor
  - [gap] `charx` target 전용 upstream-traceability 회귀 테스트 문서는 저장소에서 확인하지 못했습니다.

## patch-following entrypoints

- workbench surface -> upstream path
  - `packages/core/src/cli/pack/character/workflow.ts` 수정 시 `risuai-pork/src/ts/characterCards.ts`, `risuai-pork/src/ts/process/processzip.ts`를 먼저 다시 봅니다.
  - `packages/core/src/cli/extract/character/workflow.ts` 수정 시 `risuai-pork/src/ts/characterCards.ts`, `risuai-pork/src/ts/process/processzip.ts`를 먼저 다시 봅니다.
  - `packages/core/src/domain/charx/blank-char.ts` 수정 시 `risuai-pork/src/ts/characterCards.ts`와 실제 import shape가 만나는 필드 이름을 다시 확인합니다.
- upstream patch -> affected docs/workbench surfaces
  - `risuai-pork/src/ts/characterCards.ts`가 바뀌면 `packages/core/src/domain/charx/blank-char.ts`, `packages/core/src/cli/extract/character/workflow.ts`, `packages/core/src/cli/pack/character/workflow.ts`를 다시 읽습니다.
  - `risuai-pork/src/ts/process/processzip.ts`가 바뀌면 charx container note, asset handling note, extract/pack 경계를 다시 검토합니다.
  - `risuai-pork/src/ts/storage/database.svelte.ts`에서 character 관련 field shape가 바뀌면 `character/metadata.json` ownership 설명과 field entrypoint를 다시 맞춥니다.

## trace table

| workbench path/symbol | local reference anchor | upstream path/symbol | field entrypoint / test anchor | source tier | contract status | relationship type | evidence type | last reviewed date | confidence | patch watchpoints / notes |
|---|---|---|---|---|---|---|---|---|---|---|
| `packages/core/src/domain/charx/blank-char.ts#createBlankCharxV3` | `docs/custom-extension/targets/charx.md` | `risuai-pork/src/ts/characterCards.ts` | `spec: 'chara_card_v3'`, `data.description`, `data.first_mes`, `data.extensions.risuai.*` | `upstream` | `canonical` | 직렬화 대응 | 코드 읽기 | 2026-04-19 | 높음 | workbench가 blank envelope를 V3 기준으로 세팅합니다. upstream의 card shape가 바뀌면 이 행부터 다시 봐야 합니다. |
| `packages/core/src/cli/extract/character/workflow.ts#runExtractWorkflow` | `docs/custom-extension/targets/charx.md`, `docs/custom-extension/common/principles.md` | `risuai-pork/src/ts/characterCards.ts#importCharacterProcess` | charx import path, `.charx/.png/.jpg` 입력, `character/`, `lorebooks/`, `regex/`, `lua/`, `variables/`, `html/` 출력 | `upstream` | `canonical` | 역직렬화 대응 | 코드 읽기 | 2026-04-19 | 중간 | workbench는 canonical extract를 문서화하고, upstream은 앱 import path를 가집니다. exact phase parity는 행 단위로 계속 재검토가 필요합니다. |
| `packages/core/src/cli/pack/character/workflow.ts#buildCharxFromCanonical` | `docs/custom-extension/README.md`, `docs/custom-extension/targets/charx.md` | `risuai-pork/src/ts/process/processzip.ts#CharXWriter` | `character/*.txt`, `character/metadata.json`, `lua/<target>.risulua`, `variables/<target>.risuvar`, `html/background.risuhtml` | `upstream` | `canonical` | 직접 매핑 | 코드 읽기 | 2026-04-19 | 중간 | workbench는 canonical overlay에서 charx를 재구성합니다. upstream container writer가 ZIP entry 규칙을 바꾸면 output packaging note를 다시 맞춰야 합니다. |
| `packages/core/src/cli/pack/character/workflow.ts#buildCharxFromCanonical` / `packages/core/src/cli/extract/character/workflow.ts#runExtractWorkflow` | `docs/custom-extension/targets/charx.md`, `docs/custom-extension/extensions/text.md` | `risuai-pork/src/ts/characterCards.ts`, `risuai-pork/src/ts/process/processzip.ts#CharXWriter` | `replaceGlobalNote`, `character/replace_global_note.risutext`, `data.replaceGlobalNote` | `upstream` | `canonical` | 직접 매핑 | 코드 읽기 | 2026-04-29 | 높음 | `replaceGlobalNote` / `character/replace_global_note.risutext`는 pack, extract, export 흐름에서 `data.replaceGlobalNote`로 직접 매핑합니다. |
| `packages/core/src/domain/charx/contracts.ts#CharxData` | `docs/custom-extension/targets/charx.md` | `risuai-pork/src/ts/storage/database.svelte.ts` | `customscript`, `triggerscript`, `defaultVariables`, `backgroundHTML`, creator metadata | `upstream` | `canonical` | 구조 참조 | 코드 읽기 | 2026-04-19 | 중간 | root-package DTO는 upstream 저장 shape를 요약한 호환 계층입니다. database field rename, nested path 이동 시 stale 가능성이 있습니다. |
| `packages/core/src/domain/custom-extension/contracts.ts#listOwnedCustomExtensionArtifacts` | `docs/custom-extension/common/principles.md`, `docs/custom-extension/targets/charx.md` | `risuai-pork/src/ts/characterCards.ts`, `risuai-pork/src/ts/storage/database.svelte.ts` | charx owned artifacts: lorebook, regex, lua, variable, html | `local-reference` | `reference-only` | 차이 문서화 | 기존 문서 근거 | 2026-04-19 | 중간 | local contract는 authoring ownership을 설명합니다. canonical 여부는 upstream field를 다시 확인해야 합니다. |

## Gap / Unverified

- [gap] `docs/cbs_pipeline.md`가 없어 CBS-bearing field를 target 문서에서 로컬 reference anchor로 연결하지 못했습니다. 현재는 `docs/custom-extension/common/principles.md`의 CBS 매핑 문단만 참조합니다.
- [unverified] workbench charx pack output이 upstream `CharXWriter`의 실제 ZIP entry naming과 완전히 같은지 이 문서에서는 끝까지 대조하지 못했습니다. `processzip.ts` 전체 writer path와 output buffer 생성부를 추가 검토해야 합니다.
- [unverified] `packages/core/src/domain/charx/contracts.ts#CharxData`의 DTO 필드가 upstream `database.svelte.ts` 전체 character shape와 1:1인지 확인 범위가 제한적입니다. 현재는 custom-extension 연관 필드 중심으로만 연결했습니다.

## Coverage boundary / cross-cutting ledger links

- local reference가 다루는 범위: canonical charx workspace layout, artifact ownership, root JSON 비주도 원칙
- 직접 upstream anchor를 다시 확인해야 하는 범위: CharX container entry, asset save semantics, app import side effect
- 관련 ledger 링크: [cross-cutting-gaps](../ledgers/cross-cutting-gaps.md). 교차 CBS gap과 charx container parity gap은 이 ledger에서 함께 추적합니다.

## 검토 메모

- `charx` 문서는 target 문서여서 lorebook, regex, lua, variable, html 세부 파서 설명까지 길게 끌고 가지 않습니다. 세부 artifact 문서가 생기면 이 문서에서는 target 경계와 patch-following만 유지하는 편이 맞습니다.
- local reference는 편의 진입점일 뿐 canonical이 아닙니다. field 결론을 확정할 때는 항상 upstream path를 다시 확인해야 합니다.
