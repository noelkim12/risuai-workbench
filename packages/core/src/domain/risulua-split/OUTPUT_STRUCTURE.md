# RisuLua split output structure

이 문서는 거대한 단일 Lua 소스나 모든 책임이 한 파일에 모인 모놀리식 Lua를 `risulua-split`으로 나눴을 때 예상할 수 있는 출력 폴더 구조를 tree 형태로 보여줍니다.

`?`가 붙은 파일/디렉토리는 split plan과 dist graph 기준으로는 해당 심볼, source profile, 또는 fallback 경로가 있을 때만 의미 있는 산출물로 포함됩니다.

실제 extract workspace는 후속 LLM/사용자 개발을 돕기 위해, 감지되지 않은 표준 module 위치도 비어 있는 starter 파일/디렉토리로 보강할 수 있습니다. 이 starter surface는 `docs/risulua-split-plan.json`의 감지 결과나 dist require graph에 자동으로 포함되는 것이 아니라, 편집 표면을 미리 열어 두는 용도입니다.

## Full expected tree

```text
<outputRoot>/
├── lua/
│   ├── main.risulua
│   │   # RisuAI host ABI shell.
│   │   # require binding, bridge assignment, 보존해야 하는 top-level side effect가 남음.
│   │
│   ├── common/
│   │   ├── local_helpers.risulua
│   │   │   # module-table 순수 local helper.
│   │   └── helpers.risulua ?
│   │       # coarse plain-single fallback의 pure helper target.
│   │
│   ├── host_globals/
│   │   ├── global_functions.risulua
│   │   │   # 안전하게 bridge 가능한 public/global 함수 구현.
│   │   ├── duplicate_globals.risulua
│   │   │   # source order를 보존해야 하는 중복 global 구현.
│   │   └── async_actions.risulua
│   │       # async/model/network 효과가 있는 host global action.
│   │
│   ├── button_actions/
│   │   ├── actions.risulua
│   │   │   # 기본 button action 집합.
│   │   └── <action_name>.risulua ?
│   │       # action별 추가 분리 후보.
│   │
│   ├── runtime/
│   │   ├── start.risulua
│   │   │   # onStart runtime boundary.
│   │   ├── input.risulua
│   │   │   # onInput runtime boundary.
│   │   ├── output.risulua
│   │   │   # onOutput runtime boundary.
│   │   ├── button_click.risulua
│   │   │   # onButtonClick runtime boundary.
│   │   ├── listen_edit.risulua
│   │   │   # module-table listenEdit callback body.
│   │   └── listeners.risulua ?
│   │       # coarse fallback listener-call target.
│   │
│   ├── handler_helpers/
│   │   ├── output_helpers.risulua ?
│   │   ├── input_helpers.risulua ?
│   │   ├── start_helpers.risulua ?
│   │   ├── button_click_helpers.risulua ?
│   │   └── listen_edit_helpers.risulua ?
│   │       # handler 내부 nested helper를 parameter injection 후 분리한 파일.
│   │
│   ├── state/
│   │   └── variable_store.risulua ?
│   │       # top-level variable table/store 추출 결과.
│   │
│   ├── prompts/
│   │   └── instruction_store.risulua ?
│   │       # *_PROMPT, *_INSTRUCTION 같은 prompt 상수 추출 결과.
│   │
│   ├── domain/
│   │   ├── <topic>.risulua ?
│   │   └── <single_function>.risulua ?
│   │       # validated module-table domain generation의 실제 canonical 개발 표면.
│   │       # 반복되는 함수명 명사 token이 있으면 topic 단위로 묶고,
│   │       # 안정적인 topic을 만들 수 없는 singleton은 기존 function path를 유지한다.
│   │
│   ├── schema/
│   │   └── constants.risulua ?
│   │       # coarse fallback constants table target.
│   │
│   ├── features/
│   │   └── core.risulua ?
│   │       # coarse fallback uncertain domain/dynamic state-key target.
│   │
│   ├── sections/ ?
│   │   ├── 000_prelude.risulua ?
│   │   ├── 00_<label>.risulua ?
│   │   ├── 10_<label>.risulua ?
│   │   └── 90_<label>.risulua ?
│   │       # [BUNDLE] marker recovery 전용. 독립 require module이 아니라 ordered chunk fragment.
│   │
│   └── preload/ ?
│       ├── <preload_id>.risulua ?
│       └── <preload_id>_2.risulua ?
│           # package.preload recovery 전용. preload wrapper body를 파일로 복구.
│
├── legacy/
│   └── original.risulua
│       # 원본 source를 byte-for-byte로 보존하는 감사/복구 파일.
│
├── docs/
│   ├── risulua-split-plan.json
│   │   # 전체 split plan, source profile, file list, build strategy.
│   ├── risulua-split-report.md
│   │   # 사람이 읽는 split report.
│   ├── refactor-map.json ?
│   │   # module-table 심볼 이동/보존 dry-run map.
│   ├── domain-candidates.json ?
│   │   # domain 후보와 생성/차단 이유.
│   ├── risulua-export-manifest.json ?
│   │   # host-visible globals, duplicate groups, preserved reasons.
│   └── risulua-button-action-index.json ?
│       # button action name과 사용처 sidecar.
│
└── dist/ ?
    └── <targetName>.risulua
        # packable한 plan에서만 생성되는 RisuAI 투입용 단일 Lua bundle.
```

