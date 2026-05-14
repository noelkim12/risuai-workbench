# LLM Context: editor package

## Safe entry points

- `index.ts`: public barrel. 외부 소비자는 이 파일의 export를 기준으로 봅니다.
- `document-model/types.ts`: 공통 문서 모델 타입, format state 타입, `MAIN_EDITOR_FORMAT_KINDS`.
- `document-model/parse-main-editor-document-model.ts`: `formatKind`별 parser dispatch입니다.
- `preview/types.ts`: 공통 preview DTO 타입 (`EditorPreviewStatus`, `EditorPreviewDiagnostic`, `EditorPreviewMetadataBase`).
- `preview/create-preview-diagnostic.ts`: CBS simulator diagnostic → preview DTO 공통 변환기.
- `preview/coverage-summary.ts`: CBS simulation coverage 요약 포맷.
- `formats/{format}/types.ts`: format별 state 타입 (document-model/types.ts에서 재노출).
- `formats/{format}/schema.ts`: format별 section 이름과 frontmatter field schema.
- `formats/{format}/document-model.ts`: format별 parse/reassemble 실제 구현입니다.
- `formats/{format}/serialize-policy.ts`: format별 serialize warning 정책 함수입니다.
- `formats/lorebook/content-position-mapper.ts`: lorebook CONTENT 전용 Monaco/source mapping입니다.
- `formats/lorebook/preview/quick-preview.ts`: lorebook CONTENT CBS dry-run preview입니다.
- `formats/lorebook/preview/runtime-preview.ts`: lorebook CONTENT runtime preview with variable bindings입니다.
- `formats/regex/preview.ts`: regex preview adapter입니다.
- `formats/prompt/preview.ts`: prompt preview adapter입니다.
- `formats/prompt/prompt-rules.ts`: `.risuprompt` type/section 규칙입니다.
- `formats/html/preview.ts`: html sandboxed iframe preview adapter입니다.
- `formats/html/preview-security.ts`: HTML preview CSP, sandbox mode, srcdoc 생성, attribute escape.
- `formats/html/schema.ts`: html section 이름 schema (`HTML_KNOWN_SECTIONS`).
- `shared/sections/scan-editor-document.ts`: frontmatter와 `@@@ SECTION` scanner orchestration입니다.
- `shared/frontmatter/parse-frontmatter.ts`: YAML frontmatter parser입니다.
- `shared/source-position/line-offset-index.ts`: UTF-16 offset과 source position 변환입니다.
- `runtime-profile/index.ts`: simulator profile public module입니다.

## Do not edit first

- `shared/sections/scan-editor-document.ts`: parsing behavior, range, CRLF, final newline 회귀 위험이 큽니다. 먼저 characterization test를 보강하세요.
- `formats/lorebook/content-position-mapper.ts`: Monaco one-based 좌표와 source zero-based 좌표가 섞입니다. position test 없이 바꾸지 마세요.
- `runtime-profile/index.ts`: webview와 VS Code bridge가 profile shape에 의존합니다. public export를 먼저 확인하세요.
- `index.ts`: public API surface입니다. export 제거는 별도 public API 작업으로만 진행하세요.

## Core invariants

- Offset은 JavaScript UTF-16 string offset입니다.
- `SourcePosition`은 zero-based입니다.
- Monaco position/range는 one-based입니다.
- CRLF와 final newline 여부는 parse 후 serialize에서 보존해야 합니다.
- Malformed document는 파괴적으로 저장하지 말고 원문을 반환해야 합니다.
- Duplicate section은 현재 state에서 마지막 section 값이 선택됩니다. 이 동작은 current-behavior test로 고정되어 있습니다.
- Lorebook CONTENT mapping은 범용 mapper가 아니라 lorebook `CONTENT` section 전용입니다.

## Current warning policy

- Lorebook: `unsupported-frontmatter-field`만 있는 경우 serialize 허용.
- Lorebook: `missing-section`, `duplicate-section`, `unsupported-section`, malformed frontmatter는 serialize 차단.
- Regex/prompt: warning이 하나라도 있으면 serialize 차단.
- HTML: scanner warning이 없는 identity model.

## Refactor sequence

1. ~~문서와 golden/current-behavior test를 먼저 추가합니다.~~ (done)
2. ~~`line-offsets.ts`와 source position 타입처럼 format-independent primitive부터 이동합니다.~~ (done)
3. ~~`section-scanner.ts`를 frontmatter, header collection, section building으로 분해합니다.~~ (done)
4. ~~Format별 document model을 `formats/{format}/`로 모읍니다.~~ (done)
5. ~~Serialize policy 함수를 format별로 명시합니다.~~ (done)
6. ~~Public/internal API 분류를 문서화합니다.~~ (done)

## API classification (Phase 6)

`index.ts` export는 세 그룹으로 분류되어 있습니다:

- **Stable public** — parser, reassemble, serialize policy, preview, runtime profile. 외부 패키지가 직접 소비.
- **Lorebook position mapping** — `mapContentMonacoPositionToSourcePosition`, `mapSourceRangeToContentMonacoRange`. VS Code LSP bridge가 직접 소비하는 lorebook 전용 surface.
- **Internal candidate** — `createLineOffsetIndex`, `scanEditorDocumentSections`, `createEmptyEditorDocumentWarnings`. `@internal` 태그로 문서화. editor domain 내부와 core test에서만 사용. Barrel 재노출은 호환성 유지.

## Adding or changing tests

- 기존 editor test는 `packages/core/tests/editor/`에 둡니다.
- Inline fixture는 `['line', 'line'].join('\n')` 스타일을 따릅니다.
- 큰 fixture corpus는 별도 `*-fixtures.ts` 파일로 분리합니다.
- Ambiguous behavior는 테스트명에 `current behavior`를 넣어 정책 확정 전 동작 보존임을 드러냅니다.
