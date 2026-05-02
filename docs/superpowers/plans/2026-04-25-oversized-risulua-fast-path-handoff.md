# Handoff: oversized `.risulua` CBS fast path 작성 방식

## 목적

512KiB를 넘는 `.risulua`는 CBS LSP가 full Lua/CBS fragment analysis를 의도적으로 비웁니다. 이 guard는 VS Code/CBS LSP가 거대 Lua 파일에서 parser/tokenizer, LuaLS proxy, workspace sync에 묶여 멈추는 일을 막기 위한 안전장치입니다.

다만 사용자는 거대 `.risulua` 안의 Lua string literal에서 `{{`, `{{getvar::}}`, `{{#when::...}}` 같은 CBS 편집을 계속 합니다. 따라서 일부 completion/hover는 full analysis 없이 **현재 줄에서 안전하게 판별 가능한 문맥만** bounded fast path로 복구합니다.

현재 대표 구현은 `packages/cbs-lsp/src/features/completion.ts`의 아래 경로입니다.

- `provideCheapRootCompletions()` — `{{`, `{{#` root builtin/block completion
- `provideCheapMacroArgumentCompletions()` — oversized `.risulua`의 `{{getvar::...}}` variable argument completion, `{{#when::...}}` operator+variable segment completion
- `getLineTextAtPosition()` — current-line extraction helper. 전체 파일 `split()` 금지

## 핵심 원칙

### 1. fast path는 full analysis를 대체하지 않는다

fast path는 정상 크기 문서나 fragment mapping이 가능한 문서를 우회하면 안 됩니다.

좋은 gate:

```ts
if (!shouldSkipOversizedLuaText(request.filePath, request.text.length)) {
  return null;
}
```

의미:

- 정상 `.risulua`: 기존 `analysisService.locatePosition()` + `detectCompletionTriggerContext()` 유지
- `.risuhtml`/`.risulorebook`/`.risuregex`: 기존 fragment analysis 유지
- oversized `.risulua`: parser/tokenizer 없는 bounded path만 허용

### 2. bounded current-line scan만 허용한다

oversized path에서 아래 작업은 금지합니다.

- `request.text.split(...)`
- 전체 문서 regex `matchAll()`
- `mapToCbsFragments()`
- `analyzeDocument()` / `locatePosition()`
- Lua parser, CBS tokenizer/parser 호출
- `document.getText()`를 extension client에서 반복 호출하는 방식

허용되는 방식:

- 이미 서버가 가진 `request.text`에서 line/position 기준으로 현재 줄만 찾아 slice
- 현재 줄 prefix에서 `lastIndexOf('{{')`, `lastIndexOf('::')` 같은 bounded string operation 사용
- 현재 줄 안에서 macro가 이미 닫혔는지 `}}` boundary 확인

현재 `getLineTextAtPosition()`은 전체 배열을 만들지 않고 newline을 순차 탐색합니다. 이 helper를 바꿀 때는 oversized completion test에서 `String.prototype.split`이 호출되지 않는 계약을 유지해야 합니다.

### 3. 문맥 판별은 “확실한 것만” 한다

fast path가 다루는 문맥은 현재 줄 prefix만으로 확실해야 합니다.

현재 허용된 예:

```cbs
{{getvar::}}
{{getvar::mo}}
{{setvar::}}
{{#when::}}
{{#when::mood::}}
```

현재 의도적으로 피하는 예:

```cbs
{{/when}}
{{#each ...}}
{{? ...}}
{{getvar::{{nested::...}}}}
이미 닫힌 {{#when::ready}}:: 뒤
```

이런 문맥은 full parser 없이는 오탐 가능성이 크므로 `null`을 반환해 기존 경로나 no-op에 맡깁니다.

### 4. 후보 소스는 lightweight service만 사용한다

oversized completion에서 workspace variable 후보는 `VariableFlowService.getVariableCompletionSummaries()` 기반이어야 합니다. 후보마다 `queryVariable()`을 반복 호출하지 않습니다.

현재 `buildWorkspaceChatVariableCompletions()`는 cached summary를 읽고 `macro-argument` 용도로 stale workspace 후보도 표시합니다. 이 정책은 사용자가 입력 직후 workspace snapshot이 stale인 순간에도 `No suggestions`가 뜨지 않게 하기 위한 것입니다.

주의:

- `calc-expression`은 stale snapshot에서 workspace 후보를 숨기는 기존 정책이 있습니다.
- `macro-argument`와 `#when` segment는 stale 후보를 보여주고 metadata에 freshness를 남깁니다.
- temp/global variable까지 oversized fast path에서 지원하려면 `context.kind !== 'chat'` 정책과 후보 builder를 별도로 확장해야 합니다.

### 5. textEdit range는 macro 전체가 아니라 typed segment만 교체한다

fast path completion item은 host document 기준 `Range`를 직접 붙입니다.

예:

```cbs
{{getvar::mo}}
          ^^ only `mo` is replaced
```

`newText`는 bare candidate name이어야 합니다.

- variable: `shared`
- #when operator: `is`
- macro snippet 전체 삽입 금지

`{{getvar::}}`처럼 빈 segment면 start/end가 같은 empty range가 맞습니다.

## 현재 구현 흐름

