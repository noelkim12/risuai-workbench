# CBS Simulator

`packages/core`의 CBS simulator는 RisuAI upstream runtime을 직접 호출하지 않는 로컬 dry-run evaluator입니다. 목적은 프리뷰, trace, effect, diagnostics, coverage를 안전하게 제공하는 것이며, 실제 채팅 런타임과 workspace state를 변경하지 않습니다.

## 언제 simulator context injection이 필요한가

CBS source만으로 값이 결정되지 않는 macro는 명시 context를 주입해야 합니다. 주입하지 않으면 simulator는 런타임 값을 추측하지 않고 원문을 보존하거나 `partial`/warning을 남깁니다.

| 범주 | 예 | context가 없을 때 | 권장 주입 |
| --- | --- | --- | --- |
| 표시 이름/역할 | `{{user}}`, `{{char}}`, `{{role}}` | 원문 보존 또는 기본 안전값 | `userLabel`, `characterLabel`, `role` |
| 채팅 히스토리 | `{{lastmessageid}}`, `{{previous_chat_log::0}}` | runtime-unknown 원문 보존 | `chatHistory` |
| 전역/채팅 변수 | `{{getglobalvar::toggle_trpgmode}}`, `{{getvar::mood}}` | missing은 `null` 계열 값 | `globalVariables`, `chatVariables`, default variable maps |
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

```ts
simulateCbsText('{{lastmessageid}}|{{previous_chat_log::0}}', {
  chatHistory: ['hello', 'world'],
});
```

`chatHistory`가 없으면 `lastmessageid`와 `previous_chat_log`는 runtime-unknown으로 원문을 보존합니다.

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
