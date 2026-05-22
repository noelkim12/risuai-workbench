# CBS Simulator Compatibility Case Study

이 문서는 upstream RisuAI 동작과 risu-workbench 로컬 compatibility 정책을 분리해 기록합니다. Upstream 근거가 없는 항목은 canonical이라고 쓰지 않고, 실제 프리셋을 열기 위한 local tolerance로만 다룹니다.

## 요약: README와 CASE_STUDY의 개선 후보 분리 기준

`README.md`는 simulator 사용자가 바로 알아야 하는 entry/index 문서입니다. 따라서 context injection 필요 시점, 최소 fixture, 개선 후보 bucket, 관련 문서 링크를 짧게 둡니다.

`CASE_STUDY.md`는 특정 문법의 근거와 정책을 보존하는 문서입니다. Upstream canonical인지, upstream evidence가 부족하지만 로컬에서 받는지, runtime context가 필요한지를 사례별로 나눕니다. 이렇게 나누면 README는 사용 진입점을 유지하고, CASE_STUDY는 호환성 판단의 감사 로그 역할을 할 수 있습니다.

## `#each {{? {{lastmessageid}}}} item`

### 관찰

실제 프리셋에는 다음처럼 `lastmessageid` 계산 결과를 `#each` iterator source로 쓰는 형태가 있습니다.

```cbs
{{#each {{? {{lastmessageid}}}} item}}
  {{previous_chat_log::{{slot::item}}}}
{{/each}}
```

### Upstream findings

Upstream `#each`는 array-only로 확인됐습니다. Non-array 입력(`a,b,c`, `null`, `[1][2]` 같은 값)은 range나 list로 강제 변환되지 않고 expression text처럼 통과합니다. 따라서 scalar math 결과를 자동 range로 해석하는 동작은 upstream canonical로 볼 수 없습니다.

### Local policy

로컬 simulator는 프리셋 관찰을 위해 JSON array와 일부 legacy source fallback을 다룹니다. 하지만 `lastmessageid` 자체는 chat runtime state가 필요하므로, `chatHistory` context가 없으면 원문 보존과 runtime-unknown warning이 맞습니다. Concrete history preview가 필요하면 `chatHistory`를 주입합니다.

## Numeric close tags: `{{/1}}`, `{{/57}}`

### 관찰

Playground export prompt에서 깊은 block close sequence가 `{{/57}}`처럼 숫자 close tag로 나타났습니다.

```cbs
{{#if 1}}A{{#if 1}}B{{/2}}{{/1}}
```

### Upstream findings

Upstream docs/tests에서 generic close `{{/}}`와 named close는 확인되지만, numeric close tag를 canonical syntax로 확정할 근거는 부족합니다.

### Local policy

로컬 parser는 `isLegacyNumberedBlockClose()`로 `{{/[0-9]+}}`를 current block close shorthand처럼 허용합니다. 이는 upstream canonical 선언이 아니라 export된 프리셋을 깨지 않기 위한 compatibility입니다.

## `#if_pure` closed by `{{/if}}`

### 관찰

일부 프리셋은 deprecated `#if_pure` block을 `{{/if_pure}}`가 아니라 `{{/if}}`로 닫습니다.

```cbs
{{#if_pure 1}}pure{{/if}}
```

### Upstream findings

Upstream docs는 `{{#if_pure ...}}...{{/if_pure}}` 형태를 설명합니다. Upstream tests에서는 generic close `{{/}}`도 쓰입니다. 하지만 `#if_pure`를 `{{/if}}`로 닫는 형태가 upstream canonical이라는 근거는 확립되지 않았습니다.

### Local policy

로컬 parser는 `BLOCK_CLOSE_ALIASES`에서 `if_pure`의 close alias로 `if`를 허용합니다. 이 동작은 project/preset compatibility 요구사항이며, simulator fixture에서도 `{{#if_pure 1}}...{{/if}}`가 정상 평가되는 것을 회귀 보장합니다.

## `=>` math operator compatibility

### 관찰

일부 prompt에는 `>=` 대신 `=>`를 greater-than-or-equal 의미로 쓴 math expression이 있습니다.

```cbs
{{? 1=>1}}
{{#if {{? 2=>1}}}}yes{{/if}}
```

### Upstream findings

Upstream math comparison은 `>=`를 정규 연산자로 지원합니다. `=>`를 upstream canonical operator로 볼 근거는 없습니다.

### Local policy

로컬 simulator는 preset-tolerance compatibility로 `=>`를 `>=`와 동일하게 평가합니다. 적용 범위는 CBS math/calc comparison parsing 내부로 제한합니다. 기존 `=`, `==`, `!=`, `<`, `<=`, `>`, `>=`, logical operator, arithmetic behavior는 유지합니다.

## `{{equal::{{getglobalvar::toggle_trpgmode}}::>1}}`

### 관찰

다음 형태는 겉보기에는 `toggle_trpgmode > 1` 비교처럼 보일 수 있습니다.

```cbs
{{equal::{{getglobalvar::toggle_trpgmode}}::>1}}
```

### Upstream findings

Upstream `equal`은 strict string equality입니다. 즉 `args[0] === args[1]` 형태이며, 두 번째 인자 `>1`은 numeric comparison expression이 아니라 literal string입니다.

### Local policy

로컬 simulator도 `equal`을 string equality로 유지합니다. Numeric comparison이 필요하면 `{{? {{getglobalvar::toggle_trpgmode}}>1}}` 또는 compatibility 허용 범위의 `{{? {{getglobalvar::toggle_trpgmode}}=>1}}`처럼 math expression을 사용해야 합니다.
