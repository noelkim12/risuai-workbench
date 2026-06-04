# RisuAI structured output 기반 채팅 UI 파이프라인

이 문서는 `docs/risuai-pipeline-ux.md`에 나열된 중요 섹션을 기준으로, PocketRisu/RisuAI에서 **LLM에게 structured output을 출력하게 하고, 그 결과를 정규식·Lua·트리거로 capture한 뒤 채팅 내부 status/button/UI로 표시하는 파이프라인**을 설명한다.

목표 독자는 다음과 같다.

- 캐릭터 카드 작성자
- 모듈 작성자
- 정규식 script 작성자
- Lua trigger 작성자
- 플러그인 작성자
- RisuAI/PocketRisu 파이프라인을 수정하거나 분석하는 LLM 에이전트

핵심 목표는 다음 흐름을 안정적으로 설계하는 것이다.

```text
프롬프트 조합 단계
  → LLM에게 status/button/state marker 출력을 요청
  → LLM 응답에 structured marker 포함
  → editoutput / editdisplay / Lua / regex / trigger가 marker capture
  → raw marker를 숨기거나 변환
  → 채팅 본문에 status, button, inlay, icon, hint 표시
  → 필요하면 chat state 또는 다음 prompt에 반영
```

> 기준 문서: `docs/risuai-pipeline.md`, `docs/risuai-pipeline-ux.md`  
> 핵심 코드 경로: `src/ts/process/index.svelte.ts`, `src/ts/process/scripts.ts`, `src/ts/parser/parser.svelte.ts`, `src/lib/ChatScreens/Chat.svelte`, `src/lib/ChatScreens/ChatBody.svelte`

---

## 0. 한 줄 요약

```text
Prompt instruction
  → model emits <risu_status>{json}</risu_status>
  → editoutput captures or cleans saved assistant text
  → editdisplay renders display-only UI
  → Chat.svelte handles risu-trigger / risu-btn clicks
  → triggers, Lua, plugin handlers update chat state or send follow-up actions
```

---

## 1. 핵심 파일 지도

| 영역 | 파일 | 핵심 함수/값 | 역할 |
|---|---|---|---|
| 채팅 생성 오케스트레이터 | `src/ts/process/index.svelte.ts` | `sendChat`, `processScriptFull(..., 'editoutput')`, `runTrigger('output')`, `runInlayScreen` | LLM 응답을 받아 저장 전후로 output hook과 trigger를 실행 |
| 정규식/script 처리 | `src/ts/process/scripts.ts` | `processScriptFull`, `processScript`, `ScriptMode` | `editinput`, `editprocess`, `editoutput`, `editdisplay` 처리 |
| Lua hook bridge | `src/ts/process/scriptings.ts` | `runLuaEditTrigger`, `runLuaButtonTrigger` | Lua `editInput`, `editOutput`, `editDisplay`, `onButtonClick` 실행 |
| Trigger 처리 | `src/ts/process/triggers.ts` | `runTrigger` | `input/start/request/output/display/manual` trigger 실행 |
| inlay 변환 | `src/ts/process/inlayScreen.ts` | `runInlayScreen`, `updateInlayScreen` | `<Emotion="...">`, `<ImgGen="...">` 같은 structured output을 inlay/display marker로 변환 |
| Markdown/HTML parser | `src/ts/parser/parser.svelte.ts` | `ParseMarkdown`, `trimMarkdown`, `parseInlayAssets`, `resolveInlayPlaceholders` | chat text를 HTML로 렌더링하고 `risu-trigger`, `risu-btn`, inlay 속성을 보존 |
| 버튼 helper | `src/ts/cbs.ts` | `{{button::label::trigger}}` | clickable `<button risu-trigger="...">` 생성 |
| 직접 HTML 버튼 | Lua/regex `editdisplay` output | `<button risu-trigger="...">` | CBS helper를 쓰지 않고 만든 HTML button도 parser sanitize 후 `Chat.svelte` click handler로 연결 |
| 채팅 메시지 UI | `src/lib/ChatScreens/Chat.svelte` | `handleButtonTriggerWithin` | `[risu-trigger]`, `[risu-btn]` 클릭을 manual trigger 또는 Lua button trigger로 연결 |
| 채팅 본문 렌더링 | `src/lib/ChatScreens/ChatBody.svelte` | `markParsing`, `stageAndCommit` | `ParseMarkdown()` 결과를 staged HTML로 렌더링하고 inlay placeholder를 해소 |
| 정규식 UI | `src/lib/SideBars/Scripts/RegexData.svelte` | regex type selector | `editoutput`, `editdisplay`, `editprocess`, `editinput` script 작성 UI |
| 플러그인 registry | `src/ts/plugins/plugins.svelte.ts` | `pluginV2.edit*`, `pluginV2.replacerbeforeRequest` | plugin script handler와 request replacer 저장 |

