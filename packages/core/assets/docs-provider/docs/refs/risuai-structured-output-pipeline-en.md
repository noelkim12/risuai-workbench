# RisuAI structured output-based chat UI pipeline

This document explains the pipeline in PocketRisu/RisuAI for **having the LLM emit structured output, capturing that result with regex, Lua, and triggers, then displaying it as status/buttons/UI inside chat**, based on the important sections listed in `docs/risuai-pipeline-ux.md`.

Target readers:

- Character card authors
- Module authors
- Regex script authors
- Lua trigger authors
- Plugin authors
- LLM agents that modify or analyze the RisuAI/PocketRisu pipeline

The main goal is to design the following flow reliably.

```text
Prompt composition phase
  → Request status/button/state marker output from the LLM
  → LLM response includes structured markers
  → editoutput / editdisplay / Lua / regex / triggers capture markers
  → Hide or transform raw markers
  → Display status, buttons, inlays, icons, and hints in the chat body
  → Reflect them in chat state or the next prompt when needed
```

> Reference documents: `docs/risuai-pipeline.md`, `docs/risuai-pipeline-ux.md`  
> Key code paths: `src/ts/process/index.svelte.ts`, `src/ts/process/scripts.ts`, `src/ts/parser/parser.svelte.ts`, `src/lib/ChatScreens/Chat.svelte`, `src/lib/ChatScreens/ChatBody.svelte`

---

## 0. One-line summary

```text
Prompt instruction
  → model emits <risu_status>{json}</risu_status>
  → editoutput captures or cleans saved assistant text
  → editdisplay renders display-only UI
  → Chat.svelte handles risu-trigger / risu-btn clicks
  → triggers, Lua, plugin handlers update chat state or send follow-up actions
```

---

## 1. Key file map

| Area | File | Key functions/values | Role |
|---|---|---|---|
| Chat generation orchestrator | `src/ts/process/index.svelte.ts` | `sendChat`, `processScriptFull(..., 'editoutput')`, `runTrigger('output')`, `runInlayScreen` | Receives LLM responses and runs output hooks and triggers before/after saving |
| Regex/script processing | `src/ts/process/scripts.ts` | `processScriptFull`, `processScript`, `ScriptMode` | Processes `editinput`, `editprocess`, `editoutput`, and `editdisplay` |
| Lua hook bridge | `src/ts/process/scriptings.ts` | `runLuaEditTrigger`, `runLuaButtonTrigger` | Runs Lua `editInput`, `editOutput`, `editDisplay`, and `onButtonClick` |
| Trigger processing | `src/ts/process/triggers.ts` | `runTrigger` | Runs `input/start/request/output/display/manual` triggers |
| Inlay conversion | `src/ts/process/inlayScreen.ts` | `runInlayScreen`, `updateInlayScreen` | Converts structured output such as `<Emotion="...">` and `<ImgGen="...">` into inlay/display markers |
| Markdown/HTML parser | `src/ts/parser/parser.svelte.ts` | `ParseMarkdown`, `trimMarkdown`, `parseInlayAssets`, `resolveInlayPlaceholders` | Renders chat text as HTML and preserves `risu-trigger`, `risu-btn`, and inlay attributes |
| Button helper | `src/ts/cbs.ts` | `{{button::label::trigger}}` | Creates clickable `<button risu-trigger="...">` elements |
| Direct HTML buttons | Lua/regex `editdisplay` output | `<button risu-trigger="...">` | HTML buttons created without the CBS helper are also connected to the `Chat.svelte` click handler after parser sanitization |
| Chat message UI | `src/lib/ChatScreens/Chat.svelte` | `handleButtonTriggerWithin` | Connects `[risu-trigger]` and `[risu-btn]` clicks to manual triggers or Lua button triggers |
| Chat body rendering | `src/lib/ChatScreens/ChatBody.svelte` | `markParsing`, `stageAndCommit` | Renders the result of `ParseMarkdown()` as staged HTML and resolves inlay placeholders |
| Regex UI | `src/lib/SideBars/Scripts/RegexData.svelte` | regex type selector | UI for authoring `editoutput`, `editdisplay`, `editprocess`, and `editinput` scripts |
| Plugin registry | `src/ts/plugins/plugins.svelte.ts` | `pluginV2.edit*`, `pluginV2.replacerbeforeRequest` | Stores plugin script handlers and request replacers |

