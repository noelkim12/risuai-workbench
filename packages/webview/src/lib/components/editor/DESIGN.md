# Risuai Workbench Main editor

이 문서는 RisuAI custom extension 파일을 VS Code 기본 텍스트 에디터 대신 여는 전용 Webview Editor 설계다. 기본 목표는 `.risulorebook`, `.risuregex`, `.risuprompt`, `.risuhtml` 4종을 같은 editor shell에서 열 수 있게 하되, MVP 완성 기준은 `.risulorebook` 실사용 가능 수준으로 둔다.

## Confirmed direction

- 기본 open 방식은 전용 Webview Editor다.
- raw 편집과 디버깅을 위해 VS Code의 "Reopen With Text Editor" 또는 별도 command fallback을 제공한다.
- editor 본문은 블록 에디터가 아니라 코드 에디터다.
- 코드 에디터는 Monaco 기반으로 구현한다.
- VS Code `TextDocument`를 source of truth로 유지하고, webview 입력은 debounce된 `WorkspaceEdit`으로 문서에 반영한다.
- 기존 CBS LSP 기능은 webview에서 직접 재사용되지 않으므로 extension-host proxy를 둔다.
  - MVP 필수: diagnostics, completion, hover, go to definition
  - 후속: references, rename, CodeLens
- 입력 변경은 UI/preview에 즉시 반영하고, 실제 VS Code 문서 반영은 300~500ms debounce를 기본값으로 둔다.

## Confirmed layout model

- 좌측은 작성(authoring) 영역, 우측은 결과(result surface) 영역이다.
- 오른쪽 탭 이름은 `Preview | Simulator`다. 아래 초기 스케치의 `editor | simulator`는 의도상 `preview | simulator`로 정정한다.
- `Preview | Simulator` 탭은 전체 작업공간을 전환하지 않고 오른쪽 result surface만 전환한다.
- editor/result surface 사이 split pane은 사용자가 드래그로 조절할 수 있어야 한다.
- split 비율, frontmatter 접힘 상태, variable drawer 열림 상태는 포맷별로 기억한다.
- 좁은 화면에서는 preview/drawer를 접거나 아래로 내리는 최소 responsive fallback을 둔다.

## 1. Side toolbar

Side toolbar는 코드 삽입 도구다. preview 변수 override나 workspace variable 탐색은 오른쪽 variable drawer가 담당한다.

- 자주 사용하는 CBS snippet을 현재 Monaco cursor 위치에 삽입한다.
- 버튼 클릭 시 작은 layer popup을 표시하고, variant를 선택하면 삽입한다.
- popup label은 의도 중심 라벨과 문법 표시를 함께 쓴다.
  - 예: `변수 읽기 · getvar`
  - 예: `변수 쓰기 · setvar`
  - 예: `조건 분기 · #if`
  - 예: `반복 · #each`
  - 예: `수식 계산 · calc`
  - 예: `현재 슬롯 사용 · slot`
- 드래그 앤 드롭 블록 에디터는 목표가 아니다.
- shortcut/최근 사용 variant는 후속으로 추가할 수 있지만, MVP 기본 UX는 popup 선택 삽입이다.

## 2. Frontmatter editor

Frontmatter editor는 raw YAML editor가 아니라 포맷별 전용 폼이다.

- 기본은 펼침 상태다.
- 사용자가 접거나 펼친 상태는 포맷별로 기억한다.
- 폼 입력은 webview draft와 preview에 즉시 반영한다.
- VS Code `TextDocument`에는 debounce된 `WorkspaceEdit`으로 반영한다.
- 폼이 직접 노출하지 않는 unknown/advanced field는 가능한 한 보존하거나, 손실 가능성이 있으면 명확한 경고를 표시한다.

### `.risulorebook`

- YAML frontmatter 필드를 전용 control로 표시한다.
- `@@@ KEYS`, `@@@ SECONDARY_KEYS`는 frontmatter editor에 포함한다.
- `KEYS`, `SECONDARY_KEYS` UI는 tag chip이 아니라 줄 단위 textarea를 사용한다.
  - 기존 RisuAI 사용자 경험과 가까운 형태를 우선한다.
  - 한 줄당 key 하나를 기본 안내로 둔다.
- summary bar에는 접힌 상태에서도 `name`, `mode`, key 개수, secondary key 개수, 주요 boolean 상태를 표시한다.

### `.risuregex`

- YAML frontmatter 필드를 전용 control로 표시한다.
- `@@@ IN`, `@@@ OUT`은 frontmatter가 아니라 CBS editor 영역에서 다룬다.

### `.risuprompt`