실전 예시는 `lb_sample/🔦라이트보드 - 3.4.0/`와 `lb_sample/🔦라이트보드 🌠 삽화 3.4.1/`의 Lua/regex 파일에서 확인할 수 있다.

---

## 2. 데이터 표면: 저장 텍스트, LLM prompt, 표시 HTML

structured output UI를 설계할 때는 같은 assistant 응답이 세 표면을 지난다는 점을 구분해야 한다.

```text
Stored chat message
  Message.data

LLM prompt message
  OpenAIChat.content

Rendered chat display
  ParseMarkdown() 이후 HTML
```

### 2.1 `Message.data`

`Message.data`는 실제 채팅 이력에 저장되는 문자열이다.

```ts
DBState.db.characters[selectedChar].chats[selectedChat].message[index].data
```

`editoutput`에서 structured marker를 제거하면 저장본에도 남지 않는다. 반대로 `editdisplay`에서만 숨기면 저장본에는 marker가 남는다.

### 2.2 `OpenAIChat.content`

다음 LLM 요청 시 기존 `Message.data`는 `editprocess`를 거쳐 `OpenAIChat.content`가 된다.

```text
Message.data
  → risuChatParser(...)
  → processScriptFull(..., 'editprocess')
  → OpenAIChat.content
```

따라서 이전 UI marker를 다음 prompt에 다시 넣을지 여부는 `editprocess`에서 제어하는 것이 적합하다.

### 2.3 표시 HTML

채팅 화면 표시 시 `ParseMarkdown()`은 `editdisplay`를 실행하고 HTML을 sanitize한다.

```text
Message.data
  → processScriptFull(..., 'editdisplay')
  → parseInlayAssets()
  → renderHighlightableMarkdown()
  → DOMPurify sanitize
  → ChatBody.svelte 표시
```

`parser.svelte.ts`의 sanitize 설정은 다음 UI 관련 속성을 보존한다.

```text
risu-trigger
risu-btn
risu-mark
risu-id
data-inlay-id
data-inlay-type
risu-ctrl
```

이 보존 규칙 때문에 regex/Lua/CBS가 만든 버튼과 inlay placeholder가 채팅 내부 UI로 동작할 수 있다.

---

## 3. 프롬프트 조합 단계에서 structured output 요청하기

`docs/risuai-pipeline.md`의 5번 섹션은 structured output 요청을 어디에 넣을지 결정하는 기준이다.

### 3.1 durable instruction 위치

항상 유지되어야 하는 structured output 지시는 다음 위치가 적합하다.

| 위치 | 사용 조건 |
|---|---|
| `currentChar.systemPrompt` | 캐릭터가 항상 같은 marker 규칙을 따라야 할 때 |
| `currentChar.desc/personality/scenario` | 캐릭터 설정과 UI 상태 출력 규칙이 결합될 때 |
| promptTemplate의 `postEverything` | 응답 끝에 항상 marker 형식을 강제하고 싶을 때 |
| lorebook | 특정 장면, 전투, 퀘스트, 시스템 키워드에서만 marker가 필요할 때 |
| `additonalSysPrompt.promptend` | trigger가 조건부로 structured output 규칙을 추가할 때 |
| module lorebook/prompt | 모듈 단위로 UI marker 규칙을 배포할 때 |

### 3.2 권장 marker 형식

명시적인 tag와 JSON payload를 사용한다.

```text
<risu_status>
{
  "version": 1,
  "status": {
    "type": "choice",
    "label": "Choose how to proceed"
  },
  "buttons": [
    {
      "id": "leave_now",
      "label": "Leave now",
      "trigger": "leave_now"
    },
    {
      "id": "wait_until_dawn",
      "label": "Wait until dawn",
      "trigger": "wait_until_dawn"
    }
  ]
}
</risu_status>
```

