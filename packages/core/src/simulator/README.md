# CBS Simulator

`packages/core`의 CBS simulator는 RisuAI upstream runtime을 직접 호출하지 않는 로컬 dry-run evaluator입니다. 목적은 프리뷰, trace, effect, diagnostics, coverage를 안전하게 제공하는 것이며, 실제 채팅 런타임과 workspace state를 변경하지 않습니다.

## Import Paths

이 모듈은 두 가지 canonical import 경로를 제공합니다.

### Package Root (권장)

```ts
// Canonical package-level entry point
import {
  simulateCbsText,
  createCbsPreviewVariableInjection,
} from '@risu-workbench/core/domain/cbs';
```

### Source-Level (테스트/내부용)

```ts
// Canonical source-level entry point for tests and internal modules
import {
  simulateCbsText,
  createCbsPreviewVariableInjection,
} from '../../../src/simulator';
```

> **참고**: simulator 전용 패키지 서브패스는 제공되지 않습니다. 위 두 가지 경로 중 하나를 사용하세요.

## 언제 simulator context injection이 필요한가

CBS source만으로 값이 결정되지 않는 macro는 명시 context를 주입해야 합니다. 주입하지 않으면 simulator는 런타임 값을 추측하지 않고 원문을 보존하거나 `partial`/warning을 남깁니다.

| 범주 | 예 | context가 없을 때 | 권장 주입 |
| --- | --- | --- | --- |
| 표시 이름/역할 | `{{user}}`, `{{char}}`, `{{role}}` | 원문 보존 또는 기본 안전값 | `userLabel`, `characterLabel`, `role` |
| 채팅 히스토리 | `{{lastmessageid}}`, `{{previous_chat_log::0}}` | runtime-unknown 원문 보존 | `chatHistory` |
| 전역/채팅 변수 | `{{getglobalvar::toggle_trpgmode}}`, `{{getvar::mood}}` | missing/null은 빈 출력 | `globalVariables`, `chatVariables`, default variable maps |
| temp scope | `{{tempvar::x}}`, `{{settempvar::x::1}}` | simulator-local temp만 사용 | `tempVariables` |
| 위치/로어 슬롯 | `{{position::ep1}}`, bare `{{slot}}` | 원문 보존 또는 frame miss | `lorePositions`, block slot frame을 만드는 source |
| 비결정 macro | `{{time::...}}`, `{{random::...}}`, `{{roll::...}}` | 기본 provider 사용 | `providers.clock`, `providers.rng`, `providers.pickHashRand` |
| side effect macro | `{{setvar::x::1}}`, `{{addvar::score::2}}` | preview mode에서는 source 보존 | `executionMode: 'execute'`로 dry-run effect만 기록 |

## 최소 context fixture 예시

### 전역 toggle 비교

```ts
simulateCbsText('{{#if {{? {{getglobalvar::toggle_trpgmode}}>=1}}}}TRPG{{/if}}', {
  globalVariables: { toggle_trpgmode: '2' },
});
```

`globalVariables`가 없으면 `getglobalvar`는 missing 값을 반환하므로 분기 결과가 실제 프리셋 의도와 달라질 수 있습니다.

### 채팅 히스토리 기반 반복

`chatHistory`는 오래된 메시지부터 최신 메시지 순서로 주입합니다. 문자열 배열과 role-bearing object 배열을 모두 받을 수 있습니다.

```ts
simulateCbsText('{{lastmessageid}}|{{previous_chat_log::0}}', {
  chatHistory: ['hello', 'world'],
});
// output: '1|hello'

simulateCbsText('{{previouscharchat}}|{{previoususerchat}}', {
  chatHistory: [
    { role: 'user', content: 'hello', createdAt: '2026-05-08T00:00:00.000Z' },
    { role: 'char', content: 'world', createdAt: '2026-05-08T00:00:05.000Z' },
    { role: 'user', content: 'again', createdAt: '2026-05-08T00:01:00.000Z' },
  ],
  chatHistoryCursor: 2,
});
// output: 'world|hello'
```

