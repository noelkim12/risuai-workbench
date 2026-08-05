# RisuAI Lua Scripting — LLM Reference

RisuAI lets character cards and modules execute Lua scripts at well-defined lifecycle points (user input, LLM output, chat start, button click, message-edit hooks). Scripts run in Wasmoon (Lua 5.4 compiled to WebAssembly, sandboxed in the browser tab) and call back into RisuAI through a fixed set of host-injected functions.

This reference is the canonical surface area for an LLM authoring RisuAI Lua. Every function listed below is verified against `src/ts/process/scriptings.ts`. The function set is closed — RisuAI does not load arbitrary Lua libraries beyond `json` and standard Lua. Don't invent host functions.

> **Acknowledgements**
>
> This reference is based on documentation originally authored by
> [nevaeh5379](https://github.com/nevaeh5379).
>
> Original source: [Lua LLM Reference](https://github.com/nevaeh5379/nevaeh5379.github.io/blob/main/skills/LUA_LLM_REFERENCE.md)
>
> Adapted and redistributed for RisuAI Workbench. The original repository is licensed under the [WTFPL](https://github.com/nevaeh5379/nevaeh5379.github.io/blob/main/license).

---

## 1. How scripts run

### 1.1 Entry point

A Lua "trigger script" is attached to a character (`character.triggerscript[]`) or module. RisuAI's runtime calls into your script by invoking a top-level function whose name matches the lifecycle event:

| Mode (event)    | Function RisuAI calls                       | Args                                  |
|-----------------|---------------------------------------------|---------------------------------------|
| `input`         | `onInput(id)`                               | `id` = access key                     |
| `output`        | `onOutput(id)`                              | `id`                                  |
| `start`         | `onStart(id)`                               | `id`                                  |
| `onButtonClick` | `onButtonClick(id, data)`                   | `id`, `data` (button payload string)  |
| `editInput`     | dispatch via `callListenMain` → `listenEdit('editInput', cb)` callbacks | each cb gets `(id, value, meta)` |
| `editOutput`    | dispatch via `listenEdit('editOutput', cb)`  | `(id, value, meta)`                   |
| `editDisplay`   | dispatch via `listenEdit('editDisplay', cb)` | `(id, value, meta)`                   |
| `editRequest`   | dispatch via `listenEdit('editRequest', cb)` | `(id, value, meta)`                   |
| custom name     | `<mode_name>(id)`                           | `id` — any global function with the mode's name |

The `id` parameter is the access key (a UUID) that you must thread through every host call. The host ignores most calls if you pass anything else.

### 1.2 Engine lifecycle

- One persistent Lua engine per mode string, kept across calls.
- The engine is rebuilt from scratch when the script's source code changes.
- Calls are serialized per mode (mutex). No two invocations of the same mode run concurrently.
- The runtime auto-`require`s `json` (a Lua JSON library) before your code; it's available globally.
- The runtime injects a wrapper layer (Lua helpers like `getChat`, `LLM`, `setState`, `listenEdit`, `async`, `callListenMain`) above the raw host APIs, then appends your code at the bottom. This means your script can directly use those helpers without defining them.

### 1.3 Permissions (access tiers)

Every host function checks the `id` against an access-key set:

| Tier        | Granted to                    | What it unlocks |
|-------------|-------------------------------|-----------------|
| Open    | Always                        | Read-only access: `getChatMain`, `getChatLength`, `getName`, `getPersonaName`, `getPersonaDescription`, `getAuthorsNote`, `getCharacterFirstMessage`, `getChatVar`, `getGlobalVar`, `getCharacterImageMain`, `getPersonaImageMain`, `getCharacterLastMessage`, `getUserLastMessage`, `getFullChatMain`, `cbs`, `hash`, `logMain` |
| Safe    | Modes other than `editDisplay`, when `lowLevelAccess=false` | All Open + state writes: `setChat`, `setChatRole`, `setFullChatMain`, `addChat`, `insertChat`, `removeChat`, `cutChat`, `setChatVar`, `stopChat`, `setName`, `setDescription`, `setCharacterFirstMessage`, `setBackgroundEmbedding`, `getDescription`, `getBackgroundEmbedding`, `upsertLocalLoreBook`, `getLoreBooksMain`, `reloadDisplay`, `reloadChat`, `alertError`, `alertNormal`, `alertInput`, `alertSelect`, `alertConfirm`, `getTokens`, `sleep` |
| EditDisplay | Only `mode = 'editDisplay'`  | Limited write surface: `setChatVar`, alerts. Other state-write APIs return without effect. |
| LowLevel | Granted only when the trigger has `lowLevelAccess=true` | `LLMMain`, `axLLMMain`, `simpleLLM`, `request`, `similarity`, `generateImage`, `loadLoreBooksMain` |

Permission denial is silent. If you call `setChat` without Safe access, it returns `nil` — no error is thrown. Always test scripts in the actual mode they'll run in.

### 1.4 Async / Promise

Many host functions are async (return a JS Promise). Wasmoon exposes Promises with an `:await()` method. The wrapper layer already wraps the common ones (`LLM`, `axLLM`, `loadLoreBooks`, `getCharacterImage`, `getPersonaImage`) so you don't write `:await()` yourself for those. For other async-flagged functions in this doc (e.g., `getTokens`, `request`, `generateImage`, `simpleLLM`, `hash`, `similarity`, `sleep`, `alertInput`, `alertSelect`, `alertConfirm`), call `:await()` on the returned Promise:

```lua
local n = getTokens(id, "hello"):await()
local resp = request(id, "https://example.com"):await()
local body = json.decode(resp).data
```

If you need to write your own async function (e.g., to be passed as a `listenEdit` callback that itself awaits things), wrap it with the provided `async()` helper:

```lua
listenEdit('editOutput', async(function(id, value, meta)
    local toks = getTokens(id, value):await()
    return value .. "\n[tokens: " .. toks .. "]"
end))
```

### 1.5 Return-value contract

| Hook                                 | Return semantics |
|--------------------------------------|------------------|
| `onInput`, `onOutput`, `onStart`     | Return literal `false` to set `stopSending = true` (cancels the message). Any other return value is ignored — to modify the chat, mutate it via `setChat`/`addChat`/`setFullChat`. |
| `onButtonClick(id, data)`            | Return value is passed back to the caller as the `res` field of the trigger result. |
| `listenEdit` callbacks               | The chain is fold-left: each callback receives the previous one's return value as its `value`. Return the new value (string for text hooks, table for chat-array hooks). Callbacks for the same edit type fire in registration order. The final returned value replaces the original content. |
| Custom-mode functions (`<mode>(id)`) | Same as `onInput` — `false` stops, otherwise ignored. |

---

## 2. The `id` parameter

Every host function takes `id` (the access key) as its first argument. Always pass the `id` you received from the lifecycle hook. Helper functions in the wrapper layer follow the same pattern — `getChat(id, idx)`, `setState(id, name, value)`, etc.

If you create a callback for `listenEdit`, it receives an `id` you should also forward.

```lua
function onInput(id)
    local last = getChat(id, getChatLength(id) - 1)
    log(last)  -- log() is a wrapper; takes only one arg
    setChatVar(id, "last_input_role", last.role)
end
```

---

## 3. Type bridging (JS ↔ Lua)

- Strings, numbers, booleans, nil cross transparently both ways.
- Tables / arrays / objects: complex data is exchanged as JSON strings. The wrapper layer handles encode/decode for the common APIs (chat, LLM, lorebook, state). For raw `*Main` functions, you must `json.decode()` the result yourself.
- Promises: call `:await()` to resolve.
- Lua tables passed to host functions (e.g., `setFullChat`, `LLM`, `upsertLocalLoreBook`) are JSON-encoded by the wrapper; the host parses them back.

The injected `json` library:
```lua
json.encode(value)   -- table → string
json.decode(str)     -- string → table | nil
```

---

## 4. Quick start

### 4.1 Hello-world: log every user message

```lua
function onInput(id)
    local len = getChatLength(id)
    local last = getChat(id, len - 1)
    log("user said: " .. last.data)
end
```

### 4.2 Veto messages containing a banned word

```lua
function onInput(id)
    local len = getChatLength(id)
    local last = getChat(id, len - 1)
    if string.find(last.data, "bannedword", 1, true) then
        alertError(id, "That word is not allowed.")
        return false  -- cancels the message
    end
end
```

### 4.3 Modify the assistant's reply with `editOutput`

```lua
listenEdit('editOutput', function(id, value, meta)
    -- value is the assistant's text; meta is hook-specific extra data
    return value:gsub("certainly", "of course")
end)
```

### 4.4 Persist counters in chat state

```lua
function onInput(id)
    local n = getState(id, "turn") or 0
    setState(id, "turn", n + 1)
    log("turn " .. (n + 1))
end
```

### 4.5 Call the LLM from a script (requires lowLevelAccess)

```lua
function onInput(id)
    local res = LLM(id, {
        { role = "system", content = "Reply in haiku." },
        { role = "user",   content = getChat(id, getChatLength(id) - 1).data },
    })
    if res.success then
        addChat(id, "char", res.result)
    else
        alertError(id, res.result)
    end
end
```

### 4.6 Handle a button click from the UI

```lua
function onButtonClick(id, data)
    -- data is the trigger payload string from the button
    if data == "reset" then
        cutChat(id, 0, 0)
        reloadDisplay(id)
    end
    return "ok"
end
```

---

## 5. Lifecycle events — reference

### 5.1 `onInput(id)`
Fires after the user submits a message and before the LLM call. The new user message is already appended to the chat at this point. Return `false` to abort sending.

### 5.2 `onOutput(id)`
Fires after the LLM has produced a reply and before it is shown / streamed to the user (or post-finalization, depending on context). The new assistant message is already appended. Return `false` to abort the chat advancement.

### 5.3 `onStart(id)`
Fires when the chat session is initialized (e.g., a fresh chat opens). No message context yet beyond the greeting.

### 5.4 `onButtonClick(id, data)`
Fires when the user clicks a CBS-generated button: `{{button::Label::trigger_payload}}`. The `data` arg equals `trigger_payload`. The return value flows back to the caller and is exposed as `res` in the trigger result.

### 5.5 `listenEdit(type, callback)` — the four edit hooks

`listenEdit` registers a callback that participates in a transformation chain when one of these mode events fires:

| `type`         | When it runs                                     | `value` shape                                 |
|----------------|--------------------------------------------------|-----------------------------------------------|
| `editInput`    | Before user input is processed                   | the user message string                       |
| `editOutput`   | After LLM output, before display/storage         | the assistant message string                  |
| `editRequest`  | Before the request payload is sent to the model  | OpenAI-style chat array (table of `{role, content}`) |
| `editDisplay`  | When a message is rendered for display           | the message string being rendered             |

The callback signature is `function(id, value, meta) → modifiedValue`. Chain rule: callbacks are called in registration order, and each one's return value becomes the `value` for the next. The final returned value replaces the original content. Always return the value (modified or not) — returning `nil` will break the chain.

---

## 6. Host function reference (the closed surface)

Below is every function the host injects. `[low]` = LowLevel tier. `[safe]` = Safe tier. `[edit]` = available in EditDisplay tier too. Unmarked = Open tier.

The "User-facing" column shows the wrapper helper if one exists; prefer the helper. If the column says "(direct)", call the function as listed.

### 6.1 Chat read/write

| User-facing                                | Tier   | Returns                                 | Description |
|--------------------------------------------|--------|-----------------------------------------|-------------|
| `getChat(id, index)`                       | open   | `{role, data, time}` table              | Single message; supports negative `index` (Lua-style: 0 → first, -1 → last via `Array.at`). Returns `nil` table if out of range. |
| `getFullChat(id)`                          | open   | array of `{role, data, time}`           | All messages in current chat. |
| `getChatLength(id)`                        | open   | number                                  | Number of messages. |
| `setChat(id, index, value)`                | safe   | —                                       | Replace `data` of message at `index`. |
| `setChatRole(id, index, value)`            | safe   | —                                       | Set `role` to `"user"` or `"char"`. Anything else becomes `"char"`. |
| `setFullChat(id, value)`                   | safe   | —                                       | Replace whole message array. `value` is a Lua table of `{role, data}` entries. |
| `addChat(id, role, value)`                 | safe   | —                                       | Append a message. `role` is `"user"` or `"char"`. |
| `insertChat(id, index, role, value)`       | safe   | —                                       | Insert at `index`. |
| `removeChat(id, index)`                    | safe   | —                                       | Remove single message. |
| `cutChat(id, start, finish)`               | safe   | —                                       | Slice array to `[start, finish)`. |
| `getCharacterLastMessage(id)`              | open   | string                                  | The most recent message with role `"char"`; falls back to the character's `firstMessage`. |
| `getUserLastMessage(id)`                   | open   | string                                  | The most recent message with role `"user"`; `""` if none. |

### 6.2 Variables & state

There are three variable scopes:

| Wrapper                     | Tier        | Backing store         | Notes |
|-----------------------------|-------------|-----------------------|-------|
| `getChatVar(id, key)`       | open        | per-chat              | Reads raw string. |
| `setChatVar(id, key, val)`  | safe / edit | per-chat              | Writes raw string. |
| `getGlobalVar(id, key)`     | open        | global (cross-chat)   | Read-only here. |
| `getState(id, name)`        | open        | per-chat (JSON-encoded under key `__<name>`) | Reads any JSON-serializable value (table, number, string, boolean). Built on top of `getChatVar`. |
| `setState(id, name, value)` | safe / edit | per-chat              | Writes any JSON-serializable value. Built on top of `setChatVar`. Use this for tables / numbers; reserve `setChatVar` for raw strings. |

`setState`/`getState` use the namespace prefix `__` so they don't collide with raw `setChatVar` names.

### 6.3 Character / persona data

| Function                                       | Tier   | Returns | Description |
|------------------------------------------------|--------|---------|-------------|
| `getName(id)`                                  | open   | string  | Current character's `name`. |
| `setName(id, name)`                            | safe   | —       | Set `name`; throws if not a string. |
| `getDescription(id)`                           | safe   | string  | Character `desc`. Throws if group chat. |
| `setDescription(id, desc)`                     | safe   | —       | Set `desc`. Throws if group chat. |
| `getCharacterFirstMessage(id)`                 | open   | string  | Character's greeting. |
| `setCharacterFirstMessage(id, data)`           | safe   | bool    | Sets greeting; returns `false` if `data` is not a string. |
| `getPersonaName(id)`                           | open   | string  | User name from settings. |
| `getPersonaDescription(id)`                    | open   | string  | User persona prompt, CBS-parsed. |
| `getAuthorsNote(id)`                           | open   | string  | Per-chat author note. |
| `getBackgroundEmbedding(id)`                   | safe   | string  | Character's HTML background. |
| `setBackgroundEmbedding(id, data)`             | safe   | bool    | Set HTML background; returns `false` if not string. |

### 6.4 Lorebook

| Wrapper                                                       | Tier  | Returns                                | Description |
|---------------------------------------------------------------|-------|----------------------------------------|-------------|
| `getLoreBooks(id, search)`                                    | safe  | array of lore entries                  | Returns entries from local-chat lore + character globalLore + module lorebooks where `comment == search`. `content` is CBS-parsed. Returns `nil` if not a single-character chat. |
| `upsertLocalLoreBook(id, name, content, options)`             | safe  | —                                      | Insert-or-replace a chat-local lorebook entry whose `comment == name`. `options = { alwaysActive = false, insertOrder = 100, key = "", secondKey = "", regex = false }`. |
| `loadLoreBooks(id)` *(wrapper signature)*                     | low   | array of `{ data, role }`              | Loads currently-active lorebook entries (those triggered by current context), filtered to fit `maxContext - reserve` tokens. The raw API is `loadLoreBooksMain(id, reserve)` and returns a JSON Promise; the wrapper hard-codes `:await()` and `json.decode`. To pass a `reserve`, call the raw `loadLoreBooksMain(id, reserve):await()` and decode yourself. |

### 6.5 LLM calls (low-level only)

All three return `{ success = boolean, result = string }`.

#### `LLM(id, prompt, useMultimodal?, options?)` `[low]`
Calls the main model. `prompt` is an array of `{ role, content }` tables. `role` accepts `"system"`, `"sys"`, `"user"`, `"assistant"`, `"bot"`, `"char"` (the last three are normalized to OpenAI `assistant`).

If `useMultimodal` is `true`, any inlay markers (`{{inlay::id}}`, `{{inlayed::id}}`, `{{inlayeddata::id}}`) inside `content` are extracted and attached as multimodal image inputs to that message. For `assistant`-role messages, only `{{inlayeddata::id}}` is extracted (since assistants normally don't carry user-side images).

`options` is a table; the only recognized key is `streaming = true`. When set, the host issues a streaming request and the wrapper concatenates / collects the result before returning. Either way, you get a single string back when the call completes. (RisuAI's stream collector keeps the latest cumulative text chunk; non-cumulative APIs would return only the last delta — assume the result is the full text when the request succeeds.)

```lua
local res = LLM(id, {
    { role = "system", content = "You are a poet." },
    { role = "user",   content = "haiku about coffee" },
}, false, { streaming = true })
if res.success then addChat(id, "char", res.result) end
```

#### `axLLM(id, prompt, useMultimodal?, options?)` `[low]`
Identical to `LLM`, but routes to the auxiliary / submodel (`axmodel`). Use this for cheap helper calls (summarization, classification) so you don't burn your main model's context.

#### `simpleLLM(id, prompt)` `[low]`
Single-string single-turn call; equivalent to `LLM(id, {{role="user", content=prompt}})` without multimodal or streaming. Returns `{ success, result }`.

### 6.6 Image generation & retrieval

| Function                       | Tier  | Returns                                  | Description |
|--------------------------------|-------|------------------------------------------|-------------|
| `generateImage(id, prompt, neg?)` `[await]` | low   | `"{{inlay::<id>}}"` or `"Error: ..."`    | Generates an image via the configured StableDiffusion backend. Returns CBS markup that resolves to the image at display time. |
| `getCharacterImage(id)`         | open  | `"{{inlayed::<id>}}"` or `""`            | Loads the current character's portrait, registers it as an inlay, returns CBS markup. Wrapper auto-`:await()`s. |
| `getPersonaImage(id)`           | open  | `"{{inlayed::<id>}}"` or `""`            | Same for the user persona icon. Wrapper auto-`:await()`s. |

The returned strings can be embedded into a chat message (`addChat(id, "char", "Look: " .. img)`) or into an LLM prompt with `useMultimodal=true`.

### 6.7 Network & utilities

| Function                  | Tier  | Returns                              | Description |
|---------------------------|-------|--------------------------------------|-------------|
| `request(id, url)` `[await]` | low | JSON string `{status, data}`         | HTTP GET only. Restrictions: HTTPS only, URL ≤ 120 chars, max 5 requests per 60 seconds (returns `{status=429,...}` if exceeded), and the domains `risuai.net`, `realm.risuai.net`, `risuai.xyz` are blocked. Decode the result with `json.decode`. |
| `similarity(id, source, list)` `[await]` | low | similarity-search result | Embeds `list` (array of strings), then returns `HypaProcesser.similaritySearch(source)` over those embeddings. Useful for semantic match against a candidate set. |
| `hash(id, value)` `[await]`  | open | hex string                            | Hashes `value` and returns hex digest. |
| `getTokens(id, value)` `[await]` | safe | number                              | Tokenizes `value` with the active model's tokenizer; returns token count. |
| `cbs(value)`                 | open | string                                | Runs the input through RisuAI's CBS macro parser (see `CBS_LLM_REFERENCE.md`). Use to expand `{{user}}`, `{{char}}`, conditionals, etc., from inside Lua. |
| `sleep(id, ms)` `[await]`    | safe | true after delay                      | Awaitable delay. |

### 6.8 UI / alerts

| Function                          | Tier  | Returns / behavior                           |
|-----------------------------------|-------|----------------------------------------------|
| `alertError(id, msg)`             | safe  | Modal error alert.                           |
| `alertNormal(id, msg)`            | safe  | Modal info alert.                            |
| `alertInput(id, msg)` `[await]`   | safe  | Prompt the user for text; returns string or nil. |
| `alertSelect(id, options)` `[await]` | safe | Show selector; `options` is a Lua array of strings; returns chosen string or nil. |
| `alertConfirm(id, msg)` `[await]` | safe  | Yes/no dialog; returns `true`/`false`.       |
| `reloadDisplay(id)`               | safe  | Forces a full chat-display re-render.        |
| `reloadChat(id, index)`           | safe  | Re-renders only the message at `index`.       |
| `stopChat(id)`                    | safe  | Equivalent to returning `false` from the hook — cancels the in-progress LLM send. |

### 6.9 Logging

| Wrapper          | Description |
|------------------|-------------|
| `log(value)`     | `console.log` (visible in browser devtools) of any Lua value. The wrapper JSON-encodes for you. |

### 6.10 Raw `*Main` functions

The wrapper layer also exposes the raw host functions used internally (mostly for debugging / advanced use). Prefer the wrapper helpers; reach for the raw forms only when you need control over JSON encoding/decoding.

| Raw                                     | Wrapper                | Notes |
|-----------------------------------------|------------------------|-------|
| `getChatMain(id, index)`                | `getChat`              | Returns JSON string. |
| `getFullChatMain(id)`                   | `getFullChat`          | Returns JSON string. |
| `setFullChatMain(id, value)`            | `setFullChat`          | Takes JSON string. |
| `getLoreBooksMain(id, search)`          | `getLoreBooks`         | Returns JSON string. |
| `loadLoreBooksMain(id, reserve)`        | `loadLoreBooks`        | Returns Promise of JSON string. Use the raw form to pass a custom `reserve` token budget. |
| `LLMMain(id, json, mm, json)`           | `LLM`                  | Args/return are JSON strings. |
| `axLLMMain(id, json, mm, json)`         | `axLLM`                | Same. |
| `getCharacterImageMain(id)`             | `getCharacterImage`    | Returns Promise of string. |
| `getPersonaImageMain(id)`               | `getPersonaImage`      | Returns Promise of string. |
| `logMain(jsonString)`                   | `log`                  | Takes JSON string. |

### 6.11 Listener registration & async helper

| Function                                 | Description |
|------------------------------------------|-------------|
| `listenEdit(type, callback)`             | Register a callback for an edit hook (`editInput`, `editOutput`, `editDisplay`, `editRequest`). Throws `"Invalid type"` for any other type. |
| `async(callback)`                        | Wrap a Lua function so it can use `:await()` inside, returning a Promise. Required for callbacks that perform async host calls (e.g., `getTokens:await()` inside a `listenEdit` callback). |
| `callListenMain(type, id, value, meta)`  | Internal — do not call. RisuAI invokes this to dispatch the registered listeners. Listed here only so you don't accidentally redefine its name. |

---

## 7. Patterns & recipes

### 7.1 Inject a hidden system message before sending

```lua
listenEdit('editRequest', function(id, value, meta)
    -- value is the request array of {role, content}
    table.insert(value, 1, {
        role = "system",
        content = "Always respond in second person.",
    })
    return value
end)
```

### 7.2 Summarize old messages and replace them

```lua
function onInput(id)
    local len = getChatLength(id)
    if len < 30 then return end

    local history = getFullChat(id)
    -- summarize first 20 messages with the auxiliary model
    local prompt = { { role = "system", content = "Summarize this chat in 200 words." } }
    for i = 1, 20 do
        table.insert(prompt, { role = history[i].role == "user" and "user" or "assistant",
                               content = history[i].data })
    end
    local res = axLLM(id, prompt)
    if not res.success then return end

    -- replace first 20 with a single system summary
    local newChat = { { role = "char", data = "[summary] " .. res.result } }
    for i = 21, len do table.insert(newChat, history[i]) end
    setFullChat(id, newChat)
    reloadDisplay(id)
end
```

### 7.3 Fetch external JSON and inject as context

```lua
function onInput(id)
    local resp = request(id, "https://api.example.com/today.json"):await()
    local body = json.decode(resp).data
    local data = json.decode(body)
    setState(id, "today", data)
end

listenEdit('editRequest', function(id, value, meta)
    local today = getState(id, "today")
    if today then
        table.insert(value, 1, {
            role = "system",
            content = "Today's facts: " .. json.encode(today),
        })
    end
    return value
end)
```

### 7.4 Ask the user for confirmation before destructive actions

```lua
function onButtonClick(id, data)
    if data == "wipe" then
        local ok = alertConfirm(id, "Wipe the entire chat?"):await()
        if ok then
            cutChat(id, 0, 0)
            reloadDisplay(id)
        end
    end
end
```

### 7.5 Generate an image and post it as the assistant

```lua
function onButtonClick(id, data)
    if data:sub(1, 4) == "img:" then
        local prompt = data:sub(5)
        local img = generateImage(id, prompt):await()
        if not img:find("Error") then
            addChat(id, "char", img)
            reloadDisplay(id)
        else
            alertError(id, img)
        end
    end
end
```

### 7.6 Per-message turn counter exposed via state

```lua
function onOutput(id)
    local n = getState(id, "char_replies") or 0
    setState(id, "char_replies", n + 1)
end
```

The CBS layer can then read the value with `{{getvar::__char_replies}}` (note the `__` prefix added by `setState`).

### 7.7 Token-budget guard on the outgoing request

```lua
listenEdit('editRequest', async(function(id, value, meta)
    local total = 0
    for _, m in ipairs(value) do
        total = total + getTokens(id, m.content):await()
    end
    if total > 30000 then
        -- drop oldest non-system message until we fit
        for i, m in ipairs(value) do
            if m.role ~= "system" then table.remove(value, i); break end
        end
    end
    return value
end))
```

### 7.8 Tap the LLM via CBS

```lua
function onInput(id)
    -- Re-use the user's persona description, with all CBS expanded
    local desc = getPersonaDescription(id)  -- already CBS-parsed
    local custom = cbs("Hello {{user}}, today is {{date}}.")
    log({ desc = desc, custom = custom })
end
```

---

## 8. Pitfalls (LLM-specific guidance)

1. Always pass `id`. Every host call's first argument is the access key from the lifecycle hook. Without it, the call is silently rejected.
2. Permission denial is silent. A `setChat` from `editDisplay` mode just no-ops. Never assume a write succeeded — verify with a follow-up read if it matters.
3. Return `false` (not `nil`, not `0`) to cancel. Only the literal `false` triggers `stopSending`.
4. `listenEdit` callbacks must `return value`. Returning `nil` breaks the chain. Forward the value (modified or unchanged) every time.
5. `useMultimodal=true` strips inlay markers from text. When `LLM`/`axLLM` extract images, they replace the markers with empty strings in the message content. The model sees the image but no longer sees the marker text — useful, but don't rely on the marker text being retained.
6. `setState`/`getState` namespace under `__`. A `setState(id, "x", 1)` writes to chat var `__x`. Keep this in mind if you mix raw `getChatVar` and `getState` on the same key.
7. `request` is heavily restricted. GET-only, ≤120-char URL, HTTPS, blocklisted domains (risuai.net etc.), 5/min throughput. Don't try to POST or send headers — the API doesn't expose them.
8. `generateImage` requires StableDiffusion to be configured in RisuAI settings. It returns the literal string `"Error: Image generation failed"` on failure (not a structured error).
9. One engine per mode, persistent. Globals you set in one invocation persist into the next as long as the source code doesn't change. Use this for caching, but don't rely on order across modes (each mode has its own engine).
10. The wrapper layer prepends ~150 lines before your code. Line numbers in tracebacks are offset; subtract the wrapper size when debugging.
11. `getDescription` throws on group chats. Wrap in `pcall` if your script may run with group characters.
12. `json.encode` of a Lua array with non-1 starting index produces `{}` (treated as object). Always start arrays at index 1.
13. No `os`, `io`, `package` access. Wasmoon doesn't expose Lua's stdlib filesystem/process modules. The only "I/O" you have is the host functions in this document.
14. Streaming returns the full text once the call completes. Don't expect chunk-by-chunk callbacks in user code; from your script's perspective, `LLM({streaming=true})` is just a different code path that resolves to a string.
15. `onInput`/`onOutput` cannot directly replace the message text. Use `setChat(id, getChatLength(id) - 1, newText)` to mutate the just-appended message, or use a `listenEdit('editInput', ...)` / `listenEdit('editOutput', ...)` hook which is designed for transformation.
16. Python is also available (`type: 'py'`, runs Pyodide in a Worker), but its API surface is different — exposed via a `risuai` Python module rather than direct globals. This document covers Lua only.
17. Don't redefine `callListenMain`, `async`, `json`, or any wrapper helper name. They're set up before your code runs and overriding them will break edit hooks.
18. `cbs(value)` runs the parser in the current character's context. It's the same engine described in `CBS_LLM_REFERENCE.md`. Use it to render templates from Lua — e.g., `cbs("{{getvar::hp}}/{{getvar::maxhp}}")`.

---

## 9. Quick index

| Symbol                         | Section |
|--------------------------------|---------|
| `addChat`                      | 6.1 |
| `alertConfirm`                 | 6.8 |
| `alertError`                   | 6.8 |
| `alertInput`                   | 6.8 |
| `alertNormal`                  | 6.8 |
| `alertSelect`                  | 6.8 |
| `async`                        | 6.11 |
| `axLLM` / `axLLMMain`          | 6.5, 6.10 |
| `callListenMain` (internal)    | 6.11 |
| `cbs`                          | 6.7 |
| `cutChat`                      | 6.1 |
| `generateImage`                | 6.6 |
| `getAuthorsNote`               | 6.3 |
| `getBackgroundEmbedding`       | 6.3 |
| `getCharacterFirstMessage`     | 6.3 |
| `getCharacterImage` / `*Main`  | 6.6, 6.10 |
| `getCharacterLastMessage`      | 6.1 |
| `getChat` / `getChatMain`      | 6.1, 6.10 |
| `getChatLength`                | 6.1 |
| `getChatVar`                   | 6.2 |
| `getDescription`               | 6.3 |
| `getFullChat` / `*Main`        | 6.1, 6.10 |
| `getGlobalVar`                 | 6.2 |
| `getLoreBooks` / `*Main`       | 6.4, 6.10 |
| `getName`                      | 6.3 |
| `getPersonaDescription`        | 6.3 |
| `getPersonaImage` / `*Main`    | 6.6, 6.10 |
| `getPersonaName`               | 6.3 |
| `getState`                     | 6.2 |
| `getTokens`                    | 6.7 |
| `getUserLastMessage`           | 6.1 |
| `hash`                         | 6.7 |
| `insertChat`                   | 6.1 |
| `json.encode` / `json.decode`  | 3 |
| `listenEdit`                   | 6.11 |
| `LLM` / `LLMMain`              | 6.5, 6.10 |
| `loadLoreBooks` / `*Main`      | 6.4, 6.10 |
| `log` / `logMain`              | 6.9, 6.10 |
| `onButtonClick`                | 5.4 |
| `onInput`                      | 5.1 |
| `onOutput`                     | 5.2 |
| `onStart`                      | 5.3 |
| `reloadChat`                   | 6.8 |
| `reloadDisplay`                | 6.8 |
| `removeChat`                   | 6.1 |
| `request`                      | 6.7 |
| `setBackgroundEmbedding`       | 6.3 |
| `setCharacterFirstMessage`     | 6.3 |
| `setChat`                      | 6.1 |
| `setChatRole`                  | 6.1 |
| `setChatVar`                   | 6.2 |
| `setDescription`               | 6.3 |
| `setFullChat` / `*Main`        | 6.1, 6.10 |
| `setName`                      | 6.3 |
| `setState`                     | 6.2 |
| `similarity`                   | 6.7 |
| `simpleLLM`                    | 6.5 |
| `sleep`                        | 6.7 |
| `stopChat`                     | 6.8 |
| `upsertLocalLoreBook`          | 6.4 |