권장 규칙은 다음과 같다.

- marker tag 이름은 일반 대화에 잘 나오지 않는 이름을 사용한다.
- JSON은 하나의 root object만 사용한다.
- 버튼 `id`는 stable string을 사용한다.
- 응답 하나에 같은 marker를 여러 개 출력하지 않도록 지시한다.
- UI 상태가 필요 없으면 marker를 생략하게 한다.
- 캐릭터 대사는 JSON 내부에 넣지 않게 한다.

### 3.3 prompt instruction 예시

```text
When the response creates a visible UI state for the user, append one status block at the end.

Format:
<risu_status>
{
  "version": 1,
  "status": {
    "type": "idle|choice|combat|warning|error|custom",
    "label": "short status text"
  },
  "buttons": [
    {
      "id": "stable_button_id",
      "label": "visible button label",
      "trigger": "manual_trigger_name"
    }
  ]
}
</risu_status>

Rules:
- Output valid JSON only inside <risu_status>.
- Do not mention the status block in dialogue.
- Output at most one status block.
- Omit the block when no UI state is needed.
```

### 3.4 JSON schema helper 참고

코드베이스에는 structured JSON schema 변환 helper가 있다.

| 파일 | 함수 | 용도 |
|---|---|---|
| `src/ts/process/templates/jsonSchema.ts` | `convertInterfaceToSchema` | TypeScript interface 또는 JSON schema 문자열을 schema object로 변환 |
| `src/ts/process/templates/jsonSchema.ts` | `getOpenAIJSONSchema` | OpenAI 계열 structured output schema wrapper 생성 |
| `src/ts/process/templates/jsonSchema.ts` | `getGeneralJSONSchema` | 일반 provider용 schema instruction 생성 |
| `src/ts/process/templates/jsonSchema.ts` | `extractJSON` | 응답 문자열에서 JSON 추출 |

주의: 이 helper들은 core prompt/template 처리용이며, 공개 plugin API 문서에서 직접 호출 API로 설명된 항목은 아니다. character/module/plugin 작성자는 prompt instruction, regex/Lua capture, trigger/plugin hook을 기본 진입점으로 보는 것이 안전하다.

---

## 4. 출력 capture 지점

structured output capture에는 네 가지 주요 지점이 있다.

### 4.1 `editoutput`: 저장 전 응답 capture

`sendChat()`는 streaming/non-streaming 응답을 `Message.data`에 쓰기 전에 `editoutput`을 실행한다.

```text
LLM response
  → processScriptFull(..., 'editoutput', msgIndex)
  → Message.data 저장
```

사용 목적:

- raw marker를 저장 전에 제거
- marker payload를 Lua/regex/plugin으로 capture
- assistant 응답을 normalize
- emotion marker 또는 inlay marker로 변환

주의:

- streaming에서는 chunk마다 반복 실행된다.
- 닫는 tag가 없는 partial marker를 parse하면 안 된다.
- 같은 marker를 여러 번 처리하지 않도록 idempotent해야 한다.

### 4.2 `editdisplay`: 표시 전 UI 렌더링

`ParseMarkdown()`은 화면 표시 직전에 `editdisplay`를 실행한다.

```text
Message.data
  → processScriptFull(..., 'editdisplay')
  → rendered HTML
```

사용 목적:

- 저장된 marker를 화면에서 숨김
- marker를 status HTML이나 button HTML로 치환
- 저장본은 유지하고 표시만 바꿈
- icon, hint, platform area 같은 UI decoration 생성

`lb_sample`의 `Display_platform_area.risuregex`, `Display_interaction_hints.risuregex`, `Display_*_icon.risuregex` 계열은 display regex로 채팅 내부 UI를 만드는 예시다.

### 4.3 `editprocess`: 다음 prompt 유입 제어

이전 assistant message에 남은 structured marker가 다음 LLM prompt에 그대로 들어가면 context가 오염될 수 있다.

```text
Message.data with marker
  → processScriptFull(..., 'editprocess')
  → marker 제거 또는 요약
  → OpenAIChat.content
```

사용 목적:

- verbose JSON marker 제거
- UI 상태를 짧은 자연어 summary로 치환
- 다음 LLM이 볼 필요 없는 button markup 제거
- `risu-trigger` HTML이 prompt에 재주입되는 것을 방지

