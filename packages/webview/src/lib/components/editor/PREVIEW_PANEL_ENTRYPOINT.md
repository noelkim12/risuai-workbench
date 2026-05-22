# PreviewPanel lens entrypoint

`PreviewPanel`의 CBS lens/chip 위치, 줄바꿈, preview output 표시가 이상할 때 먼저 확인할 파일 목록입니다.

## 1. 가장 먼저 볼 파일

### `packages/webview/src/lib/components/editor/main/PreviewPanel.svelte`

Preview output 안에 `[if ...]`, `[gv:...]`, `[ggv:...]` 같은 lens chip을 실제로 렌더링하는 핵심 파일입니다.

주요 확인 지점:

- `splitPreviewOutput()`
  - `preview.output`을 줄 단위로 나눕니다.
  - 빈 줄 보존 문제가 있으면 여기와 empty-line placeholder를 봅니다.
- `createTraceOutputLenses()`
  - runtime trace를 화면에 표시할 lens view model로 바꿉니다.
  - `outputLine`, `outputColumn`, placement 결정이 여기서 연결됩니다.
- `createLineSegments()`
  - output text 사이에 lens chip을 끼워 넣습니다.
  - 단어가 `J [if] apanese`처럼 쪼개지면 이 함수와 column 보정 로직을 봅니다.
- prefix-line/source-line 판정 로직
  - source에서 `{{#if ...}}`가 한 줄 전체를 차지하면 preview에서도 heading과 같은 줄에 붙지 않게 분리합니다.

대표 증상:

```txt
{{#if ...}}
## Heading
```

이게 아래처럼 보이면 `PreviewPanel.svelte`의 placement 정책 문제입니다.

```txt
[if ...] ## Heading
```

또는:

```txt
Japanese.
```

가 아래처럼 보이면 `createLineSegments()` / column 보정 문제입니다.

```txt
J [if ...] apanese.
```

## 2. PreviewPanel에 source text를 넘기는 연결부

### `packages/webview/src/lib/components/editor/main/MainEditor.svelte`

`PreviewPanel`에 runtime preview payload와 원본 CONTENT source를 넘기는 파일입니다.

확인할 것:

- `<PreviewPanel ... sourceText={lorebookState?.contentText} />`
  - source line 경계 판정에 필요합니다.
- `main-editor/previewRuntimeResult` handler
  - runtime preview payload를 `previewResult`에 반영합니다.
- `contentVersion` guard
  - stale runtime preview가 현재 editor 내용과 섞이지 않도록 막습니다.

대표 증상:

- editor와 preview가 서로 다른 버전의 내용을 표시함
- trace 위치는 맞는데 preview 결과가 stale처럼 보임
- source line 경계 판정이 작동하지 않음

이 경우 `MainEditor.svelte`를 확인합니다.

## 3. Lens label/내용 포맷터

### `packages/webview/src/lib/components/editor/main/cbsLensFormatter.ts`

Lens chip의 label과 상세 내용을 만드는 파일입니다.

확인할 것:

- `createTraceLensViewModel()`
  - trace event를 label/title/detailLines/tone으로 변환합니다.
- `createConditionLensLabel()`
  - `#if`, `#when` label을 만듭니다.
- `isVariableTraceNode()`
  - `getvar`, `getglobalvar`, `gettempvar`를 variable lens로 분류합니다.
- `isParentLensTraceNode()` / `isNestedLensChildTrace()`
  - nested trace를 parent lens에 흡수할지 판단합니다.

대표 증상:

- label이 `if vg_Language = 1`처럼 잘못 나오거나 너무 raw하게 나옴
- nested `getvar`가 parent `#if` lens에 흡수되지 않거나 중복 표시됨
- `gv`, `ggv`, `gtv` 같은 축약 label이 이상함

이 경우 `cbsLensFormatter.ts`를 확인합니다.

## 4. Webview trace payload 타입

### `packages/webview/src/lib/types/mainEditor.ts`

Webview 쪽 `MainEditorTraceEventPayload` 타입 정의 파일입니다.

확인할 것:

- `outputLine?: number`
- `outputColumn?: number`

대표 증상:

- `PreviewPanel.svelte`에서 `event.outputLine` / `event.outputColumn` 타입 오류가 남
- webview 내부 타입은 맞는데 payload field 접근이 막힘

이 경우 `packages/webview/src/lib/types/mainEditor.ts`를 확인합니다.

## 5. VS Code extension trace payload 타입