## Compact view

```text
lua/main.risulua          # host ABI shell / composition root
lua/runtime/              # RisuAI lifecycle hook
lua/handler_helpers/      # hook 내부 helper
lua/common/               # 순수 helper
lua/host_globals/         # public/global bridge 구현
lua/button_actions/       # 버튼 trigger action
lua/state/                # variable store
lua/prompts/              # prompt/instruction constants
lua/domain/               # 의미 단위 후보
lua/schema/, features/    # coarse fallback 전용
lua/sections/, preload/   # recovery fallback 전용
```

## Important boundary

현재 구현은 모놀리식 Lua를 자동으로 `services/`, `models/`, `repositories/`, `ui/`, `commands/` 같은 일반 애플리케이션식 계층으로 펼치지 않습니다. 자동 분류의 목표는 안전한 host ABI shell, runtime hook, helper, state/prompt store, action, domain candidate 정도까지입니다.

`module-table`의 `validated` domain generation은 splitter 단계에서 canonical `lua/domain/<topic>.risulua` 파일을 실제로 생성합니다. `docs/refactor-map.json`과 `docs/domain-candidates.json`은 이 결과를 설명하고 검증하는 sidecar이며, report/analyze 단계가 split 순서를 역전해 파일을 생성하지 않습니다.

## Validated domain grouping contract

`module-table`의 `validated` domain generation은 결정적인 규칙으로만 `lua/domain/<topic>.risulua` 경로를 선택합니다. 같은 입력과 같은 함수 집합은 source order나 임의 graph traversal에 의존하지 않고 같은 domain 파일을 생성해야 합니다.

- 반복되는 strong noun token은 topic 파일로 묶습니다. 예를 들어 `normalizeDeck`과 `scoreDeck`은 `deck` token을 공유하므로 `lua/domain/deck.risulua`로 갑니다.
- singular/plural churn은 정규화된 phrase로 묶습니다. 예를 들어 `parseStoryChoiceBlock`과 `parseStoryChoiceBlocks`는 `lua/domain/story_choice_block.risulua`를 공유합니다.
- tiny singleton 후보는 엄격한 utility family token에만 묶습니다. 현재 허용된 stable family는 `array`, `text`, `number`입니다.
- sibling action family는 명시적으로 허용된 경우에만 묶습니다. 현재 허용된 action family는 `render`입니다.
- 생성된 require cycle은 build 가능한 require graph를 유지하기 위해 같은 domain 파일로 coalesce될 수 있습니다.
- cycle coalescing 이후에는 기존 semantic cluster를 통째로 되돌려도 require cycle이 재발하지 않는 경우에만 복구합니다. 이 복구는 singleton 과분할을 막기 위해 multi-member cluster를 우선합니다.
- 위 규칙으로 안정적인 topic을 만들 수 없는 singleton은 `lua/domain/<function_name>.risulua` fallback을 유지합니다.
- 함수가 작거나, 서로 인접하거나, 한쪽이 다른 쪽을 호출한다는 이유만으로는 grouping하지 않습니다.
- LLM, API embedding, local ONNX embedding은 기본 grouping 결정에 사용하지 않습니다. 의미 유사도 실험은 생성 경로가 아니라 opt-in diagnostics/advisory layer로만 추가해야 합니다.

`docs/domain-candidates.json`은 선택된 경로를 설명하기 위해 선택적으로 `grouping` metadata를 기록할 수 있습니다. 이 metadata에는 `reason`, `path`, `peers`가 포함되며, grouping 종류에 따라 `token` 또는 `family`가 함께 들어갑니다.

## Related files

- `WORKFLOW.md`: risulua-split 전체 workflow와 모드별 출력 구조 요약.
- `CUSTOMIZING.md`: 출력 경로와 분류 규칙을 커스터마이징하는 위치.
- `module-table/module-table-contracts.ts`: module-table 고정 경로 상수.
- `module-table/module-table-classifier.ts`: domain/handler helper 동적 파일명 규칙.
- `inventory/confidence.ts`: coarse fallback target path 규칙.