Practical examples are available in the Lua/regex files under `lb_sample/🔦라이트보드 - 3.4.0/` and `lb_sample/🔦라이트보드 🌠 삽화 3.4.1/`.

---

## 2. Data surfaces: stored text, LLM prompt, display HTML

When designing structured output UI, distinguish the three surfaces the same assistant response passes through.

```text
Stored chat message
  Message.data

LLM prompt message
  OpenAIChat.content

Rendered chat display
  HTML after ParseMarkdown()
```

### 2.1 `Message.data`

`Message.data` is the string actually stored in the chat history.

```ts
DBState.db.characters[selectedChar].chats[selectedChat].message[index].data
```

If a structured marker is removed in `editoutput`, it is not left in the stored copy either. Conversely, if it is hidden only in `editdisplay`, the marker remains in the stored copy.

### 2.2 `OpenAIChat.content`

On the next LLM request, the previous `Message.data` passes through `editprocess` and becomes `OpenAIChat.content`.

```text
Message.data
  → risuChatParser(...)
  → processScriptFull(..., 'editprocess')
  → OpenAIChat.content
```

Therefore, whether to inject previous UI markers back into the next prompt is best controlled in `editprocess`.

### 2.3 Display HTML

When displaying the chat screen, `ParseMarkdown()` runs `editdisplay` and sanitizes the HTML.

```text
Message.data
  → processScriptFull(..., 'editdisplay')
  → parseInlayAssets()
  → renderHighlightableMarkdown()
  → DOMPurify sanitize
  → ChatBody.svelte display
```

The sanitize configuration in `parser.svelte.ts` preserves the following UI-related attributes.

```text
risu-trigger
risu-btn
risu-mark
risu-id
data-inlay-id
data-inlay-type
risu-ctrl
```

Because of this preservation rule, buttons and inlay placeholders created by regex, Lua, or CBS can work as UI inside chat.

---

## 3. Requesting structured output during prompt composition

Section 5 of `docs/risuai-pipeline.md` is the reference for deciding where to place structured output requests.

### 3.1 Durable instruction locations

Structured output instructions that must always be maintained fit in the following locations.

| Location | Use condition |
|---|---|
| `currentChar.systemPrompt` | When the character must always follow the same marker rules |
| `currentChar.desc/personality/scenario` | When character settings and UI state output rules are combined |
| `postEverything` in the prompt template | When you want to force the marker format at the end of every response |
| lorebook | When markers are needed only for specific scenes, battles, quests, or system keywords |
| `additonalSysPrompt.promptend` | When a trigger conditionally adds structured output rules |
| module lorebook/prompt | When distributing UI marker rules at the module level |

### 3.2 Recommended marker format

Use an explicit tag and a JSON payload.

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

Recommended rules:

- Use a marker tag name that is unlikely to appear in ordinary conversation.
- Use only one root object for JSON.
- Use stable strings for button `id` values.
- Instruct the model not to output the same marker multiple times in one response.
- Instruct the model to omit the marker when no UI state is needed.
- Do not put character dialogue inside JSON.

### 3.3 Prompt instruction example

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

### 3.4 JSON schema helper notes

The codebase has helpers for structured JSON schema conversion.

| File | Function | Purpose |
|---|---|---|
| `src/ts/process/templates/jsonSchema.ts` | `convertInterfaceToSchema` | Converts a TypeScript interface or JSON schema string into a schema object |
| `src/ts/process/templates/jsonSchema.ts` | `getOpenAIJSONSchema` | Creates an OpenAI-family structured output schema wrapper |
| `src/ts/process/templates/jsonSchema.ts` | `getGeneralJSONSchema` | Creates schema instructions for general providers |
| `src/ts/process/templates/jsonSchema.ts` | `extractJSON` | Extracts JSON from a response string |

