# risuai workbench custom extension 개발 문서

이 폴더는 [`custom-extension-design.md`](../custom-extension-design.md)를 subagent가 개별 파일만 참조해도 작업 가능하도록 세분화한 개발 명세다. 원본 문서는 source of truth가 아니라 archive이며, 신규 작업은 이 폴더 안의 canonical workspace 문서를 참조한다.

## 이 문서는 왜 나눠졌나

- 원본 `custom-extension-design.md`는 1,200줄 이상으로 LLM 단일 컨텍스트에 담기 어렵고, subagent가 특정 아티팩트만 작업할 때 불필요한 정보가 많았다.
- 각 extension은 charx/module/preset 중 특정 대상에만 매핑되므로, "작업 중인 아티팩트 + 대상"만 보면 round-trip까지 커버할 수 있도록 파일을 쪼갰다.
- 공통 규칙(round-trip 원칙, CBS LSP, 루트 JSON 제거 방침)은 별도 파일로 빼서 각 extension 문서가 canonical authoring surface를 먼저 참조하도록 했다.

## 디렉토리 구조

```text
docs/custom-extension/
├── README.md                    ← 이 파일. 인덱스 + 탐색 가이드
├── common/
│   ├── principles.md            ← round-trip 원칙, CBS LSP 매핑, ordering, 검증 워크플로우
│   └── root-json-removal.md     ← charx.json/module.json/preset.json 제거 방침과 미편집 필드 정책
├── extensions/                  ← 아티팩트별 spec + round-trip 상세
│   ├── lorebook.md              ← .risulorebook
│   ├── regex.md                 ← .risuregex
│   ├── lua.md                   ← .risulua
│   ├── prompt-template.md       ← .risuprompt
│   ├── toggle.md                ← .risutoggle
│   ├── variable.md              ← .risuvar
│   └── html.md                  ← .risuhtml
└── targets/                     ← 대상별 pack 흐름 + 적용 extension 목록
    ├── charx.md
    ├── module.md
    └── preset.md
```

## Extension × Target 매트릭스

각 extension이 어느 대상에 적용되는지의 기준 매트릭스. 이 매트릭스가 "작업 시작 시 어느 파일을 읽어야 하는가"의 1차 필터다.

| extension | charx | module | preset | upstream 필드 (charx / module / preset) |
|---|:---:|:---:|:---:|---|
| [`.risulorebook`](extensions/lorebook.md) | ✓ | ✓ |   | V3 `char_book` / `_moduleLorebook` (`loreBook[]`) / — |
| [`.risuregex`](extensions/regex.md) | ✓ | ✓ | ✓ | `extensions.risuai.customScripts` / `customscript[]` / `presetRegex`를 canonical bridge로 읽고 저장 시 legacy compatibility로 `regex`까지 이어질 수 있음 |
| [`.risulua`](extensions/lua.md) | ✓ | ✓ |   | `triggerscript` (단일 파일) |
| [`.risuprompt`](extensions/prompt-template.md) |   |   | ✓ | — / — / `botPreset.promptTemplate` |
| [`.risutoggle`](extensions/toggle.md) |   | ✓ | ✓ | — / `customModuleToggle` / `customPromptTemplateToggle` |
| [`.risuvar`](extensions/variable.md) | ✓ | ✓ |   | `extensions.risuai.defaultVariables` / module-level vars |
| [`.risuhtml`](extensions/html.md) | ✓ | ✓ |   | `extensions.risuai.backgroundHTML` / `backgroundEmbedding` |

## Subagent 사용 가이드

subagent가 작업을 시작할 때는 다음 순서로 파일을 로드한다.

1. **[공통 원칙](common/principles.md)** — 모든 작업에 적용되는 round-trip 원칙, ordering, CBS LSP 매핑. 거의 모든 subagent가 읽어야 한다.
2. **[작업 대상 파일](targets/)** — charx/module/preset 중 어느 것을 다루는지에 따라 해당 파일을 로드. pack 흐름과 적용 extension 목록이 있다.
3. **[관련 extension 파일](extensions/)** — 매트릭스에서 ✓로 표시된 extension 파일을 로드. 각 파일은 spec + 예제 + round-trip까지 self-contained.
4. **(필요 시) [루트 JSON 제거 방침](common/root-json-removal.md)** — `charx.json`/`module.json`/`preset.json`를 active workspace source가 아닌 legacy or deferred surface로 구분해야 할 때.

### 작업 유형별 권장 로드 조합

| 작업 유형 | 권장 로드 파일 |
|---|---|
| 특정 아티팩트의 import/export 파서 구현 | `common/principles.md` + `extensions/<artifact>.md` |
| charx pack 로직 작성 | `common/principles.md` + `common/root-json-removal.md` + `targets/charx.md` + 적용 extensions |
| module pack 로직 작성 | `common/principles.md` + `common/root-json-removal.md` + `targets/module.md` + 적용 extensions |
| preset pack 로직 작성 | `common/principles.md` + `common/root-json-removal.md` + `targets/preset.md` + 적용 extensions |
| CBS LSP document selector 구현 | `common/principles.md` + 모든 `extensions/*.md` (CBS 영역 확인) |
| round-trip 테스트 harness 구현 | `common/principles.md` + 모든 `extensions/*.md` + 모든 `targets/*.md` |

## 파일 수정 규칙

- 원본 `custom-extension-design.md`는 archive이므로 **수정하지 않는다**. 변경은 이 폴더 안의 파일들에 반영한다.
- 한 extension의 spec이 여러 target에 영향을 주는 경우, extension 파일이 source of truth이고 target 파일은 "이 target에서 어떤 필드로 매핑되는가"만 간략히 기술한다.
- round-trip 손실 체크리스트는 각 extension 파일 안에 자기 완결적으로 포함한다. target 파일에서 중복하지 않는다.
- 용어:
  - **canonical** = workbench가 실제로 authoring, emitted workspace, 검증에 사용하는 `.risu*` 파일 + 필요한 marker and metadata surface
  - **legacy / deferred fallback** = analyze, archive, 경로 호환, 과거 문서에서만 허용되는 비주도 surface. active workspace source로 취급하지 않는다.
  - **binary / internal compatibility** = `.charx`, `.risum` 같은 최종 산출물이나 내부 직렬화가 유지하는 비-workspace 동작
  - **upstream** = `risuai-pork` 타입과 실제 저장 포맷
  - **round-trip** = upstream → canonical → upstream 왕복
  - **authoring scope** = workbench가 실제로 편집하는 필드의 집합 (미편집 필드는 pack 시 upstream default로 복원)
