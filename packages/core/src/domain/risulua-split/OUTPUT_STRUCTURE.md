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
│   │   ├── <domain_function>.risulua ?
│   │   └── <another_domain_function>.risulua ?
│   │       # 의미 단위 domain function 후보.
│   │       # 현재는 자동 앱 계층화가 아니라 candidate 중심 분리.
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

더 세밀한 domain layer는 `docs/refactor-map.json`과 `docs/domain-candidates.json`을 보고 후속 설계하는 흐름입니다.

## Related files

- `WORKFLOW.md`: risulua-split 전체 workflow와 모드별 출력 구조 요약.
- `CUSTOMIZING.md`: 출력 경로와 분류 규칙을 커스터마이징하는 위치.
- `module-table/module-table-contracts.ts`: module-table 고정 경로 상수.
- `module-table/module-table-classifier.ts`: domain/handler helper 동적 파일명 규칙.
- `inventory/confidence.ts`: coarse fallback target path 규칙.
