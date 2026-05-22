# CBS Simulator 설계 메모

## 목표

CBS preview editor는 새로 구현할 CBS simulator의 결과를 표시하는 UI로 둡니다. Simulator는 `packages/core`에 로컬 구현하며, RisuAI upstream runtime을 직접 import하거나 호출하지 않습니다. 대신 upstream source를 직접 읽어 동작 규칙을 문서화하고, 그 규칙을 dry-run evaluator로 재현합니다.

Preview editor의 책임은 CBS를 실행하는 것이 아니라 simulator output, trace, effects, coverage, warnings를 보기 좋게 보여주는 것입니다.

## Upstream source mining 대상

Simulator 구현 전에 RisuAI upstream 구현을 직접 대조해야 합니다. 최소 조사 대상은 다음입니다.

- `risuChatParser`의 tokenization, interpolation, block parsing 흐름
- macro registry와 macro evaluation 순서
- `#if`, `#when` 조건 평가와 block skip 규칙
- variable, global, temp, toggle read/write 처리
- regex script pipeline과 CBS macro 평가가 끼어드는 지점
- custom regex flags와 angle directive 처리
- random, time, roll 계열 macro의 nondeterministic 동작
- side effect gate, 저장 허용 조건, runtime state mutation 조건
- unknown macro, 인자 오류, parse error, runtime error 처리 방식

이 조사는 호환성 근거를 만들기 위한 것이며, upstream runtime code를 extension이나 core에서 직접 실행한다는 뜻이 아닙니다.

## Core 구현 위치와 경계

구현 위치는 `packages/core/src/simulator`입니다. VSCode extension과 webview는 core simulator API를 호출해 결과만 소비합니다. 기존 CBS simulator는 이 위치에 계속 남으며, `.risuregex`용 preview DTO generator만 `packages/core/src/simulator/regex/` 아래에 추가합니다.

권장 계층은 다음입니다.

```text
VSCode TextDocument
  getText()

Fragment mapper
  cbs-fragments.ts 기준으로 CBS-bearing section 추출

packages/core CBS simulator
  dry-run parse, evaluate, trace, effect collection

Preview webview
  output, trace, warnings, effects, variables, coverage 표시
```

## 문서 수준 인터페이스

아래 이름은 구현 계약을 잡기 위한 설계 용어입니다. 실제 TypeScript type은 후속 구현에서 조정할 수 있습니다.

| 개념 | 역할 |
| --- | --- |
| `CbsSimulationContext` | workspace defaults, preview overrides, toggles, temp scope, seed, clock, execution limits를 담는 실행 환경 |
| `CbsSimulationInput` | fragment source, file URI, language id, section id, sample regex input, context를 묶은 simulator 입력 |
| `CbsSimulationResult` | rendered output, diagnostics, warnings, trace, effects, coverage를 담는 최종 결과 |
| `CbsSimulationTrace` | macro 평가 순서, condition branch, skipped block, variable resolution, unsupported fallback을 기록하는 실행 흔적 |
| `CbsSimulationEffect` | 변수 쓰기, global 변경, toggle 변경, regex pipeline action 같은 side effect 후보를 실제 mutation 대신 기록한 항목 |
| `CbsSimulatorCoverage` | 지원 macro, 미지원 macro, approximate semantic, runtime unknown 비율과 근거를 요약한 호환성 정보 |

## Dry-run 규칙

Simulator는 authoring aid이므로 원본과 workspace를 바꾸면 안 됩니다.

- `.risuvar`에 쓰지 않습니다.
- Workspace 파일, toggle, global state를 변경하지 않습니다.
- Side effect macro는 실행하지 않고 `CbsSimulationEffect`로 기록합니다.
- random, time, roll은 seed와 fixed clock을 받을 수 있어야 합니다.
- seed나 fixed clock이 없으면 nondeterministic warning을 함께 표시합니다.
- 실행 시간, macro count, recursion depth, output length에 제한을 둡니다.
- timeout이나 limit 초과는 partial result와 warning으로 반환합니다.
- unknown macro와 unsupported directive는 숨기지 않고 trace와 coverage에 남깁니다.

## Simulation context model

Context는 실제 runtime state가 아니라 preview용 snapshot입니다.

| 입력 범주 | 예 | 처리 |
| --- | --- | --- |
| Document variables | fragment에서 발견한 `getvar`, `setvar` 대상 | reference와 resolution source 표시 |
| Workspace defaults | `.risuvar` 또는 config에서 읽은 값 | 읽기 전용 snapshot |
| Preview overrides | 사용자가 webview에서 입력한 값 | dry-run context에만 적용 |
| Toggle state | `.risutoggle` metadata 또는 preview override | 조건 평가에 쓰되 저장하지 않음 |
| Temp scope | macro evaluation 중 생기는 임시 값 | simulation 내부 scope로만 유지 |
| Random/time | seed, fixed now, roll policy | 재현 가능한 preview를 위해 주입 가능 |