Note: These helpers are for core prompt/template processing, and they are not described as directly callable APIs in the public plugin API documentation. Character/module/plugin authors should treat prompt instructions, regex/Lua capture, and trigger/plugin hooks as the basic entry points.

---

## 4. Output capture points

There are four main points for structured output capture.

### 4.1 `editoutput`: response capture before storage

`sendChat()` runs `editoutput` before writing streaming/non-streaming responses to `Message.data`.

```text
LLM response
  → processScriptFull(..., 'editoutput', msgIndex)
  → Save Message.data
```

Purposes:

- Remove raw markers before storage
- Capture marker payloads with Lua/regex/plugins
- Normalize assistant responses
- Convert to emotion markers or inlay markers

Notes:

- During streaming, it runs repeatedly for each chunk.
- Partial markers without a closing tag must not be parsed.
- It must be idempotent so that the same marker is not processed multiple times.

### 4.2 `editdisplay`: UI rendering before display

`ParseMarkdown()` runs `editdisplay` immediately before screen display.

```text
Message.data
  → processScriptFull(..., 'editdisplay')
  → rendered HTML
```

Purposes:

- Hide stored markers on screen
- Replace markers with status HTML or button HTML
- Preserve the stored copy while changing only the display
- Create UI decorations such as icons, hints, and platform areas

The `Display_platform_area.risuregex`, `Display_interaction_hints.risuregex`, and `Display_*_icon.risuregex` families in `lb_sample` are examples of display regex scripts that create chat-internal UI.

### 4.3 `editprocess`: controlling entry into the next prompt

If structured markers remaining in a previous assistant message enter the next LLM prompt as-is, the context can be polluted.

```text
Message.data with marker
  → processScriptFull(..., 'editprocess')
  → marker removal or summary
  → OpenAIChat.content
```

Purposes:

- Remove verbose JSON markers
- Replace UI state with a short natural-language summary
- Remove button markup that the next LLM does not need to see
- Prevent `risu-trigger` HTML from being reinjected into the prompt

### 4.4 `editRequest` Lua trigger / request trigger

Use hooks immediately before request dispatch when the final `OpenAIChat[]` array must be modified.

```text
formated: OpenAIChat[]
  → runLuaEditTrigger(currentChar, 'editRequest', formated)
  → pluginV2.replacerbeforeRequest
  → runTrigger('request', { displayData: JSON.stringify(formated) })
  → provider adapter
```

Purposes:

- Insert the current UI state summary as the last system prompt
- Force marker output instructions immediately before the request
- Adjust structured output instructions for a specific model/provider

---

## 5. Regex script strategy

### 5.1 Basic capture regex

Use a regex that captures only complete blocks.

```regex
<risu_status>\s*([\s\S]*?)\s*<\/risu_status>
```

This regex does not touch streaming partial blocks. It matches only after `</risu_status>` arrives.

### 5.2 Converting to display HTML

In `editdisplay`, markers can be replaced with button HTML.

Simple buttons can use the CBS helper.

```text
{{button::Continue::continue_trigger}}
```

The CBS helper creates the following HTML.

```html
<button class="button-default" risu-trigger="continue_trigger">Continue</button>
```

When Lua or regex creates HTML directly, use `risu-trigger` so that `Chat.svelte` connects clicks to manual triggers.

```html
<button class="button-default" risu-trigger="leave_now" risu-id="leave_now">
  Leave now
</button>
```

The processing flow for direct HTML buttons is as follows.

```text
editdisplay regex/Lua output
  → HTML with risu-trigger
  → ParseMarkdown() sanitize preserves risu-trigger
  → ChatBody.svelte renders staged HTML
  → Chat.svelte handleButtonTriggerWithin()
  → runTrigger(currentChar, 'manual', { manualName, triggerId })
```

### 5.3 Regex capture → chat variable storage

After capturing part of a message with regex, the captured value can be stored as a chat variable and used by later triggers, Lua, or prompt summaries.

```text
LLM response
  → editoutput regex captures marker or field
  → trigger/Lua/plugin stores captured value in chat variable
  → editdisplay renders UI from chat variable or compact marker
  → editprocess/request hook inserts a short summary when the next prompt needs it
```

Purposes:

