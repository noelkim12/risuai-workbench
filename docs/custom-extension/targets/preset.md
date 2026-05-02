# 프리셋 대상 (Preset Target)

`preset`은 정규식, 프롬프트 템플릿, 토글 아티팩트를 포함하는 표준 프리셋 대상 명세입니다. 실제 패키징 과정에서의 워크스페이스는 단순히 아티팩트만 모아둔 형태가 아니라, 프리셋 템플릿 베이스(Base) 위에 여러 보조 설정 파일들을 덧씌우는 **오버레이(Overlay)** 구조를 사용합니다.

## 표준 워크스페이스 구조 (Canonical Layout)

```text
<프리셋_루트>/
├── metadata.json (프리셋 이름 등)
├── prompts/                          # 주요 프롬프트 텍스트 오버레이
│   ├── main.txt
│   ├── jailbreak.txt
│   └── global_note.txt
├── prompt_template/                  # 표준 프롬프트 아티팩트 (LSP 대상)
│   ├── _order.json
│   └── *.risuprompt
├── regex/                            # 표준 정규식 아티팩트 (LSP 대상)
│   ├── _order.json
│   └── *.risuregex
├── toggle/                           # 표준 토글 아티팩트
│   └── prompt_template.risutoggle
├── parameters.json                   # 수치 매개변수 오버레이 (선택)
├── model.json                        # 모델 및 API 선택 오버레이 (선택)
├── provider/                         # 모델 프로바이더별 상세 설정 (선택)
│   ├── ooba.json
│   ├── nai.json
│   ├── ain.json
│   └── reverse_proxy_ooba.json
├── formatting_order.json             # 프롬프트 정렬 순서 오버레이 (선택)
├── prompt_settings.json              # 프롬프트 세부 설정 오버레이 (선택)
├── instruct_settings.json            # 지시문(Instruct) 관련 설정 오버레이 (선택)
├── schema_settings.json              # 스키마 관련 설정 오버레이 (선택)
└── advanced.json                     # 기타 고급 설정 오버레이 (선택)
```

모든 항목이 필수 사항은 아닙니다. 패키징 워크플로우는 기본 프리셋 템플릿을 먼저 복제한 후, 워크스페이스에 실제로 존재하는 파일들만을 순서대로 병합합니다.

병합 우선순위: `메타데이터 → 프롬프트 텍스트 → 프롬프트 템플릿 → 매개변수 → 모델 설정 → 프로바이더 설정 → 프롬프트 세부 설정 → 토글 → 정규식 → 고급 설정`

## 아티팩트 및 설정 소유권 명세

| 편집 인터페이스 | 소유권 분류 | 매핑되는 상위(Upstream) 필드 |
|---|---|---|
| `prompt_template/` | 표준 아티팩트 | `botPreset.promptTemplate` 필드 |
| `regex/` | 표준 아티팩트 | 추출 시 `presetRegex`를 읽고, 패키징 시 `regex` 페이로드에 내용을 기록합니다. |
| `toggle/` | 표준 아티팩트 | `customPromptTemplateToggle` 필드 |
| `prompts/main.txt` | 보조 텍스트 오버레이 | `mainPrompt` 필드 |
| `prompts/jailbreak.txt` | 보조 텍스트 오버레이 | `jailbreak` 필드 |
| `prompts/global_note.txt` | 보조 텍스트 오버레이 | `globalNote` 필드 |
| `metadata.json` | 보조 메타데이터 | 현재의 `name` 필드 등 |
| `parameters.json` | 보조 설정 | 최상위 수치 매개변수 필드군 |
| `model.json` | 보조 설정 | 모델 및 API 선택 관련 필드군 |
| `provider/*.json` | 보조 설정 | 프로바이더별 중첩 설정 객체 |
| `formatting_order.json` | 보조 설정 | `formatingOrder` 필드 |
| `prompt_settings.json` | 보조 설정 | `promptSettings` 객체 필드 |
| `instruct_settings.json` | 보조 설정 | 지시문 관련 최상위 필드군 |
| `schema_settings.json` | 보조 설정 | 스키마 관련 최상위 필드군 |
| `advanced.json` | 보조 설정 | 기타 고급 설정 최상위 필드군 |

핵심 원칙은 **소유권 경계를 명확히 분리**하는 것입니다. `prompt_template/`, `regex/`, `toggle/`만이 표준 아티팩트 계층이며, 나머지는 프리셋 패키징 엔진이 소비하는 보조(Auxiliary) 설정 파일입니다.

## 템플릿 베이스 오버레이 모델

- **복제 기반 조립**: 프리셋 패키징은 빈 객체에서 시작하지 않고, 내장된 `presetTemplate` 베이스를 먼저 복제합니다.
- **기본값 보존**: 베이스에는 기본 프롬프트 텍스트, 정렬 순서, 프로바이더 및 지시문 기본값 등 표준화된 값이 포함되어 있습니다.
- **오버레이 동작**: 워크스페이스 내에 해당 설정 파일이 없을 경우 베이스의 값이 유지되며, 파일이 존재할 경우에만 해당 파일의 내용으로 베이스 값을 덮어씁니다(Overlay).
- **아티팩트 범위**: 따라서 `prompts/`나 `parameters.json` 등의 파일은 편집 시 자주 사용되지만, 이들이 추가된다고 해서 표준 커스텀 익스텐션 아티팩트 목록이 늘어나는 것은 아닙니다.

## `prompts/` 보조 인터페이스 상세

- **비아티팩트**: `prompts/` 하위 파일들은 `.risu*` 아티팩트 형식이 아닙니다.
- **순수 텍스트**: 이 파일들은 단순한 평문(Plain text) 오버레이 입력을 위한 용도입니다.
- **선택적 사용**: 디렉토리나 파일이 존재하지 않을 경우 베이스 프롬프트의 기본 텍스트가 그대로 사용됩니다.

## 정규식 브리지(Regex Bridge) 주의 사항

- **비대칭 명칭**: 프리셋 추출 시에는 `presetRegex` 브리지를 통해 데이터를 읽어오지만, 패키징 시에는 아티팩트 내용을 최종 페이로드의 `regex` 필드에 기록합니다.
- **소유권 식별**: 따라서 `presetRegex`는 추출 시의 통로 이름일 뿐이며, 최종 패키징 산출물의 필드 소유권을 직접적으로 의미하지는 않습니다.

## 루트 JSON 제거 방침

- **활성 소스**: 현재 유효한 편집 소스는 `preset.json`이 아닙니다.
- **현행 명세**: 프리셋 템플릿 베이스에 표준 워크스페이스 아티팩트를 오버레이하는 흐름이 현재의 신뢰 기준입니다.
- **호환성**: 분석 또는 레거시 설명이 필요한 경우에만 `preset.json` 폴백을 아카이브 맥락으로 언급합니다.