```text
CompletionProvider.provideInternal()
  ├─ provideCheapRootCompletions()
  │   └─ `{{`, `{{#` root prefix만 처리
  ├─ provideCheapMacroArgumentCompletions()
  │   ├─ shouldSkipOversizedLuaText(...) 아니면 null
  │   ├─ current line만 추출
  │   ├─ last open `{{`와 last `::` 기준 segment 계산
  │   ├─ `#when`이면 operator + workspace variable 후보 생성
  │   └─ variable macro면 getVariableMacroArgumentKind(...)로 chat variable 후보 생성
  └─ analysisService.locatePosition(...)
      └─ 정상 문서의 기존 full fragment analysis path
```

## 새 fast path를 추가할 때 체크리스트

1. **Gate**
   - oversized `.risulua` 전용인가?
   - 정상 파일에서 `locatePosition()` 경로를 유지하는가?

2. **Bounded scan**
   - 전체 `split()`/regex/parser를 호출하지 않는가?
   - current line 또는 bounded suffix/prefix만 읽는가?

3. **문맥 안전성**
   - 현재 줄만 보고 확실히 판단 가능한 문맥인가?
   - nested CBS, close tag, calc expression, already-closed macro를 오탐하지 않는가?

4. **Candidate source**
   - cached summary 또는 static catalog만 쓰는가?
   - 후보마다 heavy query를 반복하지 않는가?

5. **Range**
   - host document 기준 textEdit range인가?
   - typed segment만 교체하는가?

6. **Stale metadata**
   - workspace snapshot이 stale일 때 숨길지/보여줄지 의도적으로 결정했는가?
   - 보여준다면 metadata가 유지되는가?

## 필수 테스트 패턴

### Unit: `packages/cbs-lsp/tests/features/completion.test.ts`

권장 테스트:

- oversized `.risulua` fixture를 만든다.
- `FragmentAnalysisService.locatePosition` spy가 호출되지 않는지 확인한다.
- `String.prototype.split` spy가 호출되지 않는지 확인한다.
- expected labels를 확인한다.
- builtin/root 후보가 섞이지 않는지 확인한다.
- textEdit range가 typed segment만 가리키는지 확인한다.

예시 검증 포인트:

```ts
expect(locateSpy).not.toHaveBeenCalled();
expect(splitSpy).not.toHaveBeenCalled();
expectCompletionLabels(completions, 'is', 'and', 'or', 'mood');
expectNoCompletionLabels(completions, 'getvar', 'setvar', '#when');
expect(completion.textEdit).toEqual({ range: ..., newText: 'is' });
```

### Integration: `packages/cbs-lsp/tests/lsp-server-integration.test.ts`

기존 filtered suite:

```bash
npm run --workspace cbs-language-server test -- tests/lsp-server-integration.test.ts -t "risulua-cbs"
```

이 filtered suite는 `.risulua` CBS routing이 서버 seam에서 유지되는지 확인합니다. 전체 `lsp-server-integration.test.ts`는 현재 workspace-state 관련 기존 실패 18건이 남아 있으므로, 이번 fast path 변경 검증에는 filtered suite를 우선 사용합니다.

### Perf: `packages/cbs-lsp/tests/perf/large-workspace.test.ts`

```bash
npm run --workspace cbs-language-server test -- tests/perf/large-workspace.test.ts
```

oversized guard가 유지되는지, large workspace budget이 깨지지 않는지 확인합니다.

### Build / diagnostics

```bash
npm run --workspace cbs-language-server build
```

수정 파일 LSP diagnostics도 확인합니다. 현재 기존 deprecated hint는 남아 있을 수 있지만 error는 없어야 합니다.

## 자주 생기는 실수

### 실수 1: `getLineTextAtPosition()`을 `split()`로 되돌림

큰 파일에서 completion마다 전체 파일 배열을 만들게 됩니다. Oracle review에서 ship blocker로 지적된 부분입니다.

### 실수 2: normal `.risulua`까지 fast path로 처리

정상 크기 문서는 fragment mapper가 string literal range와 parser context를 더 정확히 알고 있습니다. fast path는 oversized fallback일 뿐입니다.

### 실수 3: `#when` segment를 operator-only로 만들기

`#when` segment에는 operator 또는 variable이 올 수 있습니다. `buildWhenOperatorCompletions()`와 workspace chat variable completion을 함께 합쳐야 합니다.

### 실수 4: value argument에 variable completion을 열어버림

`setvar::name::value`, `addvar::name::value`의 value slot은 일반 문자열입니다. `getVariableMacroArgumentKind()`를 source of truth로 써서 variable namespace 여부를 판단해야 합니다.

### 실수 5: stale workspace 후보를 숨김

사용자가 입력한 직후 문서 version이 workspace snapshot보다 앞서면 stale이 됩니다. macro argument completion에서는 stale 후보도 보여주고 metadata로 표시해야 `No suggestions` 회귀를 피할 수 있습니다.

## 관련 파일

- `packages/cbs-lsp/src/features/completion.ts`
- `packages/cbs-lsp/src/core/completion-context.ts`
- `packages/cbs-lsp/src/analyzer/scope/scope-macro-rules.ts`
- `packages/cbs-lsp/src/utils/oversized-lua.ts`
- `packages/cbs-lsp/tests/features/completion.test.ts`
- `packages/cbs-lsp/tests/lsp-server-integration.test.ts`
- `packages/cbs-lsp/tests/perf/large-workspace.test.ts`
- `TODO.md`

## 현재 남은 별도 이슈

이 handoff와 별개로 `TODO.md`의 `#### Backlog`에는 아래 항목이 남아 있습니다.

- CBS LSP integration suite의 workspace-state 관련 기존 실패 18건 조사
- `.risulua` CBS 인자에서 default-only `.risuvar` 변수까지 rename/references 표면 확장 검토