- YAML frontmatter 필드를 전용 control로 표시한다.
- `type`에 따라 허용 section과 필수 field가 달라진다.
- 상세 규칙은 [prompt template doc](/docs/custom-extension/extensions/prompt-template.md)를 따른다.

### `.risuhtml`

- frontmatter가 없으므로 frontmatter editor를 표시하지 않는다.

## 3. Monaco CBS editor

본문 편집 영역은 Monaco code editor다.

- 전체 editor 경험은 코드 에디터이며, 블록 에디터는 목표가 아니다.
- Monaco model은 가능한 한 실제 VS Code `TextDocument` URI와 안정적으로 연결한다.
- LSP 요청은 webview에서 extension host로 message를 보내고, extension host가 기존 CBS LSP/LanguageClient 쪽에 proxy한다.
- section을 폼과 editor로 분리하더라도, 저장 시 원문 section 구조를 안정적으로 재조립해야 한다.
- section range mapping과 round-trip 테스트로 frontmatter/CBS editor 분리 버그를 잡는다.

### `.risulorebook`

- CBS editor는 `@@@ CONTENT` 하위 내용을 편집한다.
- `@@@ KEYS`, `@@@ SECONDARY_KEYS`는 frontmatter editor에 표시한다.
- LSP proxy MVP는 `CONTENT` 편집 위치 기준 diagnostics, completion, hover, go to definition을 제공한다.

### `.risuregex`

- CBS editor는 `@@@ IN`, `@@@ OUT`을 표시한다.
- 기본 레이아웃은 상하 split이며, 초기 비율은 IN:OUT = 3:7 정도를 권장한다.

### `.risuprompt`

- CBS editor는 `@@@ <SECTION>` 이후 내용을 타입별 허용 section에 맞춰 표시한다.
- `plain`, `jailbreak`, `cot`, `chatML`은 `@@@ TEXT`를 편집한다.
- `persona`, `description`, `lorebook`, `postEverything`, `memory`는 `@@@ INNER_FORMAT`을 편집한다.
- `authornote`는 `@@@ INNER_FORMAT`, `@@@ DEFAULT_TEXT`를 편집한다.
- `chat`, `cache`는 body section이 없으므로 editor 영역은 안내/placeholder를 표시한다.

### `.risuhtml`

- 전체 파일을 Monaco editor로 편집한다.
- rendered HTML preview는 후속 구현 순서에서 다룬다.

## 4. Preview area

Preview area는 오른쪽 result surface의 기본 탭이다.

- preview 입력 범위는 포맷별 대표 섹션으로 고정한다.
  - `.risulorebook`: `@@@ CONTENT`
  - `.risuregex`: `@@@ IN` + `@@@ OUT`
  - `.risuprompt`: `type`별 허용 section
  - `.risuhtml`: full file
- 선택 영역 preview는 MVP 필수는 아니며, 후속 보조 기능으로 둔다.
- preview 아키텍처는 포맷별 preview를 목표로 한다.
- 구현 순서는 lorebook → regex → prompt → html 순서다.

### `.risulorebook` MVP preview

- `@@@ CONTENT` dry-run 결과를 표시한다.
- Variable drawer override를 preview 결과에 반영한다.
- Trace/diagnostics는 MVP 범위에 포함하되, 구현 순서는 `Preview → Variable override → Trace/diagnostics`로 둔다.

## Simulator area

Simulator는 오른쪽 result surface의 두 번째 탭이다.

- Preview는 현재 대표 섹션의 빠른 결과 확인이다.
- Simulator는 실제 RisuAI 실행 맥락에 가까운 full context dry-run 공간이다.
- HTML, 변수, 채팅 히스토리, 캐릭터/모듈 컨텍스트 등 여러 요소가 섞인 상황을 실험한다.
- Simulator context는 workspace 자동 추론과 저장 가능한 simulator profile/override를 함께 사용한다.
  - 기본: 현재 파일 주변 `.risuvar`, `.risuhtml`, lorebook, regex, prompt 등을 스캔한다.
  - 사용자는 특정 character/module/preset 조합과 override를 profile로 저장하고 전환할 수 있다.
- full context simulator/profile은 lorebook MVP 이후 단계적으로 완성한다.

## 5. Variable drawer

Variable injector는 고정 column이 아니라 오른쪽 끝 접이식 drawer다.

- 기본은 얇은 `Variables` rail/button으로 표시한다.
- 열면 preview/simulator에 주입할 변수 목록과 override 값을 편집하는 drawer가 된다.
- drawer 내부는 2단 구조로 구성한다.
  - 상단 고정 영역: `Used here`
  - 하단 접이식 영역: `Workspace variables`, `Profiles`, `Trace context`
- variable 삽입 자체는 Side toolbar 역할이다.
- Variable drawer는 결과 조정과 변수 상태 확인을 담당한다.

