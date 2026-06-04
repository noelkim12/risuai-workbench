# RisuLua Split Customization Guide

이 문서는 `risulua-split` 패키지의 분할 규칙, 폴더 구조, 추출 로직 등을 사용자 요구에 맞게 수정하는 방법을 설명합니다.

## 1. Module-Table 모드 커스터마이징 (고급 의미 분석)

`module-table` 모드는 Tree-sitter와 심볼 분석을 통해 정밀하게 코드를 재구성합니다.

### 1.1. 폴더 구조 및 파일 경로 수정

분할된 파일들이 저장될 위치나 파일명을 바꾸고 싶을 때 수정합니다.

- **핵심 파일**: `packages/core/src/domain/risulua-split/module-table/module-table-contracts.ts`
- **수정 위치**: `RISULUA_MODULE_TABLE_*_PATH` 상수 정의 부분.
  - 예: `RISULUA_MODULE_TABLE_COMMON_HELPERS_PATH` 값을 바꾸면 공통 헬퍼의 저장 위치가 변경됩니다.
- **동적 경로**: `module-table-domain-grouping.ts`의 token grouping 규칙과 `module-table-classifier.ts`의 targetModule 배정에서 domain topic 파일명을 결정합니다. `handlerHelperPath`는 handler helper 파일명 규칙을 유지합니다.

### 1.1.1. Domain grouping customization rules

`module-table-domain-grouping.ts`를 수정할 때는 validated domain generation의 deterministic path contract를 먼저 지켜야 합니다. 경로가 바뀌는 규칙은 기존 workspace가 참조하던 `lua/domain/*.risulua` path를 바꿀 수 있으므로 fixture evidence와 candidate metadata를 함께 갱신합니다.

Safe extensions:

- singular/plural churn이 fixture로 확인된 경우에만 normalized token을 추가합니다. 예를 들어 단수와 복수 함수명이 같은 의미 단위로 반복될 때만 새 phrase를 허용합니다.
- 최소 두 개의 generated candidate가 같은 stable family path를 공유해야 할 때만 utility-family 또는 action-family token을 추가합니다.
- cycle coalescing 이후 semantic cluster를 복구할 때는 cluster 전체를 trial path로 되돌린 뒤 `cyclicModuleComponents()`로 require cycle이 없는지 확인합니다.
- path가 바뀔 수 있는 grouping에는 `docs/domain-candidates.json`의 `grouping.reason`이나 grouping diagnostics처럼 사람이 검토할 수 있는 evidence text를 남깁니다.

Unsafe extensions:

- 모든 one-way dependency를 같은 domain 파일로 묶지 않습니다. 한 함수가 다른 함수를 호출한다는 사실만으로는 topic evidence가 아닙니다.
- cycle에서 빠질 수 있다는 이유만으로 모든 함수를 singleton path로 복구하지 않습니다. 이는 `lua/domain/<function_name>.risulua` 파일을 과도하게 만들 수 있습니다.
- `utils`, `helpers`, `core`처럼 넓은 bucket을 만들지 않습니다. 이런 이름은 작은 함수들을 과하게 모아 후속 설계를 어렵게 만듭니다.
- source order나 random graph algorithm으로 path를 선택하지 않습니다. 같은 입력은 항상 같은 path를 만들어야 합니다.
- report/wiki 의존성을 `module-table-domain-grouping.ts`로 끌어오지 않습니다. grouping은 splitter 단계의 순수 contract여야 하고, report와 wiki는 sidecar consumer로 남아야 합니다.
- LLM, API embedding, local ONNX embedding, model download를 기본 grouping 결정에 넣지 않습니다. 이런 semantic advisor는 명시적 opt-in diagnostics로만 허용합니다.

### 1.2. 심볼 분류 규칙 수정 (추출 여부 결정)

특정 함수가 왜 추출되지 않는지, 혹은 왜 전역 브리지가 생성되는지 로직을 바꾸고 싶을 때 수정합니다.

- **핵심 파일**: `packages/core/src/domain/risulua-split/module-table/module-table-classifier.ts`
- **핵심 함수**:
  - `unsafeLocalHelperReason()`: 로컬 함수를 `main.risulua`에 남겨야 하는(Preserve) 이유를 판정합니다. 여기서 조건문을 주석 처리하거나 완화하면 추출 범위가 넓어집니다.
  - `classifyNestedHelper()`: 핸들러 내부의 중첩 함수를 파라미터화하여 추출할지 결정하는 8단계 우선순위 로직입니다.
  - `unsafePublicGlobalReason()`: 전역 함수를 안전하게 외부로 뺄 수 있는지 검사합니다.