### 4.4 `editRequest` Lua trigger / request trigger

최종 `OpenAIChat[]` 배열을 수정해야 할 때는 request 직전 hook을 사용한다.

```text
formated: OpenAIChat[]
  → runLuaEditTrigger(currentChar, 'editRequest', formated)
  → pluginV2.replacerbeforeRequest
  → runTrigger('request', { displayData: JSON.stringify(formated) })
  → provider adapter
```

사용 목적:

- 현재 UI state summary를 마지막 system prompt로 삽입
- marker 출력 지시를 request 직전에 강제
- 특정 모델/provider에 맞게 structured output 지시를 조정

---

## 5. 정규식 script 전략

### 5.1 기본 capture regex

complete block만 잡는 regex를 사용한다.

```regex
<risu_status>\s*([\s\S]*?)\s*<\/risu_status>
```

이 regex는 streaming partial block을 건드리지 않는다. `</risu_status>`가 도착한 뒤에만 match된다.

### 5.2 표시용 HTML로 변환

`editdisplay`에서 marker를 button HTML로 치환할 수 있다.

단순 버튼은 CBS helper를 사용할 수 있다.

```text
{{button::Continue::continue_trigger}}
```

CBS helper는 다음 HTML을 만든다.

```html
<button class="button-default" risu-trigger="continue_trigger">Continue</button>
```

Lua나 regex가 직접 HTML을 만들 때도 `risu-trigger`를 사용하면 `Chat.svelte`가 click을 manual trigger로 연결한다.

```html
<button class="button-default" risu-trigger="leave_now" risu-id="leave_now">
  Leave now
</button>
```

직접 HTML 버튼의 처리 흐름은 다음과 같다.

```text
editdisplay regex/Lua output
  → HTML with risu-trigger
  → ParseMarkdown() sanitize preserves risu-trigger
  → ChatBody.svelte renders staged HTML
  → Chat.svelte handleButtonTriggerWithin()
  → runTrigger(currentChar, 'manual', { manualName, triggerId })
```

### 5.3 regex capture → chat variable 저장

정규식으로 message 일부를 capture한 뒤 그 값을 chat variable로 저장해 다음 trigger, Lua, prompt summary에서 사용할 수 있다.

```text
LLM response
  → editoutput regex captures marker or field
  → trigger/Lua/plugin stores captured value in chat variable
  → editdisplay renders UI from chat variable or compact marker
  → editprocess/request hook inserts a short summary when the next prompt needs it
```

사용 목적:

- 버튼 선택지, 상태 label, scene flag를 chat variable로 보존
- raw JSON marker를 제거해도 trigger가 참조할 상태 유지
- 다음 prompt에는 전체 JSON 대신 짧은 state summary만 주입

주의:

- capture 값은 complete marker에서만 저장한다.
- 같은 `chatID + markerHash`에 대해 chat variable update를 한 번만 실행한다.
- 사용자 화면 표시용 HTML과 prompt에 들어갈 state summary를 분리한다.

### 5.4 regex action 활용

`processScriptFull()`의 regex script는 다음 특수 action을 지원한다.

| action | 사용 목적 |
|---|---|
| `@@emo <name>` | emotion 변경 |
| `@@inject` | 원본 message에 주입하고 현재 data에서는 제거 |
| `@@move_top` | match 결과를 message 앞쪽으로 이동 |
| `@@move_bottom` | match 결과를 message 뒤쪽으로 이동 |
| `@@repeat_back` | 이전 같은 role message의 match 결과 재사용 |
| `<order N>` | regex 적용 순서 조정 |
| `<cbs>` | regex input에 CBS/parser 조건 사용 |

### 5.5 streaming-safe regex 규칙

```text
Permitted actions:
  - complete opening/closing tag가 있을 때만 parse
  - replacement 결과를 deterministic하게 생성
  - 같은 payload에 같은 button id를 사용
  - side effect는 Lua/trigger 쪽에서 deduplicate

Prohibited actions:
  - partial JSON parse
  - 매 chunk마다 random id 생성
  - closing tag가 없는데 marker 제거
  - 외부 API 호출 같은 비용 큰 작업을 editoutput regex로 반복 수행
```

---

## 6. Lua hook 전략

