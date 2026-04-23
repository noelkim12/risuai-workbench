# charx target

`charx`는 lorebook / regex / lua / variable / html를 소유하는 canonical target이다.

## canonical layout

```text
<charx>/
├── character/
│   ├── description.txt
│   ├── first_mes.txt
│   ├── system_prompt.txt
│   ├── post_history_instructions.txt
│   ├── creator_notes.txt
│   ├── additional_text.txt
│   ├── alternate_greetings.json
│   └── metadata.json
├── lorebooks/
│   ├── _order.json
│   └── <folder...>/<entry>.risulorebook
├── regex/
│   ├── _order.json
│   └── *.risuregex
├── lua/
│   └── <target-name>.risulua
├── variables/
│   └── <target-name>.risuvar
└── html/
    └── background.risuhtml
```

- `character/`는 charx pack이 직접 읽는 실제 payload subtree다.
- `lua/`와 `variables/` 파일명은 임의 placeholder가 아니라 character metadata의 `name`을 sanitize한 target-name 기반 규칙을 따른다.
- `html/background.risuhtml`만 fixed filename이다.

## artifact ownership

| artifact | upstream field |
|---|---|
| character payload files | `data.description`, `data.first_mes`, `data.system_prompt`, `data.post_history_instructions`, `data.creator_notes`, `data.extensions.risuai.additionalText`, `data.alternate_greetings` |
| character metadata | `data.name`, `data.creator`, `data.character_version`, `data.creation_date`, `data.modification_date`, `data.extensions.risuai.utilityBot`, `data.extensions.risuai.lowLevelAccess` |
| lorebook | `char_book` + lorebook 관련 extension field |
| regex | `extensions.risuai.customScripts` |
| lua | `triggerscript` |
| variable | `extensions.risuai.defaultVariables` |
| html | `extensions.risuai.backgroundHTML` |

`character/metadata.json`은 구조화 메타데이터 surface이고, `character/*.txt` 및 `character/alternate_greetings.json`은 payload artifact surface다. 둘을 같은 계층에 두더라도 pack에서 맡는 역할은 다르다.

## metadata 메모

payload가 아닌 구조화 메타데이터는 `character/metadata.json`이나 별도 structured surface가 소유한다. charx pack이 현재 읽는 메타데이터 필드는 아래와 같다.

### string fields

- `name`
- `creator`
- `character_version`
- `creation_date`
- `modification_date`

### boolean fields

- `utilityBot`
- `lowLevelAccess`

이 항목들은 lorebook/regex/lua 같은 payload surface가 아니라 구조화 메타데이터 쪽에서 설명해야 한다. charx는 `.risutoggle`을 읽지 않으므로 toggle ownership을 여기로 확장하면 안 된다.

## root JSON 제거 메모

- 활성 authoring source는 `charx.json`이 아니다.
- 다만 T16 defer 범위 때문에 analyze/legacy 설명 문맥에서는 `charx.json` fallback을 archive / deferred note로만 언급할 수 있다.
- pack은 canonical artifacts와 defaults overlay를 기준으로 재조립한다.