### Variable drawer layout

```md
┌─────────────────────────────┐
│ Variables                   │
│ Profile: Default ▾          │
│ 8 used / 2 missing          │
├─────────────────────────────┤
│ Used here                   │
│ ┌─────────────────────────┐ │
│ │ mood        .risuvar    │ │
│ │ calm ▾  angry  sad      │ │
│ │ raw: calm               │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ is_night    usage       │ │
│ │ ○ false  ● true         │ │
│ │ raw: true               │ │
│ └─────────────────────────┘ │
├─────────────────────────────┤
│ ▸ Workspace variables       │
│ ▸ Profiles                  │
│ ▸ Trace context             │
└─────────────────────────────┘
```

- drawer header에는 현재 preview 대상, active simulator profile, used/missing/runtimeUnknown 변수 개수를 표시한다.
- `Used here`는 항상 보인다. preview 결과에 직접 영향을 주는 변수 override가 drawer의 1차 목적이기 때문이다.
- `Workspace variables`, `Profiles`, `Trace context`는 접이식 섹션으로 둔다.
- 접이식 섹션을 열 때만 무거운 workspace/profile 상세 정보를 lazy load한다.

### Variable row

변수 row는 타입별 컨트롤을 우선 제공하되, 항상 raw/free input fallback을 함께 제공한다.

- 공통 표시 정보
  - variable name
  - source badge: `usage`, `.risuvar`, `toggle`, `profile`, `history`, `workspace`, `missing`, `runtimeUnknown`
  - resolved value
  - override control
  - raw input fallback
- 타입별 control
  - boolean/toggle: switch 또는 segmented control
  - enum-like/string candidates: select box 또는 quick chips
  - number: number input, 필요 시 slider
  - string: text input + 후보 chips
  - list/iterator: small list editor 또는 compact table
- row 확장 시 표시할 정보
  - 이 변수가 사용된 위치 목록
  - definition으로 이동하는 버튼
  - trace에서 이 변수가 바꾼 branch/effect 요약

### Candidate inference

Variable 후보값은 혼합형으로 추론한다. 기존 Rust/WASM indexing과 CBS LSP/VariableFlowService를 활용하기 쉽게, 한 가지 출처에 고정하지 않는다.

- 현재 preview 대상 usage
  - `equal`, `not_equal`, `contains`, `#if`, `calc`, `getvar`, `getglobalvar`, `slot` 주변 비교값과 literal을 수집한다.
  - 예: `{{equal::{{getvar::mood}}::angry}}`는 `mood` 후보로 `angry`를 제공한다.
- workspace 변수 정의
  - `.risuvar`, toggle, character default variables, module variables에서 기본값과 알려진 값을 수집한다.
- Rust/WASM index 및 LSP/VariableFlow cache
  - workspace 전체 variable flow, reference, definition, inferred type 정보를 캐시로 받아 사용한다.
  - 매 키 입력마다 full workspace scan을 하지 않는다.
- simulator profile/history
  - 사용자가 이전에 override한 값, 저장한 simulator profile 값, full context simulation history에서 후보를 제공한다.
- 후보 source badge
  - 후보값마다 `usage`, `.risuvar`, `profile`, `toggle`, `history`, `inferred` 같은 출처를 표시한다.
  - 후보가 많으면 top N만 기본 노출하고 `more`로 확장한다.

### Performance policy

- 현재 preview 대상 usage 후보는 즉시 계산한다.
- workspace 후보는 Rust/WASM index, LSP/VariableFlow cache, file watcher 갱신 결과를 우선 사용한다.
- `Workspace variables` 접이식 섹션을 열 때 workspace 상세 후보를 lazy load한다.
- profile/history 후보는 drawer가 열렸거나 Simulator 탭이 활성화된 경우에만 로드한다.
- 후보 추론 실패 시에도 raw/free input fallback으로 override할 수 있어야 한다.

## Implementation architecture

### VS Code integration

- `.risulorebook`, `.risuregex`, `.risuprompt`, `.risuhtml`은 `CustomTextEditorProvider`로 등록한다.
- 텍스트 기반 포맷이므로 VS Code `TextDocument`를 canonical document model로 사용한다.
- Webview는 Monaco editor와 전용 form UI를 렌더링한다.
- Webview → extension host message로 form/editor 변경을 전달한다.
- Extension host는 debounce 후 `WorkspaceEdit`으로 실제 문서를 수정한다.
- `workspace.onDidChangeTextDocument`로 외부 변경과 적용 결과를 webview에 재전송한다.

### LSP proxy

- Webview Monaco는 VS Code extension language features를 직접 호출할 수 없다.
- 다음 요청을 extension host로 proxy한다.
  - completion
  - hover
  - diagnostics
  - go to definition
