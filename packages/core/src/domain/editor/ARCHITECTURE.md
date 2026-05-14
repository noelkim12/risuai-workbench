# editor architecture

이 문서는 `packages/core/src/domain/editor` 리팩토링 중 유지해야 하는 책임 경계와 의존성 규칙을 고정합니다.

## Current folder map

현재 구조는 `editor/` 루트에 문서와 public barrel만 두고, 실제 구현을 `document-model/`, `shared/`, `formats/`, `preview/`, `runtime-profile/`로 분리합니다.

| File/Directory | Responsibility |
|---|---|
| `document-model/types.ts` | 공통 문서 모델 타입과 format별 state 타입 |
| `document-model/parse-main-editor-document-model.ts` | `formatKind`별 parser dispatch |
| `document-model/index.ts` | document-model 하위 barrel |
| `shared/diagnostics/` | editor warning DTO |
| `shared/frontmatter/` | frontmatter 타입과 parser |
| `shared/sections/` | section header 수집, section block 생성, scan orchestration |
| `shared/source-position/` | source range/position 타입과 line offset index |
| `preview/types.ts` | 공통 preview DTO 타입 (`EditorPreviewStatus`, `EditorPreviewDiagnostic`, `EditorPreviewMetadataBase`) |
| `preview/create-preview-diagnostic.ts` | CBS simulator diagnostic을 preview DTO로 변환하는 공통 helper |
| `preview/coverage-summary.ts` | CBS simulation coverage 요약 포맷 helper |
| `formats/lorebook/document-model.ts` | lorebook parse/reassemble |
| `formats/lorebook/types.ts` | lorebook format state 타입 |
| `formats/lorebook/schema.ts` | lorebook frontmatter field 이름과 필수 section schema |
| `formats/lorebook/serialize-policy.ts` | lorebook serialize warning policy (`canSerializeLorebookModel`) |
| `formats/lorebook/content-position-mapper.ts` | lorebook CONTENT 전용 Monaco/source coordinate mapping |
| `formats/lorebook/preview/quick-preview.ts` | lorebook CONTENT CBS dry-run preview |
| `formats/lorebook/preview/runtime-preview.ts` | lorebook CONTENT runtime preview with variable bindings |
| `formats/regex/document-model.ts` | regex parse/reassemble |
| `formats/regex/types.ts` | regex format state 타입 |
| `formats/regex/schema.ts` | regex section 이름 schema |
| `formats/regex/serialize-policy.ts` | regex serialize warning policy (`canSerializeRegexModel`) |
| `formats/regex/preview.ts` | regex preview adapter |
| `formats/prompt/document-model.ts` | prompt parse/reassemble |
| `formats/prompt/types.ts` | prompt format state 타입 |
| `formats/prompt/schema.ts` | prompt section 이름과 type rule schema |
| `formats/prompt/serialize-policy.ts` | prompt serialize warning policy (`canSerializePromptModel`) |
| `formats/prompt/prompt-rules.ts` | prompt type별 section rule |
| `formats/prompt/preview.ts` | prompt preview adapter |
| `formats/html/document-model.ts` | html identity parse/reassemble |
| `formats/html/types.ts` | html format state 타입 |
| `formats/html/schema.ts` | html section 이름 schema (`HTML_KNOWN_SECTIONS`) |
| `formats/html/preview.ts` | html sandboxed iframe preview adapter |
| `formats/html/preview-security.ts` | HTML preview CSP, sandbox mode, srcdoc 생성, attribute escape |
| `runtime-profile/` | Main Editor runtime simulation profile 타입, 기본값, validation, clone, variable merge |
| `index.ts` | public barrel — 외부 소비자가 import하는 유일한 진입점 |

## Target dependency direction

리팩토링 후에는 다음 방향을 유지합니다.

```txt
index.ts -> document-model
index.ts -> formats/*
index.ts -> runtime-profile
index.ts -> preview
index.ts -> shared (LineOffsetIndex, scanEditorDocumentSections)

formats/* -> document-model
formats/* -> shared
formats/* -> preview
formats/*/preview -> ../../../../simulator only when preview/runtime needs it
formats/lorebook/preview -> formats/lorebook/content-position-mapper (indirect via index.ts)
formats/html/preview -> formats/html/preview-security (CSP, sandbox, srcdoc)

preview -> ../../simulator (createPreviewDiagnostic)
document-model -> shared
document-model -> formats/*/document-model
runtime-profile -> ../../simulator
shared -> shared only
```

## Forbidden dependencies

- `shared/`에서 `formats/*`를 import하지 않습니다.
- `shared/`에서 `../../simulator`를 import하지 않습니다.
- format module끼리 직접 import하지 않습니다.
- 내부 구현 파일에서 public barrel인 `editor/index.ts`를 import하지 않습니다.
- Preview adapter는 parser를 직접 실행하지 않고 이미 만들어진 state를 입력으로 받습니다.

## Parser / serializer lifecycle

1. Caller가 `formatKind`와 source를 전달합니다.
2. `parseMainEditorDocumentModel`이 format parser를 선택합니다.
3. Format parser가 `scanEditorDocumentSections` 또는 identity parser를 사용해 model을 만듭니다.
4. UI는 model의 state만 편집합니다.
5. `reassemble*EditorDocument`는 warning policy를 확인합니다.
6. 안전하지 않으면 원문 `model.source`를 반환하고, 안전하면 state를 source로 직렬화합니다.

## Warning severity policy

