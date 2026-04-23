# preset target

`preset`은 regex / prompt-template / toggle을 소유하는 canonical target이다. 다만 실제 `pack --format preset` 입력 workspace는 이 세 artifact만 있는 최소 레이아웃이 아니라, preset template base 위에 여러 auxiliary preset 파일을 덧씌우는 구조를 쓴다.

## canonical layout

```text
<preset>/
├── metadata.json
├── prompts/                          # optional text overlays
│   ├── main.txt
│   ├── jailbreak.txt
│   └── global_note.txt
├── prompt_template/                  # canonical prompt artifact surface
│   ├── _order.json
│   └── *.risuprompt
├── regex/                            # canonical regex artifact surface
│   ├── _order.json
│   └── *.risuregex
├── toggle/                           # canonical toggle artifact surface
│   └── prompt_template.risutoggle
├── parameters.json                   # optional scalar parameter overlay
├── model.json                        # optional model/provider selection overlay
├── provider/                         # optional provider-specific JSON files
│   ├── ooba.json
│   ├── nai.json
│   ├── ain.json
│   └── reverse_proxy_ooba.json
├── formatting_order.json             # optional prompt ordering override
├── prompt_settings.json              # optional promptSettings object
├── instruct_settings.json            # optional instruct-related top-level fields
├── schema_settings.json              # optional schema-related top-level fields
└── advanced.json                     # optional advanced top-level fields
```

모든 항목이 항상 필요한 건 아니다. pack workflow는 preset template base를 먼저 clone한 뒤, workspace에 실제로 존재하는 파일만 순서대로 overlay한다.

pack merge 순서는 `metadata → prompts → prompt_template → parameters → model → provider → prompt settings → toggle → regex → advanced`다.

## artifact ownership

| surface | ownership | upstream field |
|---|---|---|
| `prompt_template/` | custom-extension artifact | `botPreset.promptTemplate` |
| `regex/` | custom-extension artifact | extract는 `presetRegex` bridge를 읽고, preset pack은 canonical regex 내용을 `regex` payload로 쓴다 |
| `toggle/` | custom-extension artifact | `customPromptTemplateToggle` |
| `prompts/main.txt` | auxiliary preset text overlay | `mainPrompt` |
| `prompts/jailbreak.txt` | auxiliary preset text overlay | `jailbreak` |
| `prompts/global_note.txt` | auxiliary preset text overlay | `globalNote` |
| `metadata.json` | auxiliary preset metadata | currently `name` |
| `parameters.json` | auxiliary preset settings | scalar top-level parameter fields |
| `model.json` | auxiliary preset settings | model and api selection fields |
| `provider/*.json` | auxiliary preset settings | provider-specific nested config |
| `formatting_order.json` | auxiliary preset settings | `formatingOrder` |
| `prompt_settings.json` | auxiliary preset settings | `promptSettings` |
| `instruct_settings.json` | auxiliary preset settings | instruct-related top-level fields |
| `schema_settings.json` | auxiliary preset settings | schema-related top-level fields |
| `advanced.json` | auxiliary preset settings | advanced top-level fields |

핵심은 ownership 경계를 섞지 않는 것이다. `prompt_template/`, `regex/`, `toggle/`만 custom-extension artifact-owned surface이고, 나머지는 preset pack이 소비하는 auxiliary workspace 파일이다.

## base-template-overlay mental model

- preset pack은 빈 객체를 직접 조립하지 않고, 내장 `presetTemplate` base를 먼저 복제한다.
- 그 base에는 기본 `mainPrompt`, `jailbreak`, `globalNote`, `formatingOrder`, provider defaults, instruct defaults 같은 shipped baseline이 들어 있다.
- workspace 파일이 없으면 base 값이 그대로 남는다.
- workspace 파일이 있으면 해당 값만 overlay 한다.

그래서 `prompts/`, `parameters.json`, `model.json`, `provider/*.json`, `prompt_settings.json`, `advanced.json` 같은 파일은 preset authoring workspace에서 자주 보일 수 있지만, canonical custom-extension artifact 목록이 늘어난 것은 아니다.

## prompts/ auxiliary surface

- `prompts/main.txt`, `prompts/jailbreak.txt`, `prompts/global_note.txt`는 `.risu*` artifact가 아니다.
- 이 파일들은 plain text overlay input이다.
- 세 파일 모두 optional이다. 디렉토리가 없거나 개별 파일이 없으면 base prompt text가 유지된다.
- docs에서 이 surface를 설명할 때 `prompt-template` artifact와 같은 ownership으로 섞어 쓰면 안 된다.

## regex bridge note

- preset extract 쪽 canonical bridge는 `presetRegex`를 읽는다.
- 하지만 preset pack output은 canonical `regex/*.risuregex` 내용을 adapter에 주입한 뒤, 최종 preset payload의 `regex` 필드로 기록한다.
- 즉 `presetRegex`는 extract bridge 설명에만 맞고, pack output ownership을 그대로 뜻하지는 않는다.

## root JSON 제거 메모

- 활성 authoring source는 `preset.json`이 아니다.
- 현재 truth는 preset template base + canonical workspace overlay 흐름이다.
- legacy / deferred note가 필요할 때만 `preset.json` fallback을 archive 맥락으로 언급한다.