정규식만으로 JSON parse, validation, deduplication을 처리하기 어렵다면 Lua hook을 사용한다.

### 6.1 Lua가 적합한 경우

```text
Application scope:
  - JSON payload parse
  - button 배열 validation
  - message index 기반 deduplication
  - chat variable 저장
  - trigger chain 실행
  - marker payload hash 비교

Out-of-scope behavior:
  - 단순 문자열 치환만 필요한 경우
  - HTML decoration만 필요한 경우
```

### 6.2 Lua edit hook 위치

`processScriptFull()`은 regex/plugin 처리보다 먼저 Lua edit trigger를 실행한다.

```text
processScriptFull(char, data, mode, chatID)
  1. runLuaEditTrigger(char, mode, data, { index: chatID })
  2. display trigger if mode === 'editdisplay'
  3. pluginV2[mode]
  4. risuChatParser
  5. regex scripts
```

`runLuaEditTrigger()`의 주요 mode 대응은 다음과 같다.

| ScriptMode | Lua side |
|---|---|
| `editinput` | `editInput` |
| `editoutput` | `editOutput` |
| `editdisplay` | `editDisplay` |

버튼 click은 `runLuaButtonTrigger()`를 통해 `onButtonClick` 흐름으로 들어간다.

### 6.3 Lua capture 책임

Lua output hook의 책임은 다음처럼 나눌 수 있다.

```text
input: assistant response text
detect: <risu_status>...</risu_status>
parse: JSON payload
validate: version/status/buttons fields
dedupe: message index + payload hash
store: chat variable, module state, or compact marker
return: cleaned or transformed assistant response
```

### 6.4 idempotency checklist

Lua hook은 다음 값을 기준으로 중복 실행을 막아야 한다.

- `chatID` 또는 message index
- marker payload hash
- button `id`
- last processed marker version
- stream 완료 여부를 판별할 수 있는 closing tag 존재 여부

---

## 7. status/button 렌더링 모델

### 7.1 데이터 추출, 상태 저장, 렌더링 분리

status/button UI는 세 계층으로 나누면 충돌이 줄어든다.

```text
Data extraction layer
  editoutput / Lua / regex / plugin captures marker

State layer
  chat var, module state, compact marker, or saved Message.data

Render layer
  editdisplay regex/Lua, CBS button helper, inlay, Chat.svelte click handler
```

### 7.2 button contract

```json
{
  "id": "stable_button_id",
  "label": "Visible button label",
  "kind": "primary|secondary|danger|ghost",
  "trigger": "manual_trigger_name",
  "disabled": false,
  "tooltip": "optional text"
}
```

렌더링 결과 예시는 다음과 같다.

```html
<div class="risu-status-panel" risu-mark="status">
  <div class="risu-status-label">Choose how to proceed</div>
  <button class="button-default" risu-trigger="leave_now" risu-id="leave_now">Leave now</button>
  <button class="button-default" risu-trigger="wait_until_dawn" risu-id="wait_until_dawn">Wait until dawn</button>
</div>
```

`Chat.svelte`는 이 버튼 click을 다음처럼 처리한다.

```text
[risu-trigger]
  → runTrigger(currentChar, 'manual', { manualName, triggerId })

[risu-btn]
  → runLuaButtonTrigger(currentChar, btnEvent)
```

### 7.3 status contract

```json
{
  "type": "idle|thinking|choice|combat|warning|error|custom",
  "label": "short display text",
  "detail": "optional longer text",
  "expires": "never|next_user_message|next_assistant_message",
  "priority": 0
}
```

---

## 8. state lifetime 정책

### 8.1 display-only state

```text
Application scope:
  - 새로고침 후 사라져도 되는 UI
  - 다음 prompt에 영향을 주면 안 되는 hint/icon
  - 저장본 변경 없이 화면만 꾸미는 요소

Recommended hook:
  - editdisplay
```

### 8.2 stored state

```text
Application scope:
  - 새로고침 후에도 유지되어야 하는 status/button
  - export/replay 시 보존되어야 하는 상태
  - 다음 prompt나 trigger가 참조해야 하는 상태

Recommended hook:
  - editoutput capture
  - Lua/chat variable 저장
  - regex capture 후 trigger/Lua/plugin을 통한 chat variable 저장
  - compact marker 보존
```