- Preserve button choices, status labels, or scene flags as chat variables
- Keep state available for triggers even after raw JSON markers are removed
- Inject only a short state summary into the next prompt instead of the full JSON

Notes:

- Store captured values only from complete markers.
- Run chat variable updates only once for the same `chatID + markerHash`.
- Separate user-facing display HTML from state summaries that enter the prompt.

### 5.4 Using regex actions

Regex scripts in `processScriptFull()` support the following special actions.

| action | Purpose |
|---|---|
| `@@emo <name>` | Change emotion |
| `@@inject` | Inject into the original message and remove from the current data |
| `@@move_top` | Move the match result to the front of the message |
| `@@move_bottom` | Move the match result to the end of the message |
| `@@repeat_back` | Reuse the match result from the previous message with the same role |
| `<order N>` | Adjust regex application order |
| `<cbs>` | Use CBS/parser conditions in regex input |

### 5.5 Streaming-safe regex rules

```text
Permitted actions:
  - parse only when complete opening/closing tags exist
  - create deterministic replacement results
  - use the same button id for the same payload
  - deduplicate side effects on the Lua/trigger side

Prohibited actions:
  - partial JSON parse
  - create a random id on every chunk
  - remove a marker when there is no closing tag
  - repeatedly perform expensive work such as external API calls in editoutput regex
```

---

## 6. Lua hook strategy

Use Lua hooks when JSON parsing, validation, and deduplication are difficult to handle with regex alone.

### 6.1 When Lua is suitable

```text
Application scope:
  - JSON payload parse
  - button array validation
  - message index-based deduplication
  - chat variable storage
  - trigger chain execution
  - marker payload hash comparison

Out-of-scope behavior:
  - cases that only need simple string replacement
  - cases that only need HTML decoration
```

### 6.2 Lua edit hook position

`processScriptFull()` runs Lua edit triggers before regex/plugin processing.

```text
processScriptFull(char, data, mode, chatID)
  1. runLuaEditTrigger(char, mode, data, { index: chatID })
  2. display trigger if mode === 'editdisplay'
  3. pluginV2[mode]
  4. risuChatParser
  5. regex scripts
```

The main mode mapping for `runLuaEditTrigger()` is as follows.

| ScriptMode | Lua side |
|---|---|
| `editinput` | `editInput` |
| `editoutput` | `editOutput` |
| `editdisplay` | `editDisplay` |

Button clicks enter the `onButtonClick` flow through `runLuaButtonTrigger()`.

### 6.3 Lua capture responsibilities

Lua output hook responsibilities can be divided as follows.

```text
input: assistant response text
detect: <risu_status>...</risu_status>
parse: JSON payload
validate: version/status/buttons fields
dedupe: message index + payload hash
store: chat variable, module state, or compact marker
return: cleaned or transformed assistant response
```

### 6.4 Idempotency checklist

Lua hooks must prevent duplicate execution based on the following values.

- `chatID` or message index
- marker payload hash
- button `id`
- last processed marker version
- existence of a closing tag that can identify stream completion

---

## 7. Status/button rendering model

### 7.1 Separate data extraction, state storage, and rendering

Dividing status/button UI into three layers reduces collisions.

```text
Data extraction layer
  editoutput / Lua / regex / plugin captures marker

State layer
  chat var, module state, compact marker, or saved Message.data

Render layer
  editdisplay regex/Lua, CBS button helper, inlay, Chat.svelte click handler
```

### 7.2 Button contract

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

Example rendering result:

```html
<div class="risu-status-panel" risu-mark="status">
  <div class="risu-status-label">Choose how to proceed</div>
  <button class="button-default" risu-trigger="leave_now" risu-id="leave_now">Leave now</button>
  <button class="button-default" risu-trigger="wait_until_dawn" risu-id="wait_until_dawn">Wait until dawn</button>
</div>
```

`Chat.svelte` handles these button clicks as follows.

```text
[risu-trigger]
  → runTrigger(currentChar, 'manual', { manualName, triggerId })

[risu-btn]
  → runLuaButtonTrigger(currentChar, btnEvent)
```

### 7.3 Status contract

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

