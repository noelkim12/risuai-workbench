# 커스텀 익스텐션(Custom Extension) 개발 문서

이 폴더는 [`custom-extension-design.md`](../custom-extension-design.md)에 담긴 설계 내용을 개별 파일 단위로 세분화하여 정의한 개발 명세입니다. 원본 디자인 문서는 현재의 신뢰 기준(Source of Truth)이 아닌 아카이브(Archive) 용도로 관리되며, 모든 신규 작업 및 명세 확인은 이 폴더 내의 표준 워크스페이스(Canonical Workspace) 문서를 참조하십시오.

## 이 문서는 왜 나뉘었나

- **컨텍스트 효율화**: 원본 `custom-extension-design.md`는 1,200줄 이상의 방대한 분량으로 단일 컨텍스트에 담기 어려웠으며, 특정 아티팩트 작업 시 불필요한 정보가 많았습니다.
- **대상별 최적화**: 각 익스텐션은 캐릭터 카드(charx), 모듈(module), 프리셋(preset) 중 특정 대상에 매핑되므로, "작업 대상 아티팩트 + 대상" 문서만으로 왕복 변환(Round-trip) 명세를 완결성 있게 파악할 수 있도록 분리했습니다.
- **공통 규칙 일원화**: 왕복 변환 원칙, CBS LSP 매핑, 루트 JSON 제거 방침 등 공통 규칙을 별도 파일로 분리하여, 각 익스텐션 문서가 표준 편집 인터페이스(Canonical Authoring Surface)를 일관되게 참조하도록 구성했습니다.

## 디렉토리 구조

```text
docs/custom-extension/
├── README.md                    ← 이 파일. 인덱스 및 탐색 가이드
├── common/
│   ├── principles.md            ← 왕복 변환 원칙, CBS LSP 매핑, 정렬(Ordering), 검증 워크플로우
│   └── root-json-removal.md     ← 루트 JSON 제거 방침 및 미편집 필드 보존 정책
├── extensions/                  ← 아티팩트별 상세 명세 및 왕복 변환 상세
│   ├── lorebook.md              ← .risulorebook
│   ├── regex.md                 ← .risuregex
│   ├── lua.md                   ← .risulua
│   ├── prompt-template.md       ← .risuprompt
│   ├── toggle.md                ← .risutoggle
│   ├── variable.md              ← .risuvar
│   ├── html.md                  ← .risuhtml
│   └── text.md                  ← .risutext
└── targets/                     ← 대상별 패키징(Pack) 흐름 및 적용 익스텐션 목록
    ├── charx.md
    ├── module.md
    └── preset.md
```

## 익스텐션(Extension) × 대상(Target) 매트릭스

각 익스텐션이 어떤 대상에 적용되는지를 정의하는 기준 매트릭스입니다. 작업 시작 시 어떤 문서를 참조해야 할지 결정하는 1차 필터 역할을 합니다.

| 익스텐션 | 캐릭터(charx) | 모듈(module) | 프리셋(preset) | 상위(Upstream) 필드 (charx / module / preset) |
|---|:---:|:---:|:---:|---|
| [`.risulorebook`](extensions/lorebook.md) | ✓ | ✓ |   | V3 `char_book` / `_moduleLorebook` (`loreBook[]`) / — |
| [`.risuregex`](extensions/regex.md) | ✓ | ✓ | ✓ | `customScripts` / `customscript[]` / `presetRegex` (저장 시 레거시 호환성을 위해 `regex` 필드까지 연동 가능) |
| [`.risulua`](extensions/lua.md) | ✓ | ✓ |   | `triggerscript` (단일 파일) |
| [`.risuprompt`](extensions/prompt-template.md) |   |   | ✓ | — / — / `botPreset.promptTemplate` |
| [`.risutoggle`](extensions/toggle.md) |   | ✓ | ✓ | — / `customModuleToggle` / `customPromptTemplateToggle` |
| [`.risuvar`](extensions/variable.md) | ✓ | ✓ |   | `defaultVariables` / 모듈 수준 변수 |
| [`.risuhtml`](extensions/html.md) | ✓ | ✓ |   | `backgroundHTML` / `backgroundEmbedding` |
| [`.risutext`](extensions/text.md) | ✓ |   |   | `description`, `first_mes`, `system_prompt`, `replace_global_note`, `creator_notes`, `additionalText`, `alternate_greetings` |

## 하위 에이전트(Subagent) 사용 가이드

작업을 시작할 때는 다음 순서에 따라 문서를 참조하십시오.

1. **[공통 원칙](common/principles.md)**: 모든 작업에 적용되는 왕복 변환 원칙, 정렬 규칙, CBS LSP 매핑 정보를 확인합니다.
2. **[작업 대상 파일](targets/)**: 캐릭터/모듈/프리셋 중 다루고자 하는 대상의 패키징 흐름과 적용 익스텐션 목록을 확인합니다.
3. **[관련 익스텐션 파일](extensions/)**: 매트릭스에서 선택된 익스텐션의 상세 명세, 예제, 왕복 변환 규칙을 확인합니다.
4. **(필요 시) [루트 JSON 제거 방침](common/root-json-removal.md)**: 루트 JSON 파일을 워크스페이스 소스가 아닌 레거시 또는 지연 인터페이스(Deferred Surface)로 구분해야 할 때 참조합니다.

## 문서 수정 및 관리 규칙

- **디자인 문서 보존**: 원본 `custom-extension-design.md`는 아카이브이므로 **수정하지 마십시오**. 모든 변경 사항은 이 폴더 내의 각 문서에 반영합니다.
- **명세의 단일화**: 특정 익스텐션의 명세가 여러 대상에 영향을 주는 경우 익스텐션 문서를 신뢰 기준으로 삼으며, 대상 문서는 매핑 필드 등 대상별 특이 사항만 간략히 기술합니다.
- **왕복 변환 체크리스트**: 데이터 손실 가능성 등에 대한 체크리스트는 각 익스텐션 문서에 자기 완결적으로 포함하며, 대상 문서에서 중복 기술하지 않습니다.
- **주요 용어 정의**:
  - **표준(Canonical)**: 워크벤치가 실제로 편집, 생성, 검증에 사용하는 `.risu*` 파일 및 마커/메타데이터 인터페이스를 의미합니다.
  - **레거시/지연 폴백(Legacy / Deferred Fallback)**: 분석, 경로 호환, 과거 문서 등에서만 허용되는 비주도 인터페이스입니다. 활성 워크스페이스 소스로 취급하지 않습니다.
  - **바이너리/내부 호환성(Binary / Internal Compatibility)**: `.charx`, `.risum` 등 최종 산출물이나 내부 직렬화 과정에서만 유효한 비워크스페이스 동작입니다.
  - **상위(Upstream)**: `risuai-pork`에서 정의하는 타입 및 실제 물리 저장 포맷을 의미합니다.
  - **왕복 변환(Round-trip)**: 상위 포맷 ↔ 표준 워크스페이스 포맷 간의 상호 변환 과정을 의미합니다.
  - **편집 범위(Authoring Scope)**: 워크벤치가 실제로 편집을 지원하는 필드 집합입니다. 범위 밖 필드는 패키징 시 상위 기본값이나 메타데이터를 통해 복원됩니다.