- diagnostics는 Monaco marker로 변환한다.
- completion은 Monaco completion item으로 변환한다.
- hover는 Monaco hover provider 결과로 변환한다.
- go to definition은 VS Code URI/range를 열거나, 같은 custom editor 내부 range면 webview에 reveal/select message를 보낸다.

### Section mapping and round-trip

- frontmatter form과 Monaco CBS editor가 같은 원문 파일을 나눠 편집하므로 section range mapping이 핵심이다.
- 저장 시 원문 포맷의 marker 순서와 trailing newline 정책을 보존한다.
- 최소 테스트 범위:
  - `.risulorebook` frontmatter + `KEYS` + `SECONDARY_KEYS` + `CONTENT` round-trip
  - `.risulorebook` folder entry edge case
  - `.risuregex` `IN`/`OUT` section split/merge
  - `.risuprompt` type별 section 허용/금지
  - `.risuhtml` full-file identity round-trip

## MVP scope

MVP 완료 기준은 `.risulorebook` 실사용 가능 수준이다.

- 4종 파일이 모두 전용 Webview Editor shell로 열린다.
- `.risulorebook`은 실제 편집에 사용할 수 있어야 한다.
  - frontmatter 전용 폼
  - `KEYS`, `SECONDARY_KEYS` 줄 단위 textarea
  - `@@@ CONTENT` Monaco editor
  - debounce된 `WorkspaceEdit` 기반 문서 반영
  - diagnostics, completion, hover, go to definition LSP proxy
  - Preview 탭의 `CONTENT` dry-run
  - Variable drawer override 반영
  - 타입별 변수 control과 raw input fallback
  - usage/workspace/profile 기반 candidate inference
  - Trace/diagnostics 표시
- `.risuregex`, `.risuprompt`, `.risuhtml`은 shell과 기본 구조 인식을 제공하되, preview/simulator 완성도는 후속 단계로 둔다.

## Execution phases

아래 Phase는 M0~M13 milestone을 하나의 실행 계획으로 묶을 때의 권장 구분이다. 핵심 원칙은 `.risulorebook` 실사용 MVP를 먼저 안정화하고, 그 뒤 다른 포맷과 full simulator로 확장하는 것이다.

| Phase | 포함 milestone | 핵심 목표 | Gate |
|---|---|---|---|
| Phase 1 | M0 | Foundation Shell & Protocol | 4종 파일이 전용 editor shell로 열리고 원문 표시, 기본 edit request, 외부 변경 sync가 동작함 |
| Phase 2 | M1 | Document Model & Round-trip Safety | `.risulorebook` 분해/수정/재조립이 marker 순서와 trailing newline 정책을 보존함 |
| Phase 3 | M2 + M3 | Lorebook Authoring Core | `.risulorebook` metadata와 `CONTENT`를 전용 UI에서 편집하고 실제 문서에 debounce 반영함 |
| Phase 4 | M4 + M5 | LSP Bridge & Quick Preview | Monaco diagnostics/completion/hover/go-to-definition과 `CONTENT` dry-run preview가 동작함 |
| Phase 5 | M6 + M7 | Variable Runtime Controls & Trace | Variable override가 preview 결과를 바꾸고, missing/runtimeUnknown/trace 근거를 확인할 수 있음 |
| Phase 6 | M8 | Lorebook MVP Hardening | M0~M7 통합 QA를 통과해 `.risulorebook` 전용 editor를 실사용 MVP로 고정함 |
| Phase 7 | M9 + M10 + M11 + M12 | Format Expansion & Full Simulator | regex, prompt, html, full simulator profile을 lorebook에서 검증된 구조 위에 확장함 |
| Phase 8 | M13 | Advanced LSP Bridge | references, rename, CodeLens 등 고급 LSP 기능을 Monaco bridge에 추가함 |

### Phase 1. Foundation Shell & Protocol

- 포함 milestone: `M0`
- 목표: 전용 Webview Editor의 최소 뼈대를 만든다.
- 주요 작업
  - `.risulorebook`, `.risuregex`, `.risuprompt`, `.risuhtml` `CustomTextEditorProvider` 등록
  - webview ↔ extension host message protocol 정의
  - VS Code `TextDocument` source-of-truth 유지
  - 3-zone layout shell 구성
  - split/frontmatter/drawer preference skeleton 추가
- 완료 기준
  - 4종 파일이 전용 editor shell로 열린다.
  - 원문 표시, 기본 edit request, 외부 변경 sync가 동작한다.

### Phase 2. Document Model & Round-trip Safety

