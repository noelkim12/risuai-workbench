# LLM Context: editor package

## Safe entry points

- `index.ts`: public compatibility barrel. 외부 소비자는 이 파일의 export를 기준으로 봅니다.
- `main-editor-document-model.ts`: `formatKind`별 parser dispatch입니다.
- `lorebook-document-model.ts`: `.risulorebook` parse/reassemble 구현입니다.
- `regex-document-model.ts`: `.risuregex` IN/OUT parse/reassemble 구현입니다.
- `prompt-document-model.ts`: `.risuprompt` type-aware section parse/reassemble 구현입니다.
- `html-document-model.ts`: `.risuhtml` identity model입니다.
- `section-scanner.ts`: frontmatter와 `@@@ SECTION` scanner입니다.
- `line-offsets.ts`: UTF-16 offset과 source position 변환입니다.
- `content-position-mapping.ts`: 현재 lorebook CONTENT 전용 Monaco/source mapping입니다.

## Do not edit first

- `section-scanner.ts`: parsing behavior, range, CRLF, final newline 회귀 위험이 큽니다. 먼저 characterization test를 보강하세요.
- `content-position-mapping.ts`: Monaco one-based 좌표와 source zero-based 좌표가 섞입니다. position test 없이 바꾸지 마세요.
- `simulator-profile.ts`: webview와 VS Code bridge가 profile shape에 의존합니다. public export를 먼저 확인하세요.
- `index.ts`: compatibility surface입니다. export 제거는 별도 public API 작업으로만 진행하세요.

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

1. 문서와 golden/current-behavior test를 먼저 추가합니다.
2. `line-offsets.ts`와 source position 타입처럼 format-independent primitive부터 이동합니다.
3. `section-scanner.ts`를 frontmatter, header collection, section building으로 분해합니다.
4. Format별 document model을 `formats/{format}/`로 모읍니다.
5. Serialize policy 함수를 format별로 명시합니다.
6. Preview DTO와 runtime profile을 별도 boundary로 분리합니다.

## Adding or changing tests

- 기존 editor test는 `packages/core/tests/editor/`에 둡니다.
- Inline fixture는 `['line', 'line'].join('\n')` 스타일을 따릅니다.
- 큰 fixture corpus는 별도 `*-fixtures.ts` 파일로 분리합니다.
- Ambiguous behavior는 테스트명에 `current behavior`를 넣어 정책 확정 전 동작 보존임을 드러냅니다.