### `packages/vscode/src/editors/mainEditor/mainEditorTypes.ts`

VS Code extension host에서 webview로 보내는 runtime preview payload 타입 정의 파일입니다.

확인할 것:

- `MainEditorTraceEventPayload`에 `outputLine?: number`, `outputColumn?: number`가 있는지

대표 증상:

- core는 `outputLine/outputColumn`을 만들지만 extension 타입 계약에는 없음
- extension → webview 메시지 계약이 webview 타입과 어긋남

이 경우 `packages/vscode/src/editors/mainEditor/mainEditorTypes.ts`를 확인합니다.

## 6. Core outputLine/outputColumn 계산

### `packages/core/src/domain/editor/formats/lorebook/preview/runtime-preview.ts`

Core runtime preview 결과에 `outputLine`, `outputColumn`을 붙이는 파일입니다.

확인할 것:

- `buildTraceOutputPositionLookup()`
  - simulator trace의 `outputOffset`을 preview output line/column으로 변환합니다.
- `getOutputPositionFromOffset()`
  - UTF-16 offset을 `{ line, column }`으로 변환합니다.

대표 증상:

- core 결과 자체의 trace 위치가 틀림
- `PreviewPanel` 문제가 아니라 `createLorebookContentRuntimePreview()` 결과에서 이미 `outputLine/outputColumn`이 틀림

이 경우 `runtime-preview.ts`를 확인합니다.

## 7. Simulator outputOffset 원천

### `packages/core/src/simulator/engine/trace.ts`

Trace event에 `outputOffset`을 붙이는 파일입니다.

확인할 것:

- `pushTrace()`
  - 현재 `outputOffsetStack` 값을 trace event에 기록합니다.

### `packages/core/src/simulator/simulate.ts`

Output 누적과 `outputOffsetStack`을 관리하는 파일입니다.

확인할 것:

- `visitNodes()`
  - node output을 누적하고 현재 output offset을 갱신합니다.

### `packages/core/src/simulator/blocks/if.ts`

`#if` block trace가 언제 찍히는지 확인할 때 봅니다.

확인할 것:

- `evaluateIfBlock()`
  - `#if` trace는 body output이 붙기 전 위치에 기록됩니다.
  - `trimLines()`로 source의 leading newline이 output에서 사라질 수 있습니다.

대표 증상:

- adjacent inline `#if`에서 truthy/falsy 조합에 따라 column이 예상과 다름
- `#if`가 source에서는 한 줄을 차지했지만 output에서는 다음 text line과 같은 line/column으로 계산됨

이 경우 simulator 쪽 파일들을 확인합니다.

## 8. Regression test 위치

### `packages/core/tests/editor/lorebook-preview-runtime.test.ts`

Runtime preview의 output과 trace 위치를 고정하는 테스트 파일입니다.

추가하면 좋은 테스트:

- standalone empty `getvar/getglobalvar` 뒤 blank line 보존
- source macro-only `#if` line 뒤 heading 출력
- adjacent inline `#if` truthy/falsy 조합
- nested `#if`가 단어를 쪼개지 않는지 확인

## 빠른 판단표

| 증상 | 먼저 볼 파일 |
| --- | --- |
| `[if]`가 heading과 같은 줄에 붙음 | `PreviewPanel.svelte`, `MainEditor.svelte` |
| `J [if] apanese`처럼 단어가 쪼개짐 | `PreviewPanel.svelte` |
| lens label이 이상함 | `cbsLensFormatter.ts` |
| `event.outputLine` 타입 오류 | `packages/webview/src/lib/types/mainEditor.ts`, `packages/vscode/src/editors/mainEditor/mainEditorTypes.ts` |
| core preview 결과부터 line/column이 틀림 | `runtime-preview.ts`, `trace.ts`, `simulate.ts`, `if.ts` |
| stale preview처럼 보임 | `MainEditor.svelte` |

## 기본 원칙

Preview lens는 preview output을 바꾸면 안 됩니다.

- output text에 없는 줄바꿈을 만들면 안 됩니다.
- output text의 단어 중간을 쪼개면 안 됩니다.
- source에서 한 줄 전체를 차지한 control macro는 그 source line 경계를 보존해야 합니다.
- source line 안에서 문장 일부로 쓰인 inline macro는 inline으로 표시해야 합니다.
- 최종 판단은 `preview.output`, `trace.outputLine`, `trace.outputColumn`, 그리고 원본 `sourceText`를 함께 봐야 합니다.
