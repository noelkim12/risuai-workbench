# RisuAI CBS — LLM Reference

CBS (Curly Braced Syntax) is RisuAI's templating macro language. It is evaluated by a recursive parser at prompt-build time and at display time. CBS appears anywhere RisuAI accepts text: character `description`, `personality`, `scenario`, `exampleMessage`, `firstMessage`, user `persona`, `mainPrompt`, `jailbreak`, `globalNote`, `authornote`, lorebook entries, regex scripts, triggers, modules, and chat input.

This document is the canonical reference for an LLM authoring CBS. The tag list is closed — RisuAI rejects unknown `{{...}}` tags by leaving them as literal text, so do not invent names. Every tag below is verified against `src/ts/cbs.ts` (~176 `registerFunction` calls) and block syntax against `src/ts/parser/parser.svelte.ts`.

> **Acknowledgements**
>
> This reference is based on documentation originally authored by
> [nevaeh5379](https://github.com/nevaeh5379).
>
> Original source: [CBS LLM Reference](https://github.com/nevaeh5379/nevaeh5379.github.io/blob/main/skills/CBS_LLM_REFERENCE.md)
>
> Adapted and redistributed for RisuAI Workbench. The original repository is licensed under the [WTFPL](https://github.com/nevaeh5379/nevaeh5379.github.io/blob/main/license).

---

## 1. Core syntax

```
{{tag}}                           – nullary
{{tag::arg}}                      – one argument
{{tag::arg1::arg2::...::argN}}    – N arguments, separated by ::
{{#block ...}} ... {{/block}}     – block construct (opens with #, closes with /)
{{#block::operator::arg}} ... {{/block}}   – block with operator chain
```

Rules:

- `::` is the argument separator. Inside an argument, escape a literal colon with `{{:}}` (alias of `displayescapedcolon`).
- Parsing is recursive and inside-out. `{{upper::{{user}}}}` first resolves `{{user}}` then `{{upper::...}}`. Many character data tags (`description`, `personality`, `scenario`, `persona`, etc.) re-run the parser on their own contents.
- Everything is a string. Booleans are `"1"` (true) and `"0"` (false). Arrays and objects are JSON-encoded strings. Numeric tags return string representations.
- Whitespace inside blocks is trimmed by default. Use the `keep` operator to preserve it (`{{#when::keep::cond}}`, `{{#each::keep arr as v}}`, `{{#escape::keep}}`).
- Aliases. Many tags have alternative names; pick any one. The reference column "Aliases" lists them.
- Display-only tags (assets, buttons, tex, ruby, comment, image/audio/video/bg/bgm, inlay) are processed at render time and are NOT sent to the model. Do not use them in fields whose purpose is to shape the prompt.
- Read-only contexts. When `runVar=false` (e.g., during preview/tokenization), `setvar`/`addvar`/`setdefaultvar`/`settempvar` no-op. When `tokenizeAccurate=true`, time and random tags return placeholder values (`00:00:00`, `0`).
- Deterministic randomness. `{{pick}}` and `{{rollp}}` use a hash of chat ID + character ID + message index — same chat slot always produces the same value. Use them when you need stable choices across regenerations.
- Deprecated. `#if` and `#if_pure` still work but are deprecated → use `#when` (and `#when::keep::cond` for the old `#if_pure` behavior).

---

## 2. Quick-start examples

```
{{user}} greets {{char}}.
→ "Alice greets Hermione."

{{#when::var::angry}}{{char}} scowls.{{:else}}{{char}} smiles.{{/when}}
→ if chat var "angry" is truthy, scowls; otherwise smiles.

You rolled a {{roll::1d20}}.
→ "You rolled a 14."

Turn {{addvar::turn::1}}{{getvar::turn}}.
→ increments persistent counter and prints new value.

{{#each {{makearray::sword::shield::potion}} as item}}- {{slot::item}}
{{/each}}
→ bullet list of three items.

{{#when::toggle::nsfw}}[NSFW content allowed]{{/when}}
→ inserts text only if global toggle "nsfw" is on.

Current model: {{metadata::modelname}} ({{model}}).
→ "Current model: Claude Sonnet 4.6 (claude-sonnet-4-6)."
```

---

## 3. Tag reference

Columns: Tag · Aliases · Args · Returns · Notes. Args use `name` for required, `[name]` for optional, `...` for variadic.

### 3.1 Identity & persona

| Tag | Aliases | Args | Returns / behavior |
|---|---|---|---|
| `{{char}}` | `bot` | — | Character nickname or name. Group chat → group name. Returns `"botname"` in consistent-character mode. |
| `{{user}}` | — | — | User name from settings. Returns `"username"` in consistent-character mode. |
| `{{trigger_id}}` | `triggerid` | — | `risu-id` attribute of element that fired manual trigger; `"null"` if none. |
| `{{persona}}` | `userpersona` | — | User persona prompt, recursively parsed. |

### 3.2 Character data fields (recursively parsed)

| Tag | Aliases | Args | Returns |
|---|---|---|---|
| `{{description}}` | `chardesc` | — | Character `desc` field. Empty for groups. |
| `{{personality}}` | `charpersona` | — | Character `personality` field. Empty for groups. |
| `{{scenario}}` | — | — | Character `scenario` field. Empty for groups. |
| `{{exampledialogue}}` | `examplemessage`, `example_dialogue` | — | Character `exampleMessage` field. Empty for groups. |

### 3.3 Prompts & notes (recursively parsed)

| Tag | Aliases | Args | Returns |
|---|---|---|---|
| `{{mainprompt}}` | `systemprompt`, `main_prompt` | — | Main system prompt. |
| `{{jb}}` | `jailbreak` | — | Jailbreak prompt text. |
| `{{globalnote}}` | `systemnote`, `ujb` | — | Global / system note appended to prompts. |
| `{{authornote}}` | `author_note` | — | Per-chat author note; falls back to template default. |

### 3.4 Chat history

| Tag | Aliases | Args | Returns |
|---|---|---|---|
| `{{lastmessage}}` | — | — | Content of last message in chat (any role). |
| `{{lastmessageid}}` | `lastmessageindex` | — | Index of last message. |
| `{{previouscharchat}}` | `lastcharmessage` | — | Most recent character message before current position. Falls back to first message / chosen greeting. |
| `{{previoususerchat}}` | `lastusermessage` | — | Most recent user message before current position. Empty if `chatID === -1`. |
| `{{previouschatlog::index}}` | `previous_chat_log` | `index` | Message data at index. `"Out of range"` if invalid. |
| `{{chatindex}}` | `chat_index` | — | Current message index; `-1` if no context. |
| `{{userhistory}}` | `usermessages`, `user_history` | — | JSON array of all user messages (role, data, metadata). |
| `{{charhistory}}` | `charmessages`, `char_history` | — | JSON array of all character messages. |
| `{{history}}` | `messages` | `[role]` | JSON array of all messages including first message. With `role`, each entry is the string `"<role>: <data>"`. |
| `{{firstmsgindex}}` | `firstmessageindex`, `first_msg_index` | — | Index of selected greeting; `-1` = default first message. |
| `{{isfirstmsg}}` | `isfirstmessage` | — | `"1"` if rendering first message context, else `"0"`. |
| `{{role}}` | — | — | `"user"` / `"char"` / `"system"` of current message. |

### 3.5 Lorebook

| Tag | Aliases | Args | Returns |
|---|---|---|---|
| `{{lorebook}}` | `worldinfo` | — | JSON array of all active lore entries (character + chat-local + module). |
| `{{hiddenkey::value}}` | — | `value` | Returns empty. Acts as a lore activation key without injecting into model. |

### 3.6 Date & time

All return strings. In tokenize-accurate mode, `messagetime`/`messagedate`/`messageidleduration`/`idleduration` return `"00:00:00"`.

| Tag | Aliases | Args | Returns |
|---|---|---|---|
| `{{time}}` | — | `[fmt]` `[fmt::unix_ms]` | No args → local `H:M:S`. With format string → formatted; optional unix ms timestamp source. |
| `{{date}}` | `datetimeformat` | `[fmt]` `[fmt::unix_ms]` | No args → local `YYYY-M-D`. With args, formats per `dateTimeFormat`. |
| `{{isotime}}` | — | — | UTC `H:M:S`. |
| `{{isodate}}` | — | — | UTC `YYYY-M-D` (NOT zero-padded). |
| `{{unixtime}}` | — | — | Current unix timestamp in seconds. |
| `{{messagetime}}` | `message_time` | — | Local `HH:MM:SS` of current message. |
| `{{messagedate}}` | `message_date` | — | Local date string of current message. |
| `{{messageidleduration}}` | `message_idle_duration` | — | `H:MM:SS` between current and previous user message. |
| `{{idleduration}}` | `idle_duration` | — | `H:MM:SS` since last message. |
| `{{messageunixtimearray}}` | `message_unixtime_array` | — | JSON array of all message timestamps in ms (`0` if missing). |

### 3.7 Comparison & boolean

All return `"1"` or `"0"`.

| Tag | Aliases | Args | Notes |
|---|---|---|---|
| `{{equal::a::b}}` | — | `a, b` | String equality, case-sensitive. |
| `{{notequal::a::b}}` | `not_equal` | `a, b` | String inequality. |
| `{{greater::a::b}}` | — | `a, b` | `Number(a) > Number(b)`. |
| `{{less::a::b}}` | — | `a, b` | `Number(a) < Number(b)`. |
| `{{greaterequal::a::b}}` | `greater_equal` | `a, b` | `>=`. |
| `{{lessequal::a::b}}` | `less_equal` | `a, b` | `<=`. |
| `{{and::a::b}}` | — | `a, b` | `"1"` only if both are `"1"`. |
| `{{or::a::b}}` | — | `a, b` | `"1"` if either is `"1"`. |
| `{{not::a}}` | — | `a` | Inverts; anything other than `"1"` becomes `"1"`. |
| `{{all::a::b::...}}` | — | values or `[json]` | `"1"` if all values are `"1"`. |
| `{{any::a::b::...}}` | — | values or `[json]` | `"1"` if any value is `"1"`. |
| `{{iserror::s}}` | — | `s` | `"1"` if `s` (case-insensitive) starts with `"error:"`. |

### 3.8 String operations

| Tag | Aliases | Args | Returns |
|---|---|---|---|
| `{{startswith::s::sub}}` | — | `s, sub` | `"1"` / `"0"`. |
| `{{endswith::s::sub}}` | — | `s, sub` | `"1"` / `"0"`. |
| `{{contains::s::sub}}` | — | `s, sub` | `"1"` / `"0"`. |
| `{{replace::s::old::new}}` | — | `s, old, new` | `replaceAll(old → new)`. |
| `{{split::s::delim}}` | — | `s, delim` | JSON array of parts. |
| `{{join::[json]::sep}}` | — | `arr, sep` | Concatenates with `sep`. |
| `{{spread::[json]}}` | — | `arr` | Joins with `::`. Useful for re-feeding into another tag's argument list. |
| `{{trim::s}}` | — | `s` | Strips leading/trailing whitespace. |
| `{{length::s}}` | — | `s` | Character count. |
| `{{lower::s}}` | — | `s` | `toLocaleLowerCase`. |
| `{{upper::s}}` | — | `s` | `toLocaleUpperCase`. |
| `{{capitalize::s}}` | — | `s` | First char to upper, rest unchanged. |
| `{{tonumber::s}}` | — | `s` | Keeps only `0-9` and `.`, drops everything else. |
| `{{reverse::s}}` | — | `s` | Reversed string (codepoint-aware). |

### 3.9 Math

| Tag | Aliases | Args | Returns |
|---|---|---|---|
| `{{calc::expr}}` | — | `expr` | Evaluates `+ - * /` and parentheses. |
| `{{? expr}}` | — | `expr` | Math evaluator: `+ - * / % ^ < > <= >= == !=` and parentheses. Note the space, not `::`. |
| `{{round::n}}` | — | `n` | Nearest integer (0.5 rounds up). |
| `{{floor::n}}` | — | `n` | Toward `-∞`. |
| `{{ceil::n}}` | — | `n` | Toward `+∞`. |
| `{{abs::n}}` | — | `n` | Absolute value. |
| `{{remaind::a::b}}` | — | `a, b` | `a % b`. |
| `{{pow::base::exp}}` | — | `base, exp` | `base^exp`. |
| `{{fixnum::n::dp}}` | `fixnumber` | `n, dp` | `n.toFixed(dp)`. |
| `{{min::a::b::...}}` | — | values or `[json]` | Minimum (non-numeric → 0). |
| `{{max::a::b::...}}` | — | values or `[json]` | Maximum (non-numeric → 0). |
| `{{sum::a::b::...}}` | — | values or `[json]` | Sum (non-numeric → 0). |
| `{{average::a::b::...}}` | — | values or `[json]` | Mean (non-numeric → 0). |

### 3.10 Arrays

JSON array strings, e.g. `["a","b","c"]`.

| Tag | Aliases | Args | Returns |
|---|---|---|---|
| `{{makearray::a::b::...}}` | `array`, `a` | variadic | JSON array of all args. |
| `{{arraylength::[json]}}` | — | `arr` | Element count. |
| `{{arrayelement::[json]::idx}}` | — | `arr, idx` | Element at `idx` (supports negative via `Array.at`). `"null"` if absent. |
| `{{arrayshift::[json]}}` | — | `arr` | Array without first element. |
| `{{arraypop::[json]}}` | — | `arr` | Array without last element. |
| `{{arraypush::[json]::v}}` | — | `arr, v` | Array with `v` appended. |
| `{{arraysplice::[json]::idx::deleteCount::newEl}}` | — | `arr, idx, n, v` | `Array.splice(idx, n, v)`. |
| `{{arrayassert::[json]::idx::v}}` | — | `arr, idx, v` | Sets `arr[idx]=v` only if `idx >= length` (extends array). |
| `{{filter::[json]::mode}}` | — | `arr, mode` | `mode` ∈ `all` (drop empty + dedupe), `nonempty`, `unique`. |
| `{{range::[args]}}` | — | `[n]` / `[start,end]` / `[start,end,step]` | JSON array of integers. |

### 3.11 Objects (dictionaries)

JSON object strings, e.g. `{"name":"John"}`.

| Tag | Aliases | Args | Returns |
|---|---|---|---|
| `{{makedict::k=v::k=v::...}}` | `dict`, `d`, `object`, `o`, `makeobject` | variadic | JSON object. Each arg parsed at first `=`; bad pairs ignored. |
| `{{dictelement::{json}::key}}` | `objectelement` | `obj, key` | Value at key, or `"null"`. |
| `{{objectassert::{json}::key::v}}` | `dictassert`, `object_assert` | `obj, key, v` | Sets key only if missing/falsy. Returns object. |
| `{{element::raw::k1::k2::...}}` | `ele` | `json, ...keys` | Deep-nested traversal. Returns `"null"` on any miss. |

### 3.12 Variables

Three scopes:
- Persistent chat var — `getvar` / `setvar` / `setdefaultvar` / `addvar`. Saved with the chat.
- Temp var — `tempvar` / `settempvar`. Lives only during the current parser execution.
- Global var — `getglobalvar`. Read-only here; shared across chats.

Setters return `""`; in read-only contexts (`rmVar=true` or `runVar=false`) they no-op.

| Tag | Aliases | Args | Notes |
|---|---|---|---|
| `{{getvar::name}}` | — | `name` | Read persistent chat var. |
| `{{setvar::name::v}}` | — | `name, v` | Write. |
| `{{setdefaultvar::name::v}}` | — | `name, v` | Write only if currently empty. |
| `{{addvar::name::n}}` | — | `name, n` | `var = Number(var) + Number(n)`. |
| `{{tempvar::name}}` | `gettempvar` | `name` | Read temp var. |
| `{{settempvar::name::v}}` | — | `name, v` | Write temp var. |
| `{{getglobalvar::name}}` | — | `name` | Read global var. |
| `{{return::v}}` | — | `v` | Stops further script execution; sets internal `__return__`. Used inside `#func`. |

### 3.13 Randomization

| Tag | Aliases | Args | Returns |
|---|---|---|---|
| `{{random}}` | — | none / `a,b,c` / `[json]` / `a::b::...` | No args → 0–1 float. With args → random pick. Non-deterministic. |
| `{{pick}}` | — | (same as `random`) | Like `random` but deterministic per chat slot (uses message index + char ID hash). |
| `{{randint::min::max}}` | — | `min, max` | Random integer inclusive. `"NaN"` on bad input. |
| `{{dice::XdY}}` | — | dice notation | Sum of `X` rolls of `dY`. |
| `{{roll::XdY}}` | — | dice notation, `[YsidesOnly]` | `roll` defaults to `1d6`. `roll::20` ≡ `1d20`. |
| `{{rollp::XdY}}` | `rollpick` | dice notation | Hash-based deterministic dice. |
| `{{hash::s}}` | — | `s` | Deterministic 7-digit hash of `s`. |

### 3.14 Encoding & encryption

| Tag | Aliases | Args | Returns |
|---|---|---|---|
| `{{xor::s}}` | `xorencrypt`, `xorencode`, `xore` | `s` | XOR each byte with `0xFF`, base64-encode. |
| `{{xordecrypt::b64}}` | `xordecode`, `xord` | `b64` | Reverse of `xor`. |
| `{{crypt::s::[shift]}}` | `crypto`, `caesar`, `encrypt`, `decrypt` | `s, [shift]` | Caesar cipher over UTF-16 codes, default shift `32768` (which is its own inverse). |
| `{{unicodeencode::s::[idx]}}` | `unicode_encode` | `s, [idx]` | Codepoint at index (default 0) as decimal string. |
| `{{unicodedecode::n}}` | `unicode_decode` | `n` | Decimal codepoint → char. |
| `{{u::hex}}` | `unicodedecodefromhex` | `hex` | Hex codepoint → char. |
| `{{ue::hex}}` | `unicodeencodefromhex` | `hex` | Alias of `{{u}}`. |
| `{{fromhex::hex}}` | — | `hex` | Hex string → decimal string. |
| `{{tohex::n}}` | — | `n` | Decimal string → hex string. |

### 3.15 Display & formatting

These tags mostly produce HTML or special characters; keep them out of pure prompt-shaping fields if you want a clean prompt to the model.

| Tag | Aliases | Args | Returns |
|---|---|---|---|
| `{{br}}` | `newline` | — | Literal `\n`. |
| `{{blank}}` | `none` | — | Empty string. |
| `{{cbr}}` | `cnl`, `cnewline` | `[count]` | Escaped newline `\n` literal; with count, repeats. |
| `{{button::label::trigger}}` | — | `label, trigger` | `<button>` that fires the named trigger when clicked (display only). |
| `{{risu::[size]}}` | — | `[px]` | Risuai logo `<img>`, default 45px. |
| `{{comment::text}}` | — | `text` | Renders a styled comment only when displaying (empty in model prompt). |
| `{{tex::expr}}` | `latex`, `katex` | `expr` | Wraps in `$$...$$` for LaTeX rendering. |
| `{{ruby::base::ruby}}` | `furigana` | `base, ruby` | Ruby/furigana HTML. |
| `{{codeblock::code}}` / `{{codeblock::lang::code}}` | — | `[lang], code` | Renders as `<pre><code>` (with hljs lang hint if `lang` given). |
| `{{file::name::base64}}` | — | `name, b64` | When displaying, shows a styled file div; otherwise base64-decodes to UTF-8 text. |

### 3.16 Escape characters (literal punctuation that won't trigger parsing)

Each of these returns a Unicode private-use character (U+E9B8–U+E9BF) that displays as the punctuation but is invisible to CBS/HTML parsing. Use them when you need a raw `{`, `}`, `(`, `)`, `<`, `>`, `:`, or `;` inside a CBS argument or output.

| Tag | Aliases | Renders as |
|---|---|---|
| `{{decbo}}` | `displayescapedcurlybracketopen` | `{` |
| `{{decbc}}` | `displayescapedcurlybracketclose` | `}` |
| `{{bo}}` | `ddecbo`, `doubledisplayescapedcurlybracketopen` | `{{` |
| `{{bc}}` | `ddecbc`, `doubledisplayescapedcurlybracketclose` | `}}` |
| `{{displayescapedbracketopen}}` | `debo`, `(` | `(` |
| `{{displayescapedbracketclose}}` | `debc`, `)` | `)` |
| `{{displayescapedanglebracketopen}}` | `deabo`, `<` | `<` |
| `{{displayescapedanglebracketclose}}` | `deabc`, `>` | `>` |
| `{{displayescapedcolon}}` | `dec`, `:` | `:` |
| `{{displayescapedsemicolon}}` | `;` | `;` |

Shorthand: `{{:}}` is the same as `{{displayescapedcolon}}`, `{{<}}` is `{{displayescapedanglebracketopen}}`, etc.

### 3.17 Model & system metadata

| Tag | Aliases | Args | Returns |
|---|---|---|---|
| `{{model}}` | — | — | Current AI model ID (e.g., `claude-sonnet-4-6`). |
| `{{axmodel}}` | — | — | Sub/auxiliary model ID. |
| `{{maxcontext}}` | — | — | Configured max context length. |
| `{{prefillsupported}}` | `prefill_supported`, `prefill` | — | `"1"` if model name starts with `claude`. |
| `{{jbtoggled}}` | — | — | `"1"` if jailbreak prompt is enabled. |
| `{{metadata::key}}` | — | `key` | See keys below. |

`{{metadata::...}}` keys (case-insensitive):

| Key | Returns |
|---|---|
| `mobile` | `"1"` if mobile build, else `"0"`. |
| `local` | `"1"` if running under Tauri (local desktop). |
| `node` | `"1"` if running under Node server. |
| `risutype` | `"local"` / `"node"` / `"web"`. |
| `version` | App version string. |
| `majorversion`, `majorver`, `major` | Major version (first dotted segment). |
| `language`, `locale`, `lang` | App UI language. |
| `browserlanguage`, `browserlocale`, `browserlang` | `navigator.language`. |
| `modelshortname` | Short name of current model. |
| `modelname` | Display name of current model. |
| `modelinternalid` | Internal ID. |
| `modelformat` | Format enum value (number). |
| `modelprovider` | Provider enum value (number). |
| `modeltokenizer` | Tokenizer enum value (number). |
| `maxcontext` | Same as `{{maxcontext}}`. |
| `imateapot` | `"🫖"`. |

Unknown key → `"Error: <key> is not a valid metadata key."`.

### 3.18 Display-only assets (NOT sent to model)

These are processed at chat render time. They produce HTML/audio/video/image elements. Do not rely on them in fields whose purpose is to shape what the model sees.

| Tag | Args | Purpose |
|---|---|---|
| `{{asset::name}}` | `name` | Auto-routes to image/audio/video element based on asset type. |
| `{{emotion::name}}` | `name` | Emotion image. |
| `{{audio::name}}` | `name` | Audio element. |
| `{{bg::name}}` | `name` | Background image. |
| `{{bgm::name}}` | `name` | Background music control. |
| `{{video::name}}` | `name` | Video element. |
| `{{video-img::name}}` | `name` | Video as image-like element. |
| `{{image::name}}` | `name` | Image element. |
| `{{img::name}}` | `name` | Unstyled image. |
| `{{path::name}}` (`raw`) | `name` | Path data of additional asset. |
| `{{inlay::name}}` | `name` | Unstyled inlay (not in model). |
| `{{inlayed::name}}` | `name` | Styled inlay (not in model). |
| `{{inlayeddata::name}}` | `name` | Styled inlay (IS sent to model request). |
| `{{source::user\|char}}` | `"user"` or `"char"` | Profile image source URL. |
| `{{position::name}}` | `name` | Defines a position usable by `@@position <name>` decorators. |
| `{{emotionlist}}` | — | JSON array of emotion names for current character. |
| `{{assetlist}}` | — | JSON array of additional asset names. |
| `{{chardisplayasset}}` | — | JSON array of prebuilt display asset names (filtered by exclusions). |

### 3.19 Modules

| Tag | Aliases | Args | Returns |
|---|---|---|---|
| `{{moduleenabled::ns}}` | `module_enabled` | `namespace` | `"1"` if a loaded module has that namespace. |
| `{{moduleassetlist::ns}}` | `module_assetlist` | `namespace` | JSON array of module asset names; `""` if module not found. |

### 3.20 UI / runtime

| Tag | Aliases | Args | Returns |
|---|---|---|---|
| `{{screenwidth}}` | `screen_width` | — | `window.innerWidth` in px. |
| `{{screenheight}}` | `screen_height` | — | `window.innerHeight` in px. |

### 3.21 Text-mutating (post-process)

| Tag | Args | Behavior |
|---|---|---|
| `{{bkspc}}` | — | Removes the last word from the parser's accumulated output up to this point. |
| `{{erase}}` | — | Removes the last sentence (back to the last `.`/`!`/`?`/`\n`) from accumulated output. |

### 3.22 Misc / advanced

| Tag | Args | Notes |
|---|---|---|
| `{{// any text}}` | inline | Comment; produces nothing. |
| `{{declare::name}}` | `name` | Sets internal flag `__declared_<name>__=1`; affects parser behavior elsewhere. |
| `{{__::...}}` | — | INTERNAL — do not use. |

---

## 4. Block constructs

Blocks open with `{{#name ...}}` and close with `{{/name}}`. They are evaluated by `parser.svelte.ts`.

### 4.1 `{{#when ...}} ... {{:else}} ... {{/when}}`

Conditional. Truthy values: literal `"1"` or `"true"`. Everything else is falsy.

Two opening forms:

```
{{#when condition}}            ← single condition, space-separated
{{#when::op::a::op::b...}}     ← :: separated; supports operator chain
```

Operators (consumed right-to-left, can be stacked):

| Operator | Form | Effect |
|---|---|---|
| `not` | `{{#when::not::A}}` | Negate. |
| `and` | `{{#when::A::and::B}}` | Both truthy. |
| `or` | `{{#when::A::or::B}}` | Either truthy. |
| `is` | `{{#when::A::is::B}}` | String equal. |
| `isnot` | `{{#when::A::isnot::B}}` | String not equal. |
| `>` `<` `>=` `<=` | `{{#when::A::>::B}}` | Numeric compare in natural order: `A > B` is true when `A` is greater than `B`. |
| `var` | `{{#when::var::name}}` | Truthy if persistent chat var `name` is truthy. |
| `vis` | `{{#when::name::vis::value}}` | Var `name` equals literal `value`. |
| `visnot` | `{{#when::name::visnot::value}}` | Var `name` not equals `value`. |
| `toggle` | `{{#when::toggle::name}}` | Truthy if global var `toggle_<name>` is truthy. |
| `tis` | `{{#when::name::tis::value}}` | Toggle `name` equals `value`. |
| `tisnot` | `{{#when::name::tisnot::value}}` | Toggle `name` not equals `value`. |
| `keep` | `{{#when::keep::cond}}` | Preserve whitespace inside block. |
| `legacy` | `{{#when::legacy::cond}}` | Old `#if` whitespace handling; `:else` is disabled. |

Stacking example: `{{#when::keep::not::cond}}` — keep whitespace, negate.

`{{:else}}` rules:
- May appear once inside a `#when` block.
- For multi-line blocks, `{{:else}}` must be on a line by itself (no other content).
- For single-line blocks, `{{:else}}` can be inline.
- Disabled when `legacy` operator is used.

### 4.2 `{{#each ARR as V}} ... {{slot::V}} ... {{/each}}`

Iterate a JSON array. Inside the block, `{{slot::V}}` yields the current element. The `as` keyword is required.

```
{{#each {{makearray::red::green::blue}} as color}}
- {{slot::color}}
{{/each}}
```

Forms:
- `{{#each ARR as V}} ... {{/each}}` — default trim
- `{{#each::keep ARR as V}} ... {{/each}}` — preserve whitespace
- Alias: `{{:each ...}}` (less common)

### 4.3 `{{#pure}} ... {{/pure}}` *(deprecated → use `#puredisplay`)*  
### 4.4 `{{#puredisplay}} ... {{/puredisplay}}` (alias `{{#pure_display}}`)

Content is shown without ANY further CBS processing. Use to display raw `{{...}}` examples literally.

### 4.5 `{{#code}} ... {{/code}}`

Normalizes whitespace and escape sequences inside the block.

### 4.6 `{{#escape}} ... {{/escape}}`

Treats `{}()` as literal; nothing inside is parsed as CBS or sub-expressions. Use `{{#escape::keep}}` to also preserve whitespace.

### 4.7 `{{#func name arg1 arg2 ...}} ... {{/func}}`

Defines a callable function. Within the body, `{{tempvar::arg1}}` etc. read the call arguments. Use `{{return::v}}` to return early. Functions are then invokable elsewhere by their `name`.

### 4.8 `{{#if ...}} ... {{/if}}` and `{{#if_pure ...}} ... {{/if_pure}}` *(both deprecated)*

Replaced by `#when` and `#when::keep::cond` respectively.

---

## 5. Patterns & recipes

### 5.1 Persistent turn counter

```
{{addvar::turn::1}}You are now on turn {{getvar::turn}}.
```

### 5.2 A/B persona switch via global toggle

```
{{#when::toggle::angry}}{{char}} is furious and curt.{{:else}}{{char}} is calm and helpful.{{/when}}
```

### 5.3 Initialize-once chat state

```
{{setdefaultvar::hp::100}}{{setdefaultvar::status::healthy}}
HP: {{getvar::hp}} | Status: {{getvar::status}}
```

### 5.4 Dice with consequence

```
{{settempvar::r::{{roll::1d20}}}}
You rolled {{tempvar::r}}. {{#when::{{tempvar::r}}::>::15}}A critical success!{{:else}}{{#when::{{tempvar::r}}::<::5}}A critical failure.{{:else}}A modest result.{{/when}}{{/when}}
```

### 5.5 Iterate an inventory

```
{{settempvar::inv::["sword","shield","potion"]}}
Inventory:
{{#each {{tempvar::inv}} as it}}- {{slot::it}}
{{/each}}
```

### 5.6 Use stable random per message

For an outcome that must remain the same when the user regenerates the same message:

```
{{char}} is wearing a {{pick::red::blue::green}} cloak today.
```

(Re-rolls only when message index changes.)

### 5.7 Lorebook key without prompt cost

```
{{hiddenkey::magic_system}}{{hiddenkey::dragons}}
```

Triggers lore entries keyed on `magic_system` or `dragons` without inserting those words into the model prompt.

### 5.8 Display literal CBS in output

```
The macro {{bo}}user{{bc}} returns the user's name.
```

Renders as: `The macro {{user}} returns the user's name.`

### 5.9 Build then call a function

```
{{#func greet name}}Hello, {{tempvar::name}}!{{/func}}
{{greet::Alice}}
→ "Hello, Alice!"
```

---

## 6. Pitfalls (LLM-specific guidance)

1. The tag set is closed. If you don't see a tag in this document, RisuAI does not have it. Don't invent `{{ifelse}}`, `{{format}}`, `{{regex}}` etc. — they don't exist as CBS.
2. `{{...}}` literal output requires `{{bo}}` / `{{bc}}` (or `#puredisplay` block). Writing `{{user}}` in output text WILL be substituted by the user name.
3. Nested CBS in arguments is fine — `{{upper::{{user}}}}` works because parsing is recursive.
4. `::` inside an argument breaks parsing. Use `{{:}}` for a literal colon inside an arg.
5. Booleans are strings `"1"` / `"0"`. Logical tags treat anything other than `"1"` as falsy.
6. `#when` operator precedence is right-to-left. Stack operators with the outermost transformation last: `{{#when::keep::not::A}}` means "with keep whitespace, NOT(A)".
7. `#when` operators pop right-to-left — operator chains evaluate from the rightmost pair. For simple binary cases `{{#when::A::>::B}}` reads naturally as "A greater than B"; for chained operators, mentally evaluate from the right.
8. Setters return empty. `{{setvar::x::5}}` outputs nothing; if you need to show the new value, follow with `{{getvar::x}}`.
9. Setters no-op in read-only contexts (preview, tokenization). Don't use them as the only side effect for something that must always run.
10. `{{random}}` is non-deterministic across regenerations. Use `{{pick}}` / `{{rollp}}` if you need a stable choice.
11. Display-only tags (`button`, `comment`, `tex`, `ruby`, `image`/`img`/`audio`/`video`/`bg`/`bgm`/`asset`/`emotion`/`inlay`/`inlayed`, `risu`, `codeblock`, `file` in display mode) DO NOT reach the model. Use them only in chat output, not in prompt-shaping fields.
12. `{{inlayeddata::...}}` is the only inlay variant that DOES go to the model.
13. Time/date placeholders. When tokenization runs (e.g., counting tokens for context), `messagetime`, `messagedate`, `messageidleduration`, `idleduration` return `"00:00:00"` — do not write logic that depends on these being valid in all contexts.
14. `#if` and `#if_pure` are deprecated. Use `#when` (and `#when::keep::cond` for the old `#if_pure` behavior).
15. `{{? ...}}` uses a SPACE, not `::`. `{{? 2+3*4}}` works; `{{?::2+3*4}}` does not.
16. Recursive parsing of character fields. `{{description}}` re-runs the parser on the character description, so CBS authored inside a character description is fully active.
17. Group chats return `""` for `personality`, `description`, `scenario`, `exampledialogue`, `assetlist`.
18. `{{persona}}` returns the user's persona prompt, not the character's. The character's personality is `{{personality}}`.

---

## 7. Alphabetical index

Aliases listed in parentheses.

| Tag | Section |
|---|---|
| `{{//}}` | 3.22 |
| `{{?}}` | 3.9 |
| `{{__}}` *(internal)* | 3.22 |
| `{{a}}` (alias of `makearray`) | 3.10 |
| `{{abs}}` | 3.9 |
| `{{addvar}}` | 3.12 |
| `{{all}}` | 3.7 |
| `{{and}}` | 3.7 |
| `{{any}}` | 3.7 |
| `{{array}}` (alias of `makearray`) | 3.10 |
| `{{arrayassert}}` | 3.10 |
| `{{arrayelement}}` | 3.10 |
| `{{arraylength}}` | 3.10 |
| `{{arraypop}}` | 3.10 |
| `{{arraypush}}` | 3.10 |
| `{{arrayshift}}` | 3.10 |
| `{{arraysplice}}` | 3.10 |
| `{{asset}}` | 3.18 |
| `{{assetlist}}` | 3.18 |
| `{{audio}}` | 3.18 |
| `{{authornote}}` (`author_note`) | 3.3 |
| `{{average}}` | 3.9 |
| `{{axmodel}}` | 3.17 |
| `{{bc}}` | 3.16 |
| `{{bg}}` | 3.18 |
| `{{bgm}}` | 3.18 |
| `{{bkspc}}` | 3.21 |
| `{{blank}}` (`none`) | 3.15 |
| `{{bo}}` | 3.16 |
| `{{bot}}` (alias of `char`) | 3.1 |
| `{{br}}` (`newline`) | 3.15 |
| `{{button}}` | 3.15 |
| `{{calc}}` | 3.9 |
| `{{capitalize}}` | 3.8 |
| `{{cbr}}` (`cnl`, `cnewline`) | 3.15 |
| `{{ceil}}` | 3.9 |
| `{{char}}` (`bot`) | 3.1 |
| `{{chardesc}}` (alias of `description`) | 3.2 |
| `{{chardisplayasset}}` | 3.18 |
| `{{charhistory}}` (`charmessages`, `char_history`) | 3.4 |
| `{{charpersona}}` (alias of `personality`) | 3.2 |
| `{{chatindex}}` (`chat_index`) | 3.4 |
| `{{codeblock}}` | 3.15 |
| `{{comment}}` | 3.15 |
| `{{contains}}` | 3.8 |
| `{{crypt}}` (`crypto`, `caesar`, `encrypt`, `decrypt`) | 3.14 |
| `{{d}}` (alias of `makedict`) | 3.11 |
| `{{date}}` (`datetimeformat`) | 3.6 |
| `{{deabc}}` / `{{>}}` | 3.16 |
| `{{deabo}}` / `{{<}}` | 3.16 |
| `{{debc}}` / `{{)}}` | 3.16 |
| `{{debo}}` / `{{(}}` | 3.16 |
| `{{dec}}` / `{{:}}` | 3.16 |
| `{{decbc}}` | 3.16 |
| `{{decbo}}` | 3.16 |
| `{{declare}}` | 3.22 |
| `{{description}}` (`chardesc`) | 3.2 |
| `{{dice}}` | 3.13 |
| `{{dict}}` (alias of `makedict`) | 3.11 |
| `{{dictelement}}` (`objectelement`) | 3.11 |
| `{{element}}` (`ele`) | 3.11 |
| `{{emotion}}` | 3.18 |
| `{{emotionlist}}` | 3.18 |
| `{{endswith}}` | 3.8 |
| `{{equal}}` | 3.7 |
| `{{erase}}` | 3.21 |
| `{{exampledialogue}}` (`examplemessage`, `example_dialogue`) | 3.2 |
| `{{file}}` | 3.15 |
| `{{filter}}` | 3.10 |
| `{{firstmsgindex}}` (`firstmessageindex`, `first_msg_index`) | 3.4 |
| `{{fixnum}}` (`fixnumber`) | 3.9 |
| `{{floor}}` | 3.9 |
| `{{fromhex}}` | 3.14 |
| `{{getglobalvar}}` | 3.12 |
| `{{gettempvar}}` (alias of `tempvar`) | 3.12 |
| `{{getvar}}` | 3.12 |
| `{{globalnote}}` (`systemnote`, `ujb`) | 3.3 |
| `{{greater}}` | 3.7 |
| `{{greaterequal}}` (`greater_equal`) | 3.7 |
| `{{hash}}` | 3.13 |
| `{{hiddenkey}}` | 3.5 |
| `{{history}}` (`messages`) | 3.4 |
| `{{idleduration}}` (`idle_duration`) | 3.6 |
| `{{image}}` | 3.18 |
| `{{img}}` | 3.18 |
| `{{inlay}}` | 3.18 |
| `{{inlayed}}` | 3.18 |
| `{{inlayeddata}}` | 3.18 |
| `{{iserror}}` | 3.7 |
| `{{isfirstmsg}}` (`isfirstmessage`) | 3.4 |
| `{{isodate}}` | 3.6 |
| `{{isotime}}` | 3.6 |
| `{{jb}}` (`jailbreak`) | 3.3 |
| `{{jbtoggled}}` | 3.17 |
| `{{join}}` | 3.8 |
| `{{lastcharmessage}}` (alias of `previouscharchat`) | 3.4 |
| `{{lastmessage}}` | 3.4 |
| `{{lastmessageid}}` (`lastmessageindex`) | 3.4 |
| `{{lastusermessage}}` (alias of `previoususerchat`) | 3.4 |
| `{{latex}}` (alias of `tex`) | 3.15 |
| `{{length}}` | 3.8 |
| `{{less}}` | 3.7 |
| `{{lessequal}}` (`less_equal`) | 3.7 |
| `{{lorebook}}` (`worldinfo`) | 3.5 |
| `{{lower}}` | 3.8 |
| `{{mainprompt}}` (`systemprompt`, `main_prompt`) | 3.3 |
| `{{makearray}}` (`array`, `a`) | 3.10 |
| `{{makedict}}` (`dict`, `d`, `object`, `o`, `makeobject`) | 3.11 |
| `{{max}}` | 3.9 |
| `{{maxcontext}}` | 3.17 |
| `{{messagedate}}` (`message_date`) | 3.6 |
| `{{messageidleduration}}` (`message_idle_duration`) | 3.6 |
| `{{messages}}` (alias of `history`) | 3.4 |
| `{{messagetime}}` (`message_time`) | 3.6 |
| `{{messageunixtimearray}}` (`message_unixtime_array`) | 3.6 |
| `{{metadata}}` | 3.17 |
| `{{min}}` | 3.9 |
| `{{model}}` | 3.17 |
| `{{moduleassetlist}}` (`module_assetlist`) | 3.19 |
| `{{moduleenabled}}` (`module_enabled`) | 3.19 |
| `{{newline}}` (alias of `br`) | 3.15 |
| `{{not}}` | 3.7 |
| `{{notequal}}` (`not_equal`) | 3.7 |
| `{{object}}` (alias of `makedict`) | 3.11 |
| `{{objectassert}}` (`dictassert`, `object_assert`) | 3.11 |
| `{{objectelement}}` (alias of `dictelement`) | 3.11 |
| `{{or}}` | 3.7 |
| `{{path}}` (`raw`) | 3.18 |
| `{{persona}}` (`userpersona`) | 3.1 |
| `{{personality}}` (`charpersona`) | 3.2 |
| `{{pick}}` | 3.13 |
| `{{position}}` | 3.18 |
| `{{pow}}` | 3.9 |
| `{{prefillsupported}}` (`prefill`, `prefill_supported`) | 3.17 |
| `{{previouscharchat}}` (`lastcharmessage`) | 3.4 |
| `{{previouschatlog}}` (`previous_chat_log`) | 3.4 |
| `{{previoususerchat}}` (`lastusermessage`) | 3.4 |
| `{{randint}}` | 3.13 |
| `{{random}}` | 3.13 |
| `{{range}}` | 3.10 |
| `{{remaind}}` | 3.9 |
| `{{replace}}` | 3.8 |
| `{{return}}` | 3.12 |
| `{{reverse}}` | 3.8 |
| `{{risu}}` | 3.15 |
| `{{role}}` | 3.4 |
| `{{roll}}` | 3.13 |
| `{{rollp}}` (`rollpick`) | 3.13 |
| `{{round}}` | 3.9 |
| `{{ruby}}` (`furigana`) | 3.15 |
| `{{scenario}}` | 3.2 |
| `{{screenheight}}` (`screen_height`) | 3.20 |
| `{{screenwidth}}` (`screen_width`) | 3.20 |
| `{{setdefaultvar}}` | 3.12 |
| `{{settempvar}}` | 3.12 |
| `{{setvar}}` | 3.12 |
| `{{slot}}` | 4.2 |
| `{{source}}` | 3.18 |
| `{{split}}` | 3.8 |
| `{{spread}}` | 3.8 |
| `{{startswith}}` | 3.8 |
| `{{sum}}` | 3.9 |
| `{{tempvar}}` (`gettempvar`) | 3.12 |
| `{{tex}}` (`latex`, `katex`) | 3.15 |
| `{{time}}` | 3.6 |
| `{{tohex}}` | 3.14 |
| `{{tonumber}}` | 3.8 |
| `{{trigger_id}}` (`triggerid`) | 3.1 |
| `{{trim}}` | 3.8 |
| `{{u}}` (`unicodedecodefromhex`) | 3.14 |
| `{{ue}}` (`unicodeencodefromhex`) | 3.14 |
| `{{unicodedecode}}` (`unicode_decode`) | 3.14 |
| `{{unicodeencode}}` (`unicode_encode`) | 3.14 |
| `{{unixtime}}` | 3.6 |
| `{{upper}}` | 3.8 |
| `{{user}}` | 3.1 |
| `{{userhistory}}` (`usermessages`, `user_history`) | 3.4 |
| `{{userpersona}}` (alias of `persona`) | 3.1 |
| `{{video}}` | 3.18 |
| `{{video-img}}` | 3.18 |
| `{{worldinfo}}` (alias of `lorebook`) | 3.5 |
| `{{xor}}` (`xorencrypt`, `xorencode`, `xore`) | 3.14 |
| `{{xordecrypt}}` (`xordecode`, `xord`) | 3.14 |
| Block: `{{#code}}...{{/code}}` | 4.5 |
| Block: `{{#each ...}}...{{/each}}` | 4.2 |
| Block: `{{#escape}}...{{/escape}}` | 4.6 |
| Block: `{{#func name args}}...{{/func}}` | 4.7 |
| Block: `{{#if ...}}...{{/if}}` *(deprecated)* | 4.8 |
| Block: `{{#if_pure ...}}...{{/if_pure}}` *(deprecated)* | 4.8 |
| Block: `{{#pure}}...{{/pure}}` *(deprecated)* | 4.3 |
| Block: `{{#puredisplay}}...{{/puredisplay}}` (`#pure_display`) | 4.4 |
| Block: `{{#when ...}} ... {{:else}} ... {{/when}}` | 4.1 |
