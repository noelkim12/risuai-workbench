/**
 * Bundled RisuLua semantic reference snippets for MCP resources.
 * These snippets are derived from docs/reference/LUA_FOR_LLM.md and intentionally
 * kept small so default resource reads remain navigational rather than raw document dumps.
 * @file packages/risuai-workbench-mcp/src/resources/risulua-index-data.ts
 */

export const RISULUA_LIFECYCLE_MARKDOWN = `# RisuLua lifecycle quick reference

RisuAI calls top-level Lua functions at lifecycle boundaries.

| Mode | Function | Contract |
| --- | --- | --- |
| input | \`onInput(id)\` | Runs after user input is appended and before the LLM request. Return literal \`false\` to stop sending. |
| output | \`onOutput(id)\` | Runs after assistant output is available. Return literal \`false\` to stop chat advancement. |
| start | \`onStart(id)\` | Runs when a chat script engine initializes. |
| button | \`onButtonClick(id, data)\` | Runs when a CBS button trigger is clicked. Return value flows back to the caller. |
| edit hooks | \`listenEdit(type, callback)\` | Transform editInput, editOutput, editRequest, or editDisplay values. Always return the value. |

Always pass the received \`id\` to host functions. Use \`return false\` when a lifecycle handler must cancel. Permission denial can silently no-op.
`;

export const RISULUA_ACCESS_TIERS_MARKDOWN = `# RisuLua access tiers

- Open: read-only runtime access such as \`getChatVar\`, \`getName\`, \`getChatLength\`, \`cbs\`, \`hash\`, and logging.
- Safe: Open plus write/update helpers such as \`setChat\`, \`addChat\`, \`setChatVar\`, alerts, token counting, and display reloads.
- EditDisplay: limited display-time write surface. State writes such as \`setChatVar\` are available, but most chat mutation APIs no-op.
- LowLevel: model/network/image/similarity APIs such as \`LLM\`, \`axLLM\`, \`simpleLLM\`, \`request\`, \`similarity\`, \`generateImage\`, and \`loadLoreBooks\`.

Treat this as a capability map, not a linter rulebook. Use the actual lifecycle mode and trigger access settings when deciding which calls can work.
`;

export const RISULUA_ASYNC_MARKDOWN = `# RisuLua async and Promise bridge

Many host functions return JavaScript Promises bridged through Wasmoon. Call \`:await()\` on raw async host calls.

\`\`\`lua
local n = getTokens(id, "hello"):await()
local resp = request(id, "https://example.com/data.json"):await()
local body = json.decode(resp).data
\`\`\`

Wrapper helpers such as \`LLM\`, \`axLLM\`, \`loadLoreBooks\`, \`getCharacterImage\`, and \`getPersonaImage\` already await and decode common raw APIs.

For async edit callbacks, wrap the callback with \`async(function(...) ... end)\` and return the transformed value.
`;

export const RISULUA_PATTERNS_MARKDOWN = `# RisuLua host function patterns

## State stored as JSON
Use \`getState(id, name)\` and \`setState(id, name, value)\` for structured data. These helpers store values under chat variables prefixed with \`__\`.

## Button action
Use CBS \`{{button::Label::payload}}\`, then handle the payload in \`onButtonClick(id, data)\`.

## Request transformation
Use \`listenEdit('editRequest', callback)\` to transform the outgoing OpenAI-style message array.

## Low-level model calls
Use \`LLM\`, \`axLLM\`, or \`simpleLLM\` only when the trigger grants LowLevel access.
`;

export const RISULUA_PITFALLS_MARKDOWN = `# RisuLua host function pitfalls

- Do not invent host functions. The documented surface is closed.
- Always pass the lifecycle \`id\` as the first argument to host functions.
- Permission denial can be silent; verify writes with a follow-up read when correctness matters.
- Return literal \`false\` to cancel; \`nil\`, \`0\`, and empty strings do not cancel.
- \`listenEdit\` callbacks must return the current or transformed value.
- Raw \`*Main\` functions often return JSON strings; prefer wrapper helpers unless raw control is needed.
- \`request\` is HTTPS GET-only and rate/length/domain restricted.
- No filesystem or process I/O is available from Lua.
`;

export const RISULUA_COMMON_PATTERNS = [
  {
    detailUri: 'risuai-workbench://risulua/category/state',
    functions: ['getState', 'setState', 'getChatVar', 'setChatVar'],
    id: 'state-lifecycle',
    title: 'State lifecycle',
  },
  {
    detailUri: 'risuai-workbench://risulua/lifecycle',
    functions: ['onInput', 'onOutput', 'onButtonClick', 'listenEdit'],
    id: 'lifecycle-hooks',
    title: 'Lifecycle hooks',
  },
  {
    detailUri: 'risuai-workbench://risulua/async',
    functions: ['async', 'getTokens', 'request', 'generateImage'],
    id: 'async-await',
    title: 'Async host calls',
  },
] as const;