- 포함 milestone: `M1`
- 목표: frontmatter/form/editor 분리로 인한 문서 손상을 막는 기반을 만든다.
- 주요 작업
  - `.risulorebook` frontmatter / `KEYS` / `SECONDARY_KEYS` / `CONTENT` range mapping
  - `.risuregex`, `.risuprompt`, `.risuhtml` skeleton mapping
  - form/editor state → 원문 재조립 pipeline
  - malformed section warning 처리
  - round-trip regression 기반 마련
- 완료 기준
  - `.risulorebook`을 분해/수정/재조립해도 marker 순서와 trailing newline 정책이 보존된다.

### Phase 3. Lorebook Authoring Core

- 포함 milestone: `M2 + M3`
- 목표: `.risulorebook`을 실제로 편집할 수 있는 authoring UI를 만든다.
- 주요 작업
  - frontmatter 전용 폼
  - `KEYS`, `SECONDARY_KEYS` 줄 단위 textarea
  - `@@@ CONTENT` Monaco editor
  - side toolbar snippet popup
  - split pane drag resize
  - 포맷별 preference 저장
- 완료 기준
  - 사용자가 `.risulorebook` metadata와 `CONTENT`를 전용 UI에서 편집하고, 변경이 debounce 후 실제 문서에 반영된다.

### Phase 4. LSP Bridge & Quick Preview

- 포함 milestone: `M4 + M5`
- 목표: Monaco를 기존 CBS LSP와 연결하고, 빠른 lorebook preview를 만든다.
- 주요 작업
  - completion proxy
  - diagnostics → Monaco markers
  - hover proxy
  - go to definition proxy
  - position mapping / stale version guard
  - `.risulorebook @@@ CONTENT` dry-run preview
  - `Preview | Simulator` result surface UI
- 완료 기준
  - Monaco 안에서 diagnostics/completion/hover/go-to-definition이 동작한다.
  - `CONTENT` 수정이 Preview에 즉시 반영된다.
- 주의
  - position mapping이 틀리면 LSP, preview trace, definition 이동이 함께 흔들리므로 이 Phase를 독립 gate로 검증한다.

### Phase 5. Variable Runtime Controls & Trace

- 포함 milestone: `M6 + M7`
- 목표: preview 결과를 변수로 조작하고, 결과의 근거를 볼 수 있게 한다.
- 주요 작업
  - Variable rail + drawer
  - `Used here` 고정 영역
  - workspace/profile/trace 접이식 영역
  - 타입별 variable control + raw input fallback
  - usage / `.risuvar` / toggle / Rust-WASM index / LSP VariableFlow cache / profile 후보 결합
  - lazy/cache/progressive 성능 정책
  - missing/runtimeUnknown 표시
  - trace/diagnostics panel
- 권장 내부 분할
  - `M6a`: Used-here override MVP + raw fallback + 현재 preview usage 후보
  - `M6b`: workspace/profile/Rust-WASM/LSP cache 기반 후보 확장
- 완료 기준
  - drawer에서 variable override를 바꾸면 Preview 결과가 바뀐다.
  - 후보값 추론과 raw fallback이 모두 동작한다.
  - 매 입력마다 full workspace scan을 수행하지 않는다.

### Phase 6. Lorebook MVP Hardening

- 포함 milestone: `M8`
- 목표: `.risulorebook`을 하루 편집에 실제로 쓸 수 있는 MVP로 고정한다.
- 주요 작업
  - M0~M7 통합 QA
  - round-trip regression
  - debounce race 검증
  - external document change sync 검증
  - preference persistence 검증
  - large lorebook responsiveness smoke test
- 완료 기준
  - `.risulorebook` 전용 Webview Editor가 실사용 가능한 MVP로 고정된다.
  - 이 Phase를 통과하기 전에는 `.risuregex`, `.risuprompt`, `.risuhtml` 구현을 깊게 진행하지 않는다.

### Phase 7. Format Expansion & Full Simulator

- 포함 milestone: `M9 + M10 + M11 + M12`
- 목표: lorebook에서 검증된 구조를 다른 포맷과 full simulator로 확장한다.
- 권장 순서
  1. `M9` `.risuregex`: `IN`/`OUT` split editor, regex simulator, regex frontmatter form
  2. `M10` `.risuprompt`: type별 frontmatter, 허용 section editor, prompt section preview
  3. `M11` `.risuhtml`: full-file Monaco, rendered HTML preview, CSP/sandbox 정책
  4. `M12` Full Simulator profiles: workspace 자동 context 추론, character/module/preset 조합, profile 저장/전환
- 완료 기준
  - 각 포맷이 대표 editor/preview path를 독립적으로 제공한다.
  - full simulator는 HTML/변수/채팅 히스토리/context 결합을 profile로 재사용할 수 있다.

### Phase 8. Advanced LSP Bridge

