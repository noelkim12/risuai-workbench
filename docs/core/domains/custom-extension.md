# 커스텀 익스텐션 도메인 (Custom Extension Domain)

이 문서는 `packages/core/src/domain/custom-extension/`이 정의하는 순수 명세, 아티팩트(Artifact) 분류, CBS 조각 매핑(Fragment Mapping)만을 다룹니다. `.risu*` 포맷의 상세 명세는 이 문서에서 중복 기술하지 않습니다.

## 이 페이지가 담당하는 범위

- 표준 대상(Canonical Target), 아티팩트, 마커(Marker) 명세
- 대상별 소유권 매트릭스(Ownership Matrix) 및 표준 상대 경로 규칙
- 순수 탐색 결과 타입(Pure Discovery Result Type) 및 아티팩트 필터링 헬퍼
- 공유 허용 손실 레지스트리(Allowed-loss Registry)
- 커스텀 익스텐션 파일을 CBS 조각으로 매핑하는 순수 헬퍼
- 루트 엔트리에서 재내보내기되는 Lua 및 토글(Toggle) 어댑터

## 구현 명세 (Current Truth)

- `packages/core/src/domain/custom-extension/index.ts`는 `contracts`, `allowed-loss`, `cbs-fragments`, `file-discovery`, `extensions/toggle`, `extensions/lua`만을 루트 도메인 배럴로 노출합니다.
- 대상(Target) 집합은 `charx`, `module`, `preset`으로 확정되어 있습니다.
- 아티팩트 집합은 `lorebook`, `regex`, `lua`, `prompt`, `toggle`, `variable`, `html`로 구성됩니다.
- 경로 규칙은 아티팩트 명세가 신뢰 기준(Source of Truth)입니다. 로어북/정규식/프롬프트는 스템(Stem) 기반, Lua/변수는 대상 이름 기반, HTML은 고정된 `background`, 프리셋 토글은 고정된 `prompt_template` 경로를 사용합니다.
- CBS 포함 아티팩트는 `lorebook`, `regex`, `prompt`, `html`, `lua`이며, `toggle`과 `variable`은 명시적으로 CBS 비포함 아티팩트로 분류됩니다.

## 주요 공개 인터페이스

| 구분 | 주요 인터페이스 예시 |
|---|---|
| 명세 및 계약 | `CUSTOM_EXTENSION_TARGETS`, `CUSTOM_EXTENSION_ARTIFACTS`, `CUSTOM_EXTENSION_ARTIFACT_CONTRACTS` |
| 소유권 및 경로 | `listOwnedCustomExtensionArtifacts`, `supportsCustomExtensionArtifact`, `buildCanonicalArtifactPath` |
| 접미사 및 경로 해석 | `parseCustomExtensionArtifactFromSuffix`, `parseCustomExtensionArtifactFromPath` |
| 허용 손실 규칙 | `ALLOWED_LOSS_CATEGORIES`, `ALLOWED_LOSS_RULES`, `listAllowedLossRules` |
| CBS 조각 매핑 | `mapToCbsFragments`, `mapLorebookToCbsFragments`, `mapRegexToCbsFragments`, `mapPromptToCbsFragments`, `mapHtmlToCbsFragments`, `mapLuaToCbsFragments` |
| 로우 어댑터 (Raw Adapters) | `parseLuaContent`, `serializeLuaContent`, `resolveDuplicateLuaSources`, `parseToggleContent`, `serializeToggleContent`, `resolveDuplicateToggleSources` |

## 이 페이지가 포맷 상세를 중복 기술하지 않는 이유

각 아티팩트의 세부 포맷은 하위 문서를 신뢰 기준(Source of Truth)으로 삼습니다.

- 로어북 상세: [`../../custom-extension/extensions/lorebook.md`](../../custom-extension/extensions/lorebook.md)
- 정규식 상세: [`../../custom-extension/extensions/regex.md`](../../custom-extension/extensions/regex.md)
- Lua 상세: [`../../custom-extension/extensions/lua.md`](../../custom-extension/extensions/lua.md)
- 프롬프트 템플릿 상세: [`../../custom-extension/extensions/prompt-template.md`](../../custom-extension/extensions/prompt-template.md)
- 토글 상세: [`../../custom-extension/extensions/toggle.md`](../../custom-extension/extensions/toggle.md)
- 변수 상세: [`../../custom-extension/extensions/variable.md`](../../custom-extension/extensions/variable.md)
- HTML 상세: [`../../custom-extension/extensions/html.md`](../../custom-extension/extensions/html.md)
- 전체 탐색 순서 가이드: [`../../custom-extension/README.md`](../../custom-extension/README.md)

## 범위 명세 (Scope Boundary)

- Node.js 환경에서 실제 폴더를 순회하는 워크스페이스 탐색 로직은 [`../node/README.md`](../node/README.md)에서 우선적으로 설명합니다. 이 페이지는 순수 탐색 결과 형상(Shape)만을 다룹니다.
- 캐릭터/모듈/프리셋 패키징 워크플로우 전체를 소유하지 않습니다. 대상별 표준 레이아웃은 [`./charx.md`](./charx.md), [`./module.md`](./module.md), [`./preset.md`](./preset.md) 및 상기 커스텀 익스텐션 대상 문서를 참조하십시오.
- 로어북/정규식 어댑터의 세부 파싱, 주입, 왕복 규칙은 각 아티팩트 문서가 신뢰 기준입니다.

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
