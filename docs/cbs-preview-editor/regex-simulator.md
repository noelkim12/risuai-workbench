# Regex Simulator 요구사항

Regex simulator는 Regexr-like UX를 목표로 하되 RisuAI custom-extension 문법과 JS `RegExp` 실행 범위를 분리해야 합니다. 관련 파일 타입은 `.risuregex`이며 CBS-bearing section은 `@@@ IN`, `@@@ OUT`입니다.

## 구현 위치와 도메인 경계

Regex preview 구현은 `packages/core/src/simulator/regex/`에 둡니다. 이 layer는 `.risuregex` preview 화면이 소비할 derived DTO를 만들며, JS `RegExp` 실행 결과, replacement diff, directive plan, CBS dry-run 결과를 한 결과로 묶습니다.

`packages/core/src/domain/regex/`는 계속 canonical `.risuregex` parse와 serialize owner입니다. Simulator는 domain parser가 만든 entry를 소비하고, canonical 문서 구조나 serializer 정책을 새로 정의하지 않습니다.

Directive parity는 보수적으로 표시합니다. RisuAI directive가 들어간 preview는 fixture-backed 근거가 쌓이기 전까지 runtime parity를 `simulated`로 보여주고, JS-only native replacement처럼 근거가 명확한 subset만 verified로 다룹니다.

## 기본 UX

한 화면에서 아래 정보를 동시에 볼 수 있어야 합니다.

- Pattern
- Flags와 RisuAI directives
- Preview input
- Match highlight
- Match list
- Capture groups와 named groups
- Replacement output
- Error, warning, explain panel
- Variable result diff

## JS regex와 RisuAI directive 분리

`.risuregex`의 `flag`에는 JS regex flag만 들어간다고 볼 수 없습니다. 예를 들어 `g<move_top>` 같은 값은 JS `RegExp`에 그대로 넣을 수 없습니다.

따라서 parser는 flag string을 아래처럼 분류해야 합니다.

| 분류 | 예 | 처리 |
| --- | --- | --- |
| JS flags | `g`, `i`, `m`, `s`, `u`, `y`, `d` | JS `RegExp` 생성에 사용 |
| RisuAI directives | `<move_top>` 같은 angle directive | JS 실행에서는 제외, directive panel에 표시 |
| Unknown tokens | 확인되지 않은 flag fragment | warning으로 표시 |

UI copy는 `Executed with JS RegExp subset`처럼 명시해 runtime과 다를 수 있음을 알려야 합니다.

## Pattern과 replacement

Simulator는 `@@@ IN`과 `@@@ OUT`의 의미를 분리해 보여줘야 합니다. Pattern matching과 replacement output을 한 번에 묶되, section source가 어디인지 명확히 표시합니다.

필수 항목은 다음입니다.

- 현재 pattern source 위치
- 현재 replacement source 위치
- Sample input
- Match count
- Match ranges
- `$1`, `$2` 같은 numeric capture 사용 여부
- `$<name>` 같은 named capture 사용 여부
- Replacement 후 output
- Replacement 전후 diff

## Variable diff

Regex rule이 variable에 영향을 주거나 CBS macro와 함께 쓰이는 경우 preview-only variable override와 결과 diff가 필요합니다. 초기 단계에서는 실제 runtime side effect를 실행하지 말고 예상 영향과 미지원 항목을 분리해 표시합니다.

권장 표시 방식은 다음입니다.

```text
Variables
  referenced: userName, mood
  preview overrides: mood = calm
  affected output: yes
  runtime side effect: unknown
```

## Error와 explain panel

Regexr-like explain panel은 pattern token 설명, unsupported flag, invalid capture reference를 보여줍니다.

에러 분류는 다음처럼 나눕니다.

- JS syntax error, `new RegExp()` 실패
- Unsupported JS flag
- RisuAI directive, JS 실행에서 제외됨
- Replacement capture missing
- CBS macro unsupported in simulator
- Runtime compatibility unknown

## 안전한 실행 제한

Regex simulator는 사용자 입력 pattern을 실행하므로 긴 입력과 catastrophic backtracking에 대비해야 합니다.

- Sample input length cap
- Execution timeout 또는 worker 격리
- Match count cap
- Highlight range cap
- 큰 replacement output truncation
- Preview-only 실행, 원본 자동 저장 금지

## 후속 확인 질문

- MVP에서 replacement output까지 포함할지, match highlight만 먼저 만들지 결정합니다.
- RisuAI directive explain table을 직접 관리할지, docs에서 읽을지 결정합니다.
- Regex simulator가 active `.risuregex`만 다룰지, 임의 scratch pattern도 허용할지 결정합니다.