- 포함 milestone: `M13`
- 목표: Monaco 경험을 기존 VS Code 텍스트 에디터에 더 가깝게 만든다.
- 주요 작업
  - references
  - rename
  - CodeLens
  - workspace symbol/search
  - advanced multi-section position mapping
- 완료 기준
  - MVP 이후 남겨둔 고급 CBS LSP 기능이 Monaco 안에서도 일관되게 동작한다.

## Implementation milestones

이 milestone은 후속 구현 계획의 기준 단위다. 각 milestone은 독립적으로 검증 가능해야 하며, 이전 milestone의 산출물을 깨지 않는 방식으로 진행한다.

### M0. Editor shell and protocol baseline

목표: 4종 `.risu*` 파일을 전용 Webview Editor shell로 열 수 있는 최소 기반을 만든다.

- 범위
  - `.risulorebook`, `.risuregex`, `.risuprompt`, `.risuhtml` `CustomTextEditorProvider` 등록
  - VS Code `TextDocument` source-of-truth 유지
  - webview ↔ extension host message protocol 정의
  - document init, document changed, edit request, error response message 추가
  - 3-zone layout shell: side toolbar / authoring area / result surface + variable rail
  - 포맷별 preference 저장소 skeleton: split ratio, frontmatter open state, drawer open state
- 완료 기준
  - 4종 파일이 기본 전용 Webview Editor로 열린다.
  - 각 파일의 원문이 webview에 표시된다.
  - 외부 파일 변경이 webview에 반영된다.
  - webview edit request가 `WorkspaceEdit`으로 실제 `TextDocument`에 반영된다.
  - raw text editor fallback command 또는 VS Code reopen path가 유지된다.

### M1. Format parser bridge and round-trip model

목표: frontmatter/form/editor 분리를 안전하게 만들 section model과 round-trip 기반을 만든다.

- 범위
  - webview/editor용 normalized document model 정의
  - `.risulorebook` frontmatter, `KEYS`, `SECONDARY_KEYS`, `CONTENT` range mapping
  - `.risuregex` `IN`/`OUT` range mapping skeleton
  - `.risuprompt` type별 section mapping skeleton
  - `.risuhtml` full-file identity model
  - debounce된 form/editor 변경 → source 재조립 pipeline
- 완료 기준
  - `.risulorebook` 원문을 form state와 `CONTENT` editor state로 분해할 수 있다.
  - form/editor 수정 후 marker 순서와 trailing newline 정책을 보존해 재조립한다.
  - `.risuregex`, `.risuprompt`, `.risuhtml`은 최소 shell state로 파싱 실패 없이 열린다.
  - malformed/unsupported section은 문서를 깨지 않고 경고 상태로 표시한다.

### M2. `.risulorebook` frontmatter authoring MVP

목표: `.risulorebook` metadata를 기존 RisuAI 사용자 경험에 가까운 전용 폼으로 편집한다.

- 범위
  - YAML frontmatter 전용 controls
  - `KEYS`, `SECONDARY_KEYS` 줄 단위 textarea
  - frontmatter 기본 펼침 + 포맷별 접힘 상태 기억
  - summary bar: `name`, `mode`, key count, secondary key count, 주요 boolean 상태
  - unknown/advanced field 보존 또는 손실 경고
- 완료 기준
  - `.risulorebook` frontmatter/keys/secondary keys를 폼에서 수정할 수 있다.
  - 수정 내용이 debounce 후 실제 문서에 반영된다.
  - 접힘/펼침 상태가 `.risulorebook` preference로 유지된다.
  - folder lorebook edge case가 깨지지 않는다.

### M3. Monaco CBS editor MVP

목표: `.risulorebook @@@ CONTENT`를 Monaco 코드 에디터로 실사용 편집한다.

- 범위
  - Monaco bundle/webview integration
  - `CONTENT` editor model 생성
  - cursor/selection tracking
  - side toolbar snippet popup → Monaco cursor insertion
  - 의도 중심 label + 문법 표시 snippet catalog
  - editor/result split pane drag resize + 포맷별 비율 기억
- 완료 기준
  - `@@@ CONTENT`를 Monaco에서 편집할 수 있다.
  - snippet popup에서 선택한 CBS snippet이 현재 cursor/selection에 삽입된다.
  - split pane 비율이 조절되고 `.risulorebook` preference로 유지된다.
  - 블록 에디터 UX가 섞이지 않는다.

### M4. CBS LSP proxy MVP

목표: 기존 CBS LSP의 핵심 실사용 기능을 Monaco에 연결한다.

- 범위
  - completion proxy
  - diagnostics proxy → Monaco markers
  - hover proxy
  - go to definition proxy
  - webview position ↔ source document position mapping
  - stale document version guard