#### Residual closure clusters and ABI bridge policy

`preserve:captures-mutable-state`가 남아 있는 report를 읽을 때는 남은 클러스터가 실제 미분할 구현인지, 아니면 의도적으로 `lua/main.risulua`에 유지한 host ABI bridge인지 먼저 구분합니다. Gacha Island 같은 대형 스크립트에서는 main에 남은 public 이름이 모두 실패가 아니라, host가 호출해야 하는 ABI shell일 수 있습니다.

Important fields:

- `generationStatus`: candidate가 `generated`, `blocked`, `report-only` 중 어디에 있는지 보여줍니다. `generated`이면 main wrapper가 남아도 구현 body는 이미 domain module에 있을 수 있습니다.
- `generationBlockedReasons`: candidate가 왜 아직 생성되지 않았는지 설명합니다. 이 값이 있으면 단순히 preserve 조건을 완화하지 말고 blocker를 제거하는 방향으로 수정합니다.
- `recommendedPath`: 사람이 기대해야 하는 stable target입니다. 예를 들어 forge cluster는 `lua/domain/forge.risulua`, store-backed data는 `lua/state/variable_store.risulua`를 가리켜야 합니다.
- `grouping.reason`: `cluster-policy` 또는 `domain-grouping:cluster-cycle-coalesced` 같은 grouping evidence를 확인하는 필드입니다. path 정책을 바꾸면 이 reason과 refactor-map/rendering 테스트도 같이 갱신합니다.

Common Gacha Island-style blockers:

- `preserve:captures-mutable-state`: 로컬 테이블/상수/캐시를 closure로 캡처해 body를 그대로 빼면 state alias가 깨질 수 있습니다. 먼저 `state.variable_store` 또는 explicit module dependency로 바꿉니다.
- `preserve:top-level-side-effect`: top-level 실행 순서 자체가 의미를 가지는 초기화/등록 코드입니다. side effect shell은 main에 남기고 순수 구현만 domain module로 위임합니다.
- `preserve:dynamic-global-reference-risk`: `_G[buttonName] = function(...) ... end`처럼 동적 이름을 host가 찾는 경우입니다. 동적 등록은 main에 남기되 callback body는 generated domain export로 delegate할 수 있습니다.

Modern split pattern:

1. Host-visible names와 dynamic `_G[...]` registrations는 `lua/main.risulua`에 유지합니다.
2. Canonical data tables는 `lua/state/variable_store.risulua`(`state.variable_store`)로 이동합니다.
3. Public global compatibility aliases는 main에 남겨 기존 host/script 참조가 계속 동작하게 합니다.
4. Implementation bodies는 `lua/domain/forge.risulua` 같은 cluster modules로 이동합니다.
5. Captures는 암묵적 closure가 아니라 explicit module dependencies로 rewrite합니다.

예시:

```lua
local __variable_store = require("state.variable_store")
local __domain_forge = require("domain.forge")

COMPANION_POOL_BOT = __variable_store.COMPANION_POOL_BOT

function forgeApplySkill(triggerId)
  return __domain_forge.applyCat(triggerId, "skill")
end
```

`unsafeLocalHelperReason()`을 임의로 완화해서 arbitrary captures를 추출 가능으로 만들지 마세요. 대신 capture를 `state.variable_store`, prompt-store, common helper, generated domain export, 또는 intentional ABI bridge 중 하나로 명시적으로 rewrite할 수 있게 만든 뒤 preserve reason을 제거해야 합니다.

### 1.3. 특수 저장소(Variable/Prompt Store) 추출 기준

최상위 변수들을 자동으로 `variable_store`나 `prompt_store`로 보내는 기준을 바꿀 때 수정합니다.

- **핵심 파일**: `packages/core/src/domain/risulua-split/module-table/module-table-writer.ts`
- **정규식 수정**:
  - `shouldExtractVariableStoreName()`: 스토어로 보낼 변수명 패턴 (현재 camelCase/PascalCase).
  - `shouldExtractPromptStoreName()`: 프롬프트 상수로 간주할 이름 패턴 (예: `*_PROMPT`, `*_INSTRUCTION`).