## 8. State lifetime policy

### 8.1 Display-only state

```text
Application scope:
  - UI that may disappear after refresh
  - hints/icons that must not affect the next prompt
  - elements that only decorate the screen without changing the stored copy

Recommended hook:
  - editdisplay
```

### 8.2 Stored state

```text
Application scope:
  - status/buttons that must remain after refresh
  - state that must be preserved during export/replay
  - state that the next prompt or trigger must reference

Recommended hook:
  - editoutput capture
  - Lua/chat variable storage
  - chat variable storage through trigger/Lua/plugin after regex capture
  - compact marker preservation
```

Storing regex capture values as chat variables is suitable when state must be preserved while raw markers are removed from the stored copy. In this case, `editoutput` handles capture/cleanup, trigger/Lua/plugin records the captured value in a chat variable, and `editprocess` or request hooks convert the chat variable into a short prompt-visible summary when needed.

### 8.3 Prompt-visible state summary

Instead of putting raw JSON directly into the next prompt, a short summary can be inserted.

```text
[UI state: Mira offered a secret meeting. Available actions: go_station, ask_more.]
```

This conversion can be handled in `editprocess`, request triggers, or `editRequest` Lua triggers.

---

## 9. End-to-end example

### 9.1 Prompt instruction

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

### 9.2 Model output

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

### 9.3 Capture result

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

### 9.4 Rendered chat

```text
Arlen: "Then we move before sunrise," Arlen says, tightening the strap on his pack.

Status: Choose how to proceed

[Leave now] [Wait until dawn]
```

---

## 10. Trigger / plugin / module connections

### 10.1 Manual trigger button

If a button inside chat has `risu-trigger`, a manual trigger runs when clicked.

```html
<button risu-trigger="accept_quest" risu-id="accept_quest">Accept quest</button>
```

Execution flow:

```text
button click
  → Chat.svelte handleButtonTriggerWithin()
  → runTrigger(currentChar, 'manual', { manualName: 'accept_quest', triggerId: 'accept_quest' })
  → Apply triggerResult.chat
  → Update ReloadChatPointer
```

### 10.2 Lua button

`risu-btn` connects to the Lua `onButtonClick` flow.

```html
<button risu-btn="accept_quest">Accept quest</button>
```

Execution flow:

```text
button click
  → runLuaButtonTrigger(currentChar, 'accept_quest')
  → Lua onButtonClick
  → Apply triggerResult.chat
```

### 10.3 Module pattern

The following composition is suitable when distributing as a module.

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

### 10.4 Plugin pattern

Plugins are suitable when more global processing than character/module processing is needed.

New plugins use the API `3.0` format according to `plugins.md`.

```js
//@name ui_status_plugin
//@display-name UI Status Plugin
//@api 3.0
```

API v3 calls go through iframe sandbox and `postMessage` communication, so treat them as asynchronous calls.

| API | Purpose |
|---|---|
| `addRisuScriptHandler('output')` | Processes output text, including streaming responses |
| `addRisuScriptHandler('display')` | Transforms HTML/Markdown before display |
| `addRisuScriptHandler('process')` | Adjusts chat text entering the next prompt |
| `addRisuReplacer('beforeRequest')` | Modifies the final `OpenAIChat[]` |
| `addProvider` | Adds a custom provider |

Note: `addRisuReplacer('afterRequest')` applies only to non-streaming successful responses. Use the `editoutput` family for streaming response post-processing.

Additional notes:

- `addRisuReplacer` and body interceptor families may require user permission confirmation.
- Public API mode names are `display/output/input/process`, while internal script mode names are `editdisplay/editoutput/editinput/editprocess`.
- Plugin UI should primarily use the iframe container, `registerSetting`, and `registerButton`. Direct access to the main DOM is subject to safe wrappers and permission restrictions.

---

## 11. Failure modes and prevention rules

### 11.1 Invalid JSON

```text
Safe behavior:
  - do not parse when there is no closing tag
  - preserve raw text or leave a debug marker when JSON parsing fails
  - do not create silent data loss
```

### 11.2 Marker leakage

There are three ways to prevent raw markers from being exposed on the user screen.