정규식 capture 값을 chat variable로 저장하는 방식은 raw marker를 저장본에서 제거하면서도 상태를 유지해야 할 때 적합하다. 이 경우 `editoutput`은 capture/cleanup을 담당하고, trigger/Lua/plugin은 capture된 값을 chat variable에 기록하며, `editprocess` 또는 request hook은 필요한 경우 chat variable을 짧은 prompt-visible summary로 변환한다.

### 8.3 prompt-visible state summary

raw JSON을 다음 prompt에 그대로 넣지 않고, 짧은 summary만 넣을 수 있다.

```text
[UI state: Mira offered a secret meeting. Available actions: go_station, ask_more.]
```

이 변환은 `editprocess`, request trigger, `editRequest` Lua trigger에서 처리할 수 있다.

---

## 9. end-to-end 예시

### 9.1 prompt instruction

```text
At the end of your response, optionally emit one UI block.

<risu_status>
{
  "version": 1,
  "status": {
    "type": "choice",
    "label": "A decision is available"
  },
  "buttons": [
    {
      "id": "continue",
      "label": "Continue",
      "trigger": "continue_scene"
    }
  ]
}
</risu_status>

Do not put character dialogue inside the JSON block.
```

### 9.2 model output

```text
"Then we move before sunrise," Arlen says, tightening the strap on his pack.

<risu_status>
{
  "version": 1,
  "status": {
    "type": "choice",
    "label": "Choose how to proceed"
  },
  "buttons": [
    {
      "id": "leave_now",
      "label": "Leave now",
      "trigger": "leave_now"
    },
    {
      "id": "wait_until_dawn",
      "label": "Wait until dawn",
      "trigger": "wait_until_dawn"
    }
  ]
}
</risu_status>
```

### 9.3 capture result

```json
{
  "messageIndex": 42,
  "status": {
    "type": "choice",
    "label": "Choose how to proceed"
  },
  "buttons": [
    {
      "id": "leave_now",
      "label": "Leave now",
      "trigger": "leave_now"
    },
    {
      "id": "wait_until_dawn",
      "label": "Wait until dawn",
      "trigger": "wait_until_dawn"
    }
  ]
}
```

### 9.4 rendered chat

```text
Arlen: "Then we move before sunrise," Arlen says, tightening the strap on his pack.

Status: Choose how to proceed

[Leave now] [Wait until dawn]
```

---

## 10. trigger / plugin / module 연결

### 10.1 manual trigger button

채팅 내부 button에 `risu-trigger`가 있으면 click 시 manual trigger가 실행된다.

```html
<button risu-trigger="accept_quest" risu-id="accept_quest">Accept quest</button>
```

실행 흐름:

```text
button click
  → Chat.svelte handleButtonTriggerWithin()
  → runTrigger(currentChar, 'manual', { manualName: 'accept_quest', triggerId: 'accept_quest' })
  → triggerResult.chat 반영
  → ReloadChatPointer 갱신
```

### 10.2 Lua button

`risu-btn`은 Lua `onButtonClick` 흐름으로 연결된다.

```html
<button risu-btn="accept_quest">Accept quest</button>
```

실행 흐름:

```text
button click
  → runLuaButtonTrigger(currentChar, 'accept_quest')
  → Lua onButtonClick
  → triggerResult.chat 반영
```

### 10.3 module pattern

모듈로 배포할 때는 다음 구성이 적합하다.

```text
module lorebook
  - marker format instruction
  - scene-specific UI rules

module regex
  - editoutput capture/cleanup
  - editdisplay render

module trigger
  - manual button action
  - output/display/request behavior

module assets
  - icons, inlay images, background CSS
```

### 10.4 plugin pattern

플러그인은 character/module보다 전역적인 처리가 필요할 때 적합하다.

신규 플러그인은 `plugins.md` 기준 API `3.0` 형식을 사용한다.

```js
//@name ui_status_plugin
//@display-name UI Status Plugin
//@api 3.0
```

API v3 호출은 iframe sandbox와 `postMessage` 통신을 거치므로 비동기 호출로 취급한다.

