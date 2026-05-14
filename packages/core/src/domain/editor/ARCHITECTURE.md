# editor architecture

이 문서는 `packages/core/src/domain/editor` 리팩토링 중 유지해야 하는 책임 경계와 의존성 규칙을 고정합니다.

## Current folder map

현재 Phase 0 기준 구조는 아직 단일 디렉터리입니다.

| File | Responsibility |
|---|---|
| `document-model-types.ts` | 공통 문서 모델 타입과 format별 state 타입 |
| `section-scanner.ts` | frontmatter parsing, section header 수집, range 계산, scanner warning 생성 |
| `line-offsets.ts` | UTF-16 offset과 zero-based source position 변환 |
| `content-position-mapping.ts` | lorebook CONTENT 전용 Monaco/source coordinate mapping |
| `*-document-model.ts` | format별 parse/reassemble 구현 |
| `*-preview*.ts` | format별 preview adapter |
| `prompt-rules.ts` | prompt type별 section rule |
| `simulator-profile.ts` | Main Editor runtime simulation profile 타입, 기본값, validation, clone, variable merge |
| `index.ts` | public compatibility barrel |

## Target dependency direction

리팩토링 후에는 다음 방향을 유지합니다.

```txt
index.ts -> document-model
index.ts -> formats/*
index.ts -> preview
index.ts -> runtime-profile

formats/* -> document-model
formats/* -> shared
formats/* -> preview
formats/* -> ../../simulator only when preview/runtime needs it

document-model -> shared
runtime-profile -> ../../simulator
preview -> ../../simulator
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

| Warning code | Current serialize behavior |
|---|---|
| `missing-frontmatter` | 차단 |
| `malformed-frontmatter` | 차단 |
| `missing-section` | 차단 |
| `duplicate-section` | 차단 |
| `unsupported-section` | 차단 |
| `out-of-order-section` | 차단 |
| `unsupported-frontmatter-field` | lorebook만 허용, regex/prompt는 현재 별도 unknown field warning을 만들지 않음 |

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