`lastmessageid`는 upstream parity에 맞춰 message count가 아니라 마지막 0-based index를 반환합니다. `previous_chat_log::N`은 상대 “이전 N번째”가 아니라 absolute 0-based index 조회입니다. `chatHistory`가 없으면 simulator는 런타임 값을 추측하지 않고 원문을 보존합니다.

VS Code extension에서 CBS preview를 호출할 때는 editor/project state를 `packages/core`로 직접 import하지 말고, adapter가 `CbsSimulationContext`를 조립해 `simulateCbsText(source, context, options)`에 전달해야 합니다. 최소 주입 단위는 `chatHistory`, `chatHistoryCursor`, variable maps, `lorePositions`, deterministic providers이며, simulator package는 dry-run 평가만 수행하고 실제 런타임 state를 변경하지 않습니다.

### Preview variable injector engine

Preview variable injector는 CBS 프리뷰가 사용할 변수 context를 caller가 명시적으로 합성하는 dry-run helper입니다. `createCbsPreviewVariableInjection(input)`은 preview override, 현재 chat 변수, 캐릭터 기본값, 템플릿 기본값을 순서대로 병합하고, 그 결과를 `effectiveContext`로 돌려줍니다. 실제 CBS 평가는 기존처럼 `simulateCbsText(source, injection.effectiveContext)`에 맡깁니다.

```ts
// Canonical import from package root
import {
  createCbsPreviewVariableInjection,
  simulateCbsText,
} from '@risu-workbench/core/domain/cbs';
import { parseVariableContent } from '@risu-workbench/core/domain/custom-extension/extensions/variable';

const workspaceDefaults = parseVariableContent('mood=calm\nscore=0');
const injection = createCbsPreviewVariableInjection({
  previewOverrides: {
    chatVariables: { mood: 'focused' },
  },
  workspaceDefaults: {
    characterDefaultVariables: workspaceDefaults,
  },
});

const preview = simulateCbsText(
  '{{getvar::mood}} {{getvar::score}}',
  injection.effectiveContext
);

// conceptual output: 'focused 0'
```

`parseVariableContent`는 이미 caller가 읽어 온 `.risuvar` 텍스트를 key-value map으로 바꾸는 읽기 전용 parsing support로만 사용합니다. 이 helper는 첫 번째 `=`만 나누고, 빈 줄은 건너뛰며, 값 내부 공백과 추가 `=`는 보존합니다. Injector 안에서는 custom-extension module을 import하지 않으며, caller가 필요한 경우에만 parsing 결과를 `workspaceDefaults.characterDefaultVariables`나 `workspaceDefaults.templateDefaultVariables`에 넘깁니다.

상태 의미는 trace와 warning을 읽기 위한 계약입니다. `missing`은 해당 scope에서 읽을 값이 없다는 뜻이고, `runtimeUnknown`은 `#each` iterator처럼 실제 런타임 frame이 있어야 확정되는 값입니다. 반대로 `''`, `0`, `false`, `null`처럼 falsy인 own value는 missing으로 취급하지 않고 resolved로 남깁니다. 단, `null`/`undefined` 변수 값의 preview output은 문자 `null`이 아니라 빈 문자열로 표시합니다. Caller는 값의 truthiness가 아니라 own-property 존재 여부를 기준으로 preview override와 default map을 준비해야 합니다.

`{{? ...}}` equality 비교(`=`, `==`, `!=`)에서는 이 빈 nullish 출력과 literal `null`/`undefined`를 비교 가능한 nullish operand로 취급합니다. 예를 들어 `{{#if {{? {{getvar::vg_Language}} != 2}}}}...{{/if}}`에서 `vg_Language`가 own-property `null`이면 `nullish != 2`가 true로 평가되어 body가 표시됩니다. 다만 이 보정은 equality 비교에만 적용되며, `{{? {{getvar::vg_Language}} < 2}}` 또는 `{{? {{getvar::vg_Language}} + 2}}`처럼 산술/관계 연산에 빈 nullish 값이 들어가면 기존처럼 invalid expression diagnostic과 `NaN` preview를 유지합니다.