| API | 사용 목적 |
|---|---|
| `addRisuScriptHandler('output')` | streaming 응답 포함 output text 처리 |
| `addRisuScriptHandler('display')` | 표시 전 HTML/Markdown 변환 |
| `addRisuScriptHandler('process')` | 다음 prompt에 들어갈 chat text 조정 |
| `addRisuReplacer('beforeRequest')` | 최종 `OpenAIChat[]` 수정 |
| `addProvider` | custom provider 추가 |

주의: `addRisuReplacer('afterRequest')`는 non-streaming success 응답에만 적용된다. streaming 응답 후처리는 `editoutput` 계열을 사용한다.

추가 주의:

- `addRisuReplacer`와 body interceptor 계열은 사용자 권한 확인을 요구할 수 있다.
- 공개 API mode 이름은 `display/output/input/process`이고, 내부 script mode 이름은 `editdisplay/editoutput/editinput/editprocess`이다.
- plugin UI는 iframe container, `registerSetting`, `registerButton`을 우선 사용한다. main DOM 직접 접근은 safe wrapper와 권한 제한을 받는다.

---

## 11. 실패 모드와 방지 규칙

### 11.1 invalid JSON

```text
Safe behavior:
  - closing tag가 없으면 parse하지 않는다.
  - JSON parse 실패 시 raw text를 보존하거나 debug marker를 남긴다.
  - silent data loss를 만들지 않는다.
```

### 11.2 marker leakage

raw marker가 사용자 화면에 노출되는 것을 막는 방법은 세 가지다.

| 방법 | 효과 |
|---|---|
| `editoutput`에서 제거 | 저장본과 화면에서 모두 제거 |
| `editdisplay`에서 숨김 | 저장본은 유지, 화면에서 제거 |
| `editprocess`에서 제거 | 저장본/화면 정책과 별개로 다음 prompt 유입만 차단 |

### 11.3 context pollution

verbose JSON이 매 turn마다 prompt에 들어가면 context가 빠르게 증가한다.

권장 정책:

```text
Stored text:
  dialogue + compact marker or no marker

Display text:
  dialogue + rendered status/buttons

Prompt text:
  dialogue + compact state summary
```

### 11.4 duplicate processing

streaming 중 `editoutput`은 반복 호출된다.

방지 조건:

- complete marker만 처리한다.
- marker hash를 저장한다.
- 같은 `chatID + markerHash`는 한 번만 side effect를 실행한다.
- button id는 payload에서 가져온 stable id를 사용한다.

### 11.5 trigger loop

output trigger가 `sendAIprompt`를 사용하면 `sendChat()` 재귀 호출이 발생할 수 있다.

방지 조건:

- trigger count 제한
- chat variable 기반 loop guard
- 마지막 처리 marker id 저장
- 같은 marker에 대해 재전송 금지

---

## 12. 디버깅 체크리스트

1. `sendChat(..., { preview: true })` 또는 DevTool preview로 final `OpenAIChat[]`에 marker instruction이 있는지 확인한다.
2. 모델 응답 원문에 `<risu_status>` block이 있는지 확인한다.
3. streaming 응답인지 non-streaming 응답인지 확인한다.
4. `editoutput` regex/Lua가 complete block에서만 동작하는지 확인한다.
5. `Message.data`에 marker를 남길지 제거할지 확인한다.
6. `editdisplay` 변환 후 HTML에 `risu-trigger` 또는 `risu-btn`이 남아 있는지 확인한다.
7. `parser.svelte.ts` sanitize 이후 버튼 속성이 유지되는지 확인한다.
8. `Chat.svelte`의 click handler가 manual trigger 또는 Lua button trigger를 실행하는지 확인한다.
9. 다음 prompt에 raw marker가 다시 들어가는지 `editprocess`로 확인한다.
10. output trigger나 button trigger가 무한 loop를 만들지 않는지 확인한다.

---

## 13. 빠른 선택 가이드