| Method | Effect |
|---|---|
| Remove in `editoutput` | Removes from both the stored copy and the screen |
| Hide in `editdisplay` | Preserves the stored copy and removes from the screen |
| Remove in `editprocess` | Blocks only entry into the next prompt, separate from stored/display policies |

### 11.3 Context pollution

If verbose JSON enters the prompt every turn, context grows quickly.

Recommended policy:

```text
Stored text:
  dialogue + compact marker or no marker

Display text:
  dialogue + rendered status/buttons

Prompt text:
  dialogue + compact state summary
```

### 11.4 Duplicate processing

During streaming, `editoutput` is called repeatedly.

Prevention conditions:

- Process only complete markers.
- Store marker hashes.
- Run side effects only once for the same `chatID + markerHash`.
- Use stable button ids from the payload.

### 11.5 Trigger loop

If an output trigger uses `sendAIprompt`, recursive `sendChat()` calls can occur.

Prevention conditions:

- Trigger count limit
- Chat variable-based loop guard
- Store the last processed marker id
- Do not resend for the same marker

---

## 12. Debugging checklist

1. Check whether the final `OpenAIChat[]` contains marker instructions with `sendChat(..., { preview: true })` or DevTool preview.
2. Check whether the raw model response contains a `<risu_status>` block.
3. Check whether the response is streaming or non-streaming.
4. Check whether `editoutput` regex/Lua runs only on complete blocks.
5. Decide whether to keep or remove markers in `Message.data`.
6. Check whether `risu-trigger` or `risu-btn` remains in the HTML after `editdisplay` conversion.
7. Check whether button attributes are preserved after sanitize in `parser.svelte.ts`.
8. Check whether the click handler in `Chat.svelte` runs the manual trigger or Lua button trigger.
9. Use `editprocess` to check whether raw markers enter the next prompt again.
10. Check whether output triggers or button triggers create an infinite loop.

---

## 13. Quick selection guide

```text
Q. I want the LLM to output UI state
  → add structured marker instructions to systemPrompt / postEverything / lorebook

Q. I want to remove raw JSON before storage
  → editoutput regex/Lua/plugin handler

Q. I want to keep the marker in the stored copy and only convert it to UI on screen
  → editdisplay regex/Lua/display trigger

Q. I want to prevent markers from entering the next prompt
  → editprocess regex/plugin handler

Q. I want to run a trigger from a button click
  → {{button::Label::TriggerName}} or <button risu-trigger="TriggerName">

Q. I want to run Lua code from a button click
  → <button risu-btn="button_event">

Q. I need JSON parsing and deduplication
  → Lua editOutput/editDisplay or plugin script handler

Q. I want to put UI state summary into the final OpenAIChat[]
  → editRequest Lua trigger, request trigger, beforeRequest replacer

Q. I want to connect images/inlays to output
  → <ImgGen="...">, {{inlay::id}}, runInlayScreen(), parseInlayAssets()
```

---

## 14. LLM-friendly summary JSON

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

## 15. References

| Resource | Purpose |
|---|---|
| `docs/risuai-pipeline.md` | Reference document for the full chat LLM pipeline |
| `docs/risuai-pipeline-ux.md` | Index of user-perceived important sections |
| `plugins.md` | Upstream RisuAI plugin API description |
| `src/ts/plugins/apiV3/risuai.d.ts` | Plugin API type contract |
| `src/ts/process/scripts.ts` | Regex/script hook execution order |
| `src/ts/process/scriptings.ts` | Lua edit/button hook bridge |
| `src/lib/ChatScreens/Chat.svelte` | `risu-trigger` and `risu-btn` click handling |
| `src/ts/parser/parser.svelte.ts` | Display HTML sanitize and inlay placeholder handling |
| `src/ts/process/templates/jsonSchema.ts` | Structured JSON schema helpers and JSON extraction helper |
| `lb_sample/🔦라이트보드 - 3.4.0/` | Practical example of structured output → Lua/regex → chat UI |
| `lb_sample/🔦라이트보드 🌠 삽화 3.4.1/` | Practical example of inlay/illustration UI |