- 완료 기준
  - `.risulorebook CONTENT` 편집 중 completion이 동작한다.
  - diagnostics가 Monaco marker로 표시되고 stale marker가 정리된다.
  - hover 정보가 Monaco hover로 표시된다.
  - go to definition이 VS Code URI/range 또는 같은 editor 내부 range로 이동한다.
  - MVP 범위에서 references, rename, CodeLens는 명시적으로 후속으로 남긴다.

### M5. `.risulorebook` Preview MVP

목표: 오른쪽 `Preview` 탭에서 `@@@ CONTENT` dry-run 결과를 즉시 확인한다.

- 범위
  - `Preview | Simulator` result surface 탭 UI
  - `.risulorebook` 대표 preview 대상: `@@@ CONTENT`
  - webview draft 변경 즉시 preview refresh
  - CBS simulator dry-run result view
  - 기본 trace/diagnostics placeholder 또는 최소 표시
- 완료 기준
  - `CONTENT` 수정이 Preview 결과에 즉시 반영된다.
  - Preview 탭은 전체 작업공간이 아니라 오른쪽 result surface만 전환한다.
  - preview 입력 범위는 선택 영역이 아니라 포맷 대표 섹션으로 고정된다.
  - simulator/profile full context가 없어도 빠른 preview가 동작한다.

### M6. Variable drawer MVP

목표: preview 결과를 바꾸는 변수를 drawer에서 직접 조작한다.

- 범위
  - 오른쪽 `Variables` rail + 접이식 drawer
  - 2단 구조: `Used here` 고정 + `Workspace variables`/`Profiles`/`Trace context` 접이식
  - variable row 공통 정보: name, source badge, resolved value, override control, raw input fallback
  - 타입별 control: boolean/toggle, enum-like candidates, number, string, list/iterator skeleton
  - candidate inference 혼합형
    - 현재 preview usage
    - `.risuvar`/toggle/default variables
    - Rust/WASM index 및 LSP/VariableFlow cache
    - simulator profile/history
  - lazy/cache/progressive 성능 정책
- 완료 기준
  - `Used here` 변수 override가 Preview 결과에 반영된다.
  - 후보값이 있으면 select/chips/switch 등 타입별 control로 선택할 수 있다.
  - 후보 추론이 불가능한 변수도 raw/free input으로 override할 수 있다.
  - workspace/profile 상세 후보는 drawer/section open 시 lazy load된다.
  - 매 입력마다 full workspace scan을 수행하지 않는다.

### M7. Trace and diagnostics panel

목표: preview/simulator 결과의 근거를 사용자가 이해할 수 있게 한다.

- 범위
  - Preview trace summary
  - variable row 확장 시 사용 위치, definition 이동, branch/effect 요약
  - missing/runtimeUnknown 변수 경고
  - CBS diagnostics와 simulator diagnostics의 구분 표시
- 완료 기준
  - missing/runtimeUnknown 변수가 drawer header와 row에 표시된다.
  - trace에서 어떤 변수/분기가 결과에 영향을 줬는지 확인할 수 있다.
  - definition 이동 버튼이 LSP proxy와 충돌하지 않는다.

### M8. `.risulorebook` MVP hardening and acceptance

목표: `.risulorebook`을 하루 편집에 실제로 쓸 수 있는 MVP로 고정한다.

- 범위
  - M0~M7 통합 QA
  - round-trip regression
  - debounce edit race 검증
  - external document change sync 검증
  - preference persistence 검증
  - large lorebook responsiveness smoke test
- 완료 기준
  - `.risulorebook` frontmatter/KEYS/SECONDARY_KEYS/CONTENT 편집이 실제 문서에 안정적으로 반영된다.
  - Monaco LSP proxy MVP 기능이 모두 동작한다.
  - Preview + Variable drawer override + Trace/diagnostics가 함께 동작한다.
  - raw text editor fallback을 통해 원문 확인/복구가 가능하다.

### M9. `.risuregex` extension milestone

목표: `.risuregex`를 shell 수준에서 실사용 preview 수준으로 올린다.

- 범위
  - `IN`/`OUT` 상하 split editor 완성
  - regex simulator 연결
  - regex frontmatter form controls
  - Variable drawer와 simulator input 연동
- 완료 기준
  - `IN` 입력과 `OUT` replacement/simulator 결과를 한 화면에서 비교할 수 있다.
  - IN:OUT split preference가 `.risuregex` 포맷별로 유지된다.

### M10. `.risuprompt` extension milestone

목표: `.risuprompt` 타입별 section authoring과 preview를 제공한다.

- 범위
  - type별 frontmatter controls
  - 허용 section editor 표시
  - `TEXT`/`INNER_FORMAT`/`DEFAULT_TEXT` preview
  - section이 없는 `chat`/`cache` 안내 UI
