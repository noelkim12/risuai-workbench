# editor

`editor` 도메인은 VS Code Main Editor가 다루는 `.risulorebook`, `.risuregex`, `.risuprompt`, `.risuhtml` 문서를 구조화 편집 상태로 변환하고, preview adapter가 사용할 안정적인 DTO를 제공하는 패키지입니다.

## What this package does

- format별 문서 원문을 `EditorDocumentModel<TState>`로 파싱합니다.
- 안전한 경우 편집된 state를 원문 문서 형태로 다시 직렬화합니다.
- lorebook CONTENT, regex, prompt, html preview payload를 생성합니다.
- Main Editor runtime preview에 필요한 simulator profile을 정규화합니다.
- Monaco 좌표와 원문 UTF-16 offset 사이의 mapping helper를 제공합니다.

## Public entry points

| Function | Purpose |
|---|---|
| `parseMainEditorDocumentModel` | `formatKind`별 parser dispatch 진입점 |
| `parseLorebookEditorDocument` | `.risulorebook` parser |
| `reassembleLorebookEditorDocument` | `.risulorebook` serializer compatibility API |
| `parseRegexEditorDocument` / `reassembleRegexEditorDocument` | `.risuregex` IN/OUT skeleton parser와 serializer |
| `parsePromptEditorDocument` / `reassemblePromptEditorDocument` | `.risuprompt` type-aware section parser와 serializer |
| `parseHtmlEditorDocument` / `reassembleHtmlEditorDocument` | `.risuhtml` identity document model |
| `createLorebookContentPreview` | lorebook CONTENT quick preview 생성 |
| `createLorebookContentRuntimePreview` | simulator 기반 lorebook runtime preview 생성 |
| `createRegexMainEditorPreview` | regex preview 생성 |
| `createPromptMainEditorPreview` | prompt preview 생성 |
| `createHtmlMainEditorPreview` | sandboxed iframe srcdoc preview 생성 |
| `createDefaultMainEditorSimulatorProfile` | Main Editor용 기본 simulator profile 생성 |

## Invariants

- Source offset은 JavaScript string 기준 UTF-16 offset입니다.
- `SourcePosition`은 zero-based line/character를 사용합니다.
- Monaco position/range는 one-based line/column을 사용합니다.
- Parser는 CRLF와 final newline 여부를 model에 보존해야 합니다.
- Malformed document나 raw section 손실 가능성이 있는 document는 serializer가 원문을 반환해야 합니다.
- `scanEditorDocumentSections`는 현재 public barrel에서 재노출되지만, 구조 변경 시 compatibility를 유지해야 합니다.

## Current behavior to preserve before refactor

- Duplicate section은 scanner warning을 만들고, format별 state 선택은 현재 JavaScript `Map`/`Object.fromEntries` 동작에 따라 마지막 section 값이 반영됩니다. 이 동작은 Phase 0 characterization test로 고정되어 있으며, 정책 변경은 별도 작업으로 다룹니다.
- Lorebook serializer는 `unsupported-frontmatter-field` warning만 있는 경우 재조립을 허용합니다.
- Regex와 prompt serializer는 warning이 하나라도 있으면 원문을 반환합니다.
- HTML document model은 원문 전체를 `contentText`로 다루는 identity model입니다.