```text
Q. LLM에게 UI 상태를 출력하게 하고 싶다
  → systemPrompt / postEverything / lorebook에 structured marker instruction 추가

Q. raw JSON을 저장 전에 제거하고 싶다
  → editoutput regex/Lua/plugin handler

Q. 저장본에는 marker를 남기고 화면에서만 UI로 바꾸고 싶다
  → editdisplay regex/Lua/display trigger

Q. marker가 다음 prompt에 들어가지 않게 하고 싶다
  → editprocess regex/plugin handler

Q. 버튼 click으로 trigger를 실행하고 싶다
  → {{button::Label::TriggerName}} 또는 <button risu-trigger="TriggerName">

Q. 버튼 click으로 Lua 코드를 실행하고 싶다
  → <button risu-btn="button_event">

Q. JSON parse와 deduplication이 필요하다
  → Lua editOutput/editDisplay 또는 plugin script handler

Q. 최종 OpenAIChat[]에 UI state summary를 넣고 싶다
  → editRequest Lua trigger, request trigger, beforeRequest replacer

Q. 이미지/inlay를 출력과 연결하고 싶다
  → <ImgGen="...">, {{inlay::id}}, runInlayScreen(), parseInlayAssets()
```

---

## 14. LLM-friendly 요약 JSON

```json
{
  "document_goal": "Explain how PocketRisu/RisuAI can request structured output from the LLM, capture it with regex/Lua/hooks, and render status/buttons/UI inside chat.",
  "primary_pipeline": [
    "prompt composition adds structured output instruction",
    "LLM emits tagged JSON marker",
    "editoutput captures or cleans marker before storage",
    "editdisplay renders marker as status/buttons/icons for chat UI",
    "Chat.svelte handles risu-trigger and risu-btn clicks",
    "manual trigger or Lua onButtonClick updates chat state",
    "editprocess or request trigger controls whether UI state re-enters future prompts"
  ],
  "recommended_marker": "<risu_status>{json}</risu_status>",
  "recommended_payload": {
    "version": 1,
    "status": {
      "type": "choice|combat|warning|error|custom",
      "label": "short display text"
    },
    "buttons": [
      {
        "id": "stable id",
        "label": "button text",
        "trigger": "manual trigger name"
      }
    ]
  },
  "capture_hooks": {
    "editoutput": "capture model output before storage/display; streaming-safe and idempotent required",
    "editdisplay": "render display-only status/buttons while preserving stored text policy",
    "editprocess": "strip or summarize UI markers before chat history enters the next prompt",
    "editRequest": "modify final OpenAIChat[] before request dispatch",
    "request_trigger": "modify JSON-serialized final prompt array before provider adapter",
    "manual_trigger": "handle button actions from risu-trigger",
    "lua_button": "handle button actions from risu-btn"
  },
  "important_files": {
    "sendChat": "src/ts/process/index.svelte.ts",
    "script_pipeline": "src/ts/process/scripts.ts",
    "lua_hooks": "src/ts/process/scriptings.ts",
    "parser": "src/ts/parser/parser.svelte.ts",
    "chat_clicks": "src/lib/ChatScreens/Chat.svelte",
    "chat_body_render": "src/lib/ChatScreens/ChatBody.svelte",
    "button_helper": "src/ts/cbs.ts",
    "inlay_screen": "src/ts/process/inlayScreen.ts"
  },
  "streaming_warning": "editoutput runs on every streaming chunk. Capture logic must only process complete markers and must deduplicate side effects.",
  "storage_policy_choices": [
    "strip marker in editoutput",
    "preserve marker in Message.data and hide/render in editdisplay",
    "strip or summarize marker in editprocess before future prompts"
  ]
}
```

---

## 15. 참고 자료

| 자료 | 용도 |
|---|---|
| `docs/risuai-pipeline.md` | 전체 chat LLM pipeline 기준 문서 |
| `docs/risuai-pipeline-ux.md` | 사용자 체감 중요 섹션 index |
| `plugins.md` | upstream RisuAI plugin API 설명 |
| `src/ts/plugins/apiV3/risuai.d.ts` | plugin API type contract |
| `src/ts/process/scripts.ts` | regex/script hook 실행 순서 |
| `src/ts/process/scriptings.ts` | Lua edit/button hook bridge |
| `src/lib/ChatScreens/Chat.svelte` | `risu-trigger`, `risu-btn` click 처리 |
| `src/ts/parser/parser.svelte.ts` | display HTML sanitize와 inlay placeholder 처리 |
| `src/ts/process/templates/jsonSchema.ts` | structured JSON schema helper와 JSON 추출 helper |
| `lb_sample/🔦라이트보드 - 3.4.0/` | structured output → Lua/regex → chat UI 실전 예시 |
| `lb_sample/🔦라이트보드 🌠 삽화 3.4.1/` | inlay/illustration UI 실전 예시 |