- 완료 기준
  - type별 허용/금지 section 규칙이 UI와 validation에 반영된다.
  - prompt section preview가 포맷 대표 섹션 기준으로 동작한다.

### M11. `.risuhtml` extension milestone

목표: `.risuhtml` 편집과 rendered preview를 제공한다.

- 범위
  - full-file Monaco editor
  - rendered HTML preview sandbox
  - security/CSP 정책
  - simulator full context와 HTML 조합 preview
- 완료 기준
  - `.risuhtml` 원문 편집과 rendered preview가 side-by-side로 동작한다.
  - unsafe script/resource handling 정책이 명확하다.

### M12. Full Simulator profiles milestone

목표: Preview와 구분되는 full context Simulator를 완성한다.

- 범위
  - workspace 자동 context 추론
  - character/module/preset 조합 선택
  - `.risuvar`, `.risuhtml`, lorebook, regex, prompt context 결합
  - simulator profile 저장/전환
  - profile/history 기반 variable candidate feedback loop
- 완료 기준
  - 사용자가 특정 실행 맥락을 profile로 저장하고 재사용할 수 있다.
  - HTML, 변수, 채팅 히스토리, 캐릭터/모듈 컨텍스트가 섞인 상황을 simulator에서 실험할 수 있다.

### M13. Advanced LSP bridge milestone

목표: Monaco bridge를 기존 VS Code 텍스트 에디터 경험에 더 가깝게 확장한다.

- 범위
  - references
  - rename
  - CodeLens
  - workspace symbol/search integration
  - advanced multi-section position mapping
- 완료 기준
  - MVP 이후 남겨둔 고급 CBS LSP 기능이 Monaco 안에서도 일관되게 동작한다.

## Initial sketch

## layout
```md



┌───────────────────────────────────────────────────────────────────────────────────┐   
│┌────┐┌─────────────────────────────────┐┌────────┬──────────┐          ┌─────────┐│ 
││    ││ 2. frontmatter editor           ││editor  │simulator │          │5.       ││ 
││1.  ││ (slide down to edit)            │└────────┴──────────┘          │variable ││ 
││side││─────────────────────────────────│┌─────────────────────────────┐│injector ││ 
││tool││                                 ││                             ││         ││ 
││bar ││ 3. cbs editor                   ││                             ││         ││ 
││    ││                                 ││ 4. preview area             ││         ││ 
││    ││                                 ││                             ││         ││ 
││    ││                                 ││                             ││         ││ 
││    ││                                 ││                             ││         ││ 
││    ││                                 ││                             ││         ││ 
││    ││                                 ││                             ││         ││ 
││    ││                                 ││                             ││         ││ 
││    ││                                 ││                             ││         ││ 
││    ││                                 ││                             ││         ││ 
││    ││                                 ││                             ││         ││ 
││    ││                                 ││                             ││         ││ 
││    ││                                 ││                             ││         ││ 
││    ││                                 ││                             ││         ││ 
││    ││                                 ││                             ││         ││ 
││    ││                                 ││                             ││         ││ 
││    ││                                 ││                             ││         ││ 
││    ││                                 ││                             ││         ││ 
││    ││                                 ││                             ││         ││ 
││    ││                                 ││                             ││         ││ 
│└────┘└─────────────────────────────────┘└─────────────────────────────┘└─────────┘│ 
└───────────────────────────────────────────────────────────────────────────────────┘ 
```
### side toolbar 
- 자주사용하는 cbs 등의 개발 편의 도구를 제공한다
- 구상중인 편의도구 
  - getvar 등의 함수 블록으로 가져다놓기
    - 클릭 시 작은 layer popup이 표시됨
  - Variable viewer : 현재 workspace에서 lsp로 variable 목록 가져와서 보여주는 기능
    - 클릭 시 작은 layer popup이 표시됨

### frontmatter editor
* risulorebook, risuregex, risuprompt 와 같이 frontmatter가 있는 format일 경우 표시
- risulorebook
  - frontmatter 이외에 @@@ KEYS, @@@ SECONDARY_KEYS 도 frontmatter editor에 표시
- risuregex, risuprompt
  - frontmatter 만 표시
### cbs editor

#### risulorebook
- @@@ CONTENT 하위 내용 표시

#### risuregex
- @@@ IN, @@@OUT을 표시, 상하 3:7 비율정도로 구성하면 좋을 듯

#### risuprompt
- @@@ <SECTION>이후의 내용 에디팅
- [risuprmopt doc](/docs/custom-extension/extensions/prompt-template.md) 참조

#### risuhtml
  - 
4. preview area
- 

5. variable injector
-