## Trace와 effect model

Trace는 preview editor가 사용자를 납득시키는 핵심 데이터입니다.

- 어떤 macro가 어떤 순서로 평가됐는지 표시합니다.
- `#if`, `#when` branch가 왜 선택 또는 skip됐는지 표시합니다.
- 변수 값이 workspace default, preview override, temp scope 중 어디서 왔는지 표시합니다.
- regex pipeline이 CBS output 앞뒤 어느 단계에서 적용됐는지 표시합니다.
- unsupported semantic은 output을 조용히 바꾸지 않고 warning과 coverage에 남깁니다.

Effect는 실제 쓰기가 아니라 예상 side effect 기록입니다.

```text
effect
  kind: variableWrite
  target: mood
  valuePreview: calm
  committed: false
  reason: dry-run simulator blocks .risuvar mutation
```

## 지원 범위와 미지원 범위

MVP에서 우선 지원할 범위는 다음입니다.

- 순수 text interpolation
- 기본 variable read와 preview override 적용
- seedable random, fixed time, simple roll preview
- `#if`, `#when`의 확인된 조건 subset
- unknown macro와 unsupported directive의 명시적 warning
- side effect macro의 effect record화
- regex simulator가 필요한 CBS macro 평가 요청

MVP에서 제외하거나 runtime unknown으로 표시할 범위는 다음입니다.

- 실제 `.risuvar` write
- workspace mutation 또는 toggle 저장
- upstream runtime callback이나 model call이 필요한 macro
- 정확한 runtime scheduling, async side effect, hidden global mutation
- 조사 전인 custom directive와 edge case parser recovery

Future scope는 upstream source mining과 parity fixture가 쌓인 뒤 확장합니다. 특히 macro registry coverage, nested block recovery, regex directive table, temp/global interaction은 단계적으로 넓힙니다.

## Regex pipeline과의 관계

Regex simulator는 CBS simulator의 하위 client처럼 동작해야 합니다. JS `RegExp` 실행과 RisuAI directive 해석은 `packages/core/src/simulator/regex/`의 preview generator가 맡되, `@@@ IN`, `@@@ OUT` 안에서 CBS macro evaluation이 필요하면 기존 core CBS simulator에 fragment와 context를 넘깁니다.

분리 원칙은 다음입니다.

- CBS macro semantics는 `packages/core` simulator가 소유합니다.
- JS regex syntax, capture, replacement diff는 regex simulator가 소유합니다.
- RisuAI custom regex flag와 directive는 JS flag와 분리해 표시합니다. Directive parity는 fixture-backed 근거가 쌓이기 전까지 simulated로 시작합니다.
- Regex pipeline stage가 CBS output 전인지 후인지 trace에 남깁니다.
- Regex result를 원본 `.risuregex`에 자동 저장하지 않습니다.

## Parity fixture 전략

Simulator drift를 줄이려면 upstream source reading 결과를 fixture로 고정해야 합니다.

1. Upstream에서 macro별 최소 입력과 기대 동작을 수집합니다.
2. Pure macro, condition macro, variable macro, regex directive, error recovery를 fixture category로 나눕니다.
3. Nondeterministic macro는 seed와 fixed clock fixture를 별도로 둡니다.
4. Side effect macro는 실제 mutation 결과가 아니라 effect record expectation을 검증합니다.
5. Runtime unknown은 snapshot에 unsupported reason을 남겨 나중에 coverage 확장 시 비교합니다.
6. Core simulator test와 preview editor fixture를 같은 corpus에서 파생합니다.

## Preview editor dependency flow

CBS preview editor는 simulator 결과를 foundation으로 삼습니다.

```text
TextDocument
  → fragment mapper
  → CbsSimulationInput
  → packages/core simulator
  → CbsSimulationResult
  → webview output, trace, effects, warnings, variables, coverage
```

따라서 webview는 partial evaluator를 자체 구현하지 않습니다. Webview는 UI state, sample input, preview override를 모으고, extension host는 이를 core simulator input으로 변환합니다. Output 신뢰도는 `CbsSimulatorCoverage`와 warning badge로 표시합니다.

## 표시 문구 원칙

- `Core simulator preview`처럼 로컬 dry-run임을 명시합니다.
- `Runtime-compatible final output`이라고 단정하지 않습니다.
- `Upstream-source-informed`는 upstream 구현을 읽고 반영했다는 뜻이지 upstream runtime을 직접 호출한다는 뜻이 아닙니다.
- Unknown과 unsupported는 실패가 아니라 아직 재현하지 않은 runtime semantic으로 보여줍니다.