### 1.4. 생성되는 Lua 코드 스타일 수정

`main.risulua`에 생기는 `require` 문이나 브리지 할당문(`G = __globals.G`)의 모양을 바꿀 때 수정합니다.

- **상단 require/브리지**: `module-table-top-level-rewrite.ts` 내의 `planTopLevelRewrite()` 함수.
- **중첩 함수 파라미터화**: `module-table-nested-handler-rewrite.ts` 내의 `transformParameterizedHelperBody()` 함수.

### 1.5. Host ABI Shell 고도화 정책

`main.risulua`를 host ABI shell에 가깝게 유지하려면 다음 파일을 함께 확인합니다.

- **Export manifest**: `module-table-export-manifest.ts`
  - `docs/risulua-export-manifest.json`에 host-visible globals, duplicate groups, listener registrations, preserved reasons를 기록합니다.
- **Host API / field 분석**: `module-table-analyzer.ts`
  - `axLLM` 같은 RisuAI host API를 `asyncModelNetwork`로 분류합니다.
  - `response.success` / `{ success = false }` 같은 member field/key가 unknown global로 잡히지 않아야 합니다.
- **중복 public global 처리**: `module-table-classifier.ts`, `module-table-top-level-rewrite.ts`
  - pre-classification dedupe는 금지합니다.
  - 중복 정의는 source order를 보존하는 versioned bridge assignment로 main에 남기고, 구현 body는 `host_globals/duplicate_globals.risulua`로 이동합니다.
- **listener callback 처리**: `module-table-top-level-rewrite.ts`
  - `listenEdit(...)` 등록 호출은 main에 남깁니다.
  - callback body는 `runtime/listen_edit.risulua`로 이동하고 main에는 thin delegate callback만 남깁니다.

---

## 2. Coarse 모드 커스터마이징 (기본 원소 분할)

`section-bundle`이나 `plain-single` 프로파일에서 사용되는 기본 분할 방식입니다.

### 2.1. 원소별 타겟 경로 및 신뢰도(Confidence) 수정

어떤 종류의 코드 덩어리(Atom)가 어느 파일로 갈지 결정하는 규칙입니다.

- **핵심 파일**: `packages/core/src/domain/risulua-split/inventory/confidence.ts`
- **수정 위치**:
  - `HANDLER_TARGET_MAP`: `onStart`, `onInput` 등 핸들러가 저장될 고정 경로 매핑.
  - `classifyAtomForCoarseSplit()`: 각 원소의 성격(함수 선언, 할당, 리스너 호출 등)에 따라 `targetPath`와 `confidence`를 할당하는 메인 로직입니다.
- **사례**: "모든 순수 헬퍼를 `common/utils.risulua`로 보내고 싶다"면 이 함수 내의 `isPureHelperCandidate` 판정 부분의 `targetPath`를 수정하세요.

---

## 3. 공통 정책 및 보안

### 3.1. 경로 보안 정책

생성되는 파일 경로가 안전한지(Path Traversal 방지 등) 검사하는 로직입니다.

- **핵심 파일**: `packages/core/src/domain/risulua-split/shared/path-policy.ts`
- **수정 위치**: `evaluatePathPolicy()` 함수. 특정 디렉토리 이름을 금지하거나 허용할 때 수정합니다.

### 3.2. 호스트 API 리스트

RisuAI가 제공하는 API들을 감지하는 목록입니다.

- **핵심 파일**: `packages/core/src/domain/risulua-split/inventory/top-level-inventory.ts`
- **수정 위치**: `RISU_HOST_APIS` 상수 배열. 새로운 API가 추가되었다면 여기에 등록해야 분석기가 감지할 수 있습니다.

---

## 4. 수정 후 검증 방법

로직을 수정한 후에는 기존의 계약(Contract)이 깨지지 않았는지 반드시 확인해야 합니다.

1.  **유닛 테스트 실행**:
    ```bash
    npm run --workspace packages/core test tests/risulua-split-module-table-classifier.test.ts
    npm run --workspace packages/core test tests/risulua-split-module-table-writer.test.ts
    ```
2.  **무결성 검증**: `output/validators.ts`에 정의된 23가지 검증 로직이 자동으로 실행되어 리포트에 반영됩니다. 수정 후 `docs/risulua-split-report.md`를 확인하세요.
