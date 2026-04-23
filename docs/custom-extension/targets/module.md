# module target

`module`은 lorebook / regex / lua / toggle / variable / html를 소유하는 canonical target이다.

## canonical layout

```text
<module>/
├── metadata.json
├── lorebooks/
│   ├── _order.json
│   └── <folder...>/<entry>.risulorebook
├── regex/
│   ├── _order.json
│   └── *.risuregex
├── lua/
│   └── <moduleName>.risulua
├── toggle/
│   └── <moduleName>.risutoggle
├── variables/
│   └── <moduleName>.risuvar
├── html/
│   └── background.risuhtml
└── assets/                  # optional, only when assets/manifest.json exists
    ├── manifest.json
    └── <extracted asset files...>
```

pack merge 순서는 `metadata → lorebooks → regex → lua → variables → html → toggle → assets`다.

## artifact ownership

| artifact | upstream field |
|---|---|
| lorebook | `_moduleLorebook` |
| regex | `customscript[]` |
| lua | module trigger/lua payload |
| toggle | `customModuleToggle` |
| variable | module-level variables |
| html | `backgroundEmbedding` |
| assets | `assets` tuple payload + extracted buffers |

## metadata ownership

`applyMetadata`가 현재 읽는 metadata-owned field는 아래로 제한된다.

- string: `name`, `description`, `id`, `namespace`, `cjs`
- boolean: `lowLevelAccess`, `hideIcon`
- object: `mcp`

이 값들은 payload artifact가 아니라 `metadata.json` surface의 책임이다.

## toggle ownership constraint

- module toggle의 canonical owner는 `toggle/*.risutoggle`이다.
- `metadata.json`은 `customModuleToggle`를 canonical owner로 가질 수 없다.
- pack workflow는 metadata fallback 문자열을 읽더라도, `metadata.json cannot own customModuleToggle. Use toggle/*.risutoggle instead.` 오류를 내서 metadata-only ownership을 거부한다.

## assets surface

- `assets/`는 optional layout이다. 모든 module workspace에 필요하지 않다.
- `assets/manifest.json`이 있을 때만 asset surface가 materialize된다.
- manifest의 `assets[]` entry는 정렬된 tuple payload를 만들고, 각 entry의 `extracted_path`가 가리키는 extracted asset file을 함께 읽어 binary payload surface로 싣는다.
- manifest가 없으면 `assets` payload도 생성하지 않는다.

## root JSON 제거 메모

- 활성 authoring source는 `module.json`이 아니다.
- canonical adapters를 직접 workspace 파일에 적용해 module envelope를 재구성하는 흐름이 현재 truth다.
- legacy / deferred note가 필요한 경우에도 `module.json`을 현재 표준처럼 설명하지 않는다.