이 engine의 non-goal도 명확합니다. VS Code webview UI를 만들지 않고, preview override를 저장하지 않으며, `.risuvar`를 쓰지 않습니다. 또한 variable serializer나 injector write path를 호출하지 않으므로 `serializeVariableContent`, `injectVariablesIntoCharx`, `injectVariablesIntoModule`은 preview variable injector의 의존성이 아닙니다.

### deterministic clock/random

```ts
simulateCbsText('{{time::YYYY-MM-DD HH:mm}} {{random::a::b}}', {
  providers: {
    clock: () => new Date('2026-05-06T00:00:00.000Z'),
    rng: () => 0,
    pickHashRand: () => 0,
  },
});
```

시간과 난수는 preview 재현성을 위해 provider 주입을 우선합니다.

## Regex preview simulator

Regex preview simulator는 기존 CBS simulator를 대체하지 않습니다. CBS dry-run evaluator는 계속 `packages/core/src/simulator`에 남고, 새 `.risuregex` preview DTO generator만 `packages/core/src/simulator/regex` 아래에 둡니다.

`packages/core/src/simulator/regex`는 파싱된 `.risuregex` entry를 받아 viewer가 바로 읽을 수 있는 derived preview DTO를 만듭니다. Canonical `.risuregex` parse와 serialize 책임은 계속 `packages/core/src/domain/regex/`에 있습니다. Regex simulator layer는 그 canonical 결과를 소비해 match, replacement, directive plan, CBS section dry-run 결과를 조합합니다.

책임은 아래처럼 분리합니다.

- JS `RegExp` execution: JS flag subset만 사용해 match, capture, replacement preview, deterministic diff를 계산합니다.
- RisuAI directives: `<move_top>`, `<order n>`, `<cbs>` 같은 directive를 JS flags와 분리해 plan DTO와 notice로 표시합니다. Directive parity는 fixture-backed 근거가 쌓이기 전까지 `simulated` confidence로 시작합니다.
- CBS dry-run integration: `@@@ IN`, `@@@ OUT` section에서 CBS macro preview가 필요할 때 기존 `simulateCbsText` 기반 dry-run 결과를 연결합니다.

Core의 non-goal도 명확합니다. Core는 panel layout, editor watching, workspace state collection, persistence를 소유하지 않습니다. VS Code extension 또는 다른 caller가 editor 상태와 workspace snapshot을 모아 input으로 넘기고, core는 preview DTO만 반환합니다.

## 개선 후보 bucket

### Upstream parity bucket

Upstream에서 canonical 동작이 확인된 항목은 parity fixture로 고정합니다. 예를 들어 `#each`는 upstream에서 배열 입력만 반복하고, non-array 입력은 반복으로 강제 변환하지 않고 expression text처럼 통과합니다. 이 bucket은 upstream 근거가 있는 동작을 로컬 구현과 비교하는 데 씁니다.

### Local compatibility bucket

실제 프로젝트/프리셋 호환 때문에 로컬에서 더 관대한 입력을 받는 항목입니다. Numeric close tag(`{{/1}}`, `{{/57}}`), `#if_pure`를 `{{/if}}`로 닫는 형태, math 비교 연산자 `=>`는 upstream canonical이라고 단정하지 않고 로컬 compatibility로 문서화합니다.

### Runtime context bucket

`lastmessageid`, `previous_chat_log`, `position`, role/name 계열처럼 실제 런타임 state가 있어야 의미가 확정되는 항목입니다. 이 bucket은 구현 확대보다 context injection seam과 source-preservation 정책을 먼저 관리합니다.

### Documentation-only caution bucket

`{{equal::{{getglobalvar::toggle_trpgmode}}::>1}}`처럼 macro 이름만 보면 비교처럼 보이지만 실제로는 strict string equality인 사례는 문서로 오해를 막습니다. `>1`은 숫자 비교식이 아니라 literal string입니다.

## 관련 문서

- `CASE_STUDY.md` — upstream/local 사례별 근거와 정책 분리
- `docs/cbs-preview-editor/cbs-simulator.md` — preview editor 관점의 simulator 설계 메모
- `docs/cbs-preview-editor/2605051326-current-gap.md` — 기존 gap inventory
- `docs/superpowers/plans/2026-05-05-cbs-simulator-upstream-parity-follow-up.md` — upstream parity follow-up 계획 기록