각 format의 `canSerialize{Format}Model` 정책 함수가 reassemble 직렬화 허용 여부를 결정함.

| Warning code | Lorebook (`canSerializeLorebookModel`) | Regex (`canSerializeRegexModel`) | Prompt (`canSerializePromptModel`) |
|---|---|---|---|
| `missing-frontmatter` | 차단 | 차단 | 차단 |
| `malformed-frontmatter` | 차단 | 차단 | 차단 |
| `missing-section` | 차단 | 차단 | 차단 |
| `duplicate-section` | 차단 | 차단 | 차단 |
| `unsupported-section` | 차단 | 차단 | 차단 |
| `out-of-order-section` | 차단 | 차단 | 차단 |
| `unsupported-frontmatter-field` | **허용** | N/A | N/A |

- Lorebook: error severity가 없고 모든 warning이 `unsupported-frontmatter-field`인 경우에만 직렬화 허용.
- Regex/Prompt: warning이 하나라도 있으면 직렬화 차단.
- HTML: scanner warning이 없는 identity model. 별도 정책 함수 없이 `state.contentText` 반환.

## Preview lifecycle

1. UI가 format state와 preview input을 adapter에 전달합니다.
2. Adapter가 format-specific rule을 검증합니다.
3. 필요한 경우 simulator를 호출합니다.
4. Simulator result를 preview DTO로 변환합니다.
5. UI는 `status`, `output`, `diagnostics`, `trace`, `metadata`를 렌더링합니다.

## Adding a format

1. Format state type을 추가합니다.
2. Parser와 serializer를 추가합니다.
3. `parseMainEditorDocumentModel` dispatch에 등록합니다.
4. `index.ts`에서 public API를 재노출합니다.
5. Golden fixture, warning policy, preview smoke test를 추가합니다.

## Public API change procedure

- 기존 export는 바로 제거하지 않고 compatibility alias를 유지합니다.
- Public export snapshot test를 먼저 갱신해 의도한 변경인지 확인합니다.
- VS Code extension, webview, core tests의 import path를 함께 확인합니다.

## Public / internal API classification (Phase 6)

`index.ts`의 export는 세 그룹으로 분류됩니다. 이 분류는 주석과 JSDoc `@internal` 태그로 문서화되어 있으며, runtime 동작이나 가시성에는 영향을 주지 않습니다.

### Stable public API

VS Code extension, webview, core test에서 직접 소비하는 안정적인 진입점:

| Symbol | Category |
|---|---|
| `EditorDocumentModel`, state types, warning types | Document model types |
| `MAIN_EDITOR_FORMAT_KINDS` | Format kind constant |
| `parseMainEditorDocumentModel` | Parser dispatch |
| `EditorPreviewStatus`, `EditorPreviewDiagnostic`, `EditorPreviewMetadataBase` | Preview DTO types |
| `createPreviewDiagnostic` | Preview diagnostic mapper |
| `formatCoverageSummary` | Coverage summary helper |
| `HTML_PREVIEW_CSP`, `createSandboxedHtmlSrcdoc`, `escapeHtmlAttribute`, `resolveHtmlPreviewSandboxMode` | HTML preview security |
| `parseLorebookEditorDocument`, `reassembleLorebookEditorDocument` | Lorebook parse/reassemble |
| `canSerializeLorebookModel` | Lorebook serialize policy |
| `createLorebookContentPreview` | Lorebook quick preview |
| `createLorebookContentRuntimePreview` | Lorebook runtime preview |
| `parseRegexEditorDocument`, `reassembleRegexEditorDocument` | Regex parse/reassemble |
| `canSerializeRegexModel` | Regex serialize policy |
| `createRegexMainEditorPreview` | Regex preview |
| `parsePromptEditorDocument`, `reassemblePromptEditorDocument` | Prompt parse/reassemble |
| `canSerializePromptModel` | Prompt serialize policy |
| `PROMPT_SECTION_NAMES`, `PROMPT_TYPES`, `getPromptTypeRule`, `isPromptType` | Prompt rules |
| `createPromptMainEditorPreview` | Prompt preview |
| `parseHtmlEditorDocument`, `reassembleHtmlEditorDocument` | HTML parse/reassemble |
| `createHtmlMainEditorPreview` | HTML preview |
| Simulator profile types and functions | Runtime profile |

### Lorebook position mapping (compatibility surface)

VS Code `mainEditorLspBridge.ts`가 직접 소비하는 lorebook CONTENT 전용 좌표 변환. 범용 mapper가 아님:

| Symbol | Note |
|---|---|
| `ContentMonacoPosition`, `ContentMonacoRange` | Lorebook CONTENT 전용 position/range type |
| `mapContentMonacoPositionToSourcePosition` | Monaco → source position mapping |
| `mapSourceRangeToContentMonacoRange` | Source range → Monaco range mapping |

### Internal candidate / compatibility

Editor domain 내부 구현과 core test에서만 직접 사용. 외부 패키지 소비자 없음. Barrel 재노출은 import 호환성을 위해 유지:

| Symbol | `@internal` reason |
|---|---|
| `createLineOffsetIndex`, `LineOffsetIndex` | `content-position-mapper.ts`와 core test에서만 사용 |
| `scanEditorDocumentSections`, `ScanEditorDocumentSectionsOptions`, `ScannedEditorDocumentSections` | Format별 parser 내부와 core test에서만 사용 |
| `createEmptyEditorDocumentWarnings` | `document-model/types.ts` 내부 default helper |
