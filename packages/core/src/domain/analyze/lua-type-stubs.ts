/**
 * RisuAI Lua runtime globals를 LuaLS가 읽을 수 있는 stub 텍스트로 생성하는 유틸.
 * @file packages/core/src/domain/analyze/lua-type-stubs.ts
 */

import { RISUAI_API } from './lua-api';

export const RISUAI_LUA_RUNTIME_STUB_FILE_NAME = 'risu-runtime.lua';

export interface RisuAiLuaRuntimeParameterDocumentation {
  name: string;
  description: string;
}

export interface RisuAiLuaRuntimeDocumentation {
  summary: string;
  details: readonly string[];
  parameters: readonly RisuAiLuaRuntimeParameterDocumentation[];
  returns?: string;
  examples: readonly string[];
}

const RISUAI_EXTRA_INJECTED_GLOBAL_NAMES = Object.freeze([
  'getChatMain',
  'setChatRole',
  'getFullChatMain',
  'setFullChatMain',
  'logMain',
  'getCharacterImageMain',
  'getPersonaImageMain',
  'getAuthorsNote',
  'getBackgroundEmbedding',
  'setBackgroundEmbedding',
  'setCharacterFirstMessage',
]);

const RISUAI_WRAPPER_GLOBAL_NAMES = Object.freeze([
  'callListenMain',
  'getChat',
  'getFullChat',
  'setFullChat',
  'log',
  'getLoreBooks',
  'loadLoreBooks',
  'LLM',
  'axLLM',
  'getCharacterImage',
  'getPersonaImage',
  'listenEdit',
  'getState',
  'setState',
  'async',
]);

const RISUAI_RUNTIME_NAMESPACE_NAMES = Object.freeze(['json', 'Promise']);
const RISUAI_SCRIPT_HOOK_NAMES = Object.freeze(['onInput', 'onOutput', 'onStart', 'onButtonClick']);
const REQUIRED_RISUAI_STUB_API_NAMES = Object.freeze(['getLoreBooks', 'getState', 'setState']);

const PARAMETER_DESCRIPTIONS = Object.freeze<Record<string, string>>({
  callback: 'Function to wrap or execute through the RisuAI Lua runtime bridge.',
  data: 'Button identifier or callback payload passed by the RisuAI UI/runtime.',
  endIndex: 'Exclusive chat message index where the operation stops.',
  func: 'Listener callback invoked by the RisuAI edit pipeline.',
  id: 'Safe runtime access key passed by RisuAI script callbacks.',
  index: 'Zero-based chat message index.',
  key: 'Variable key in the selected RisuAI variable namespace.',
  meta: 'Runtime metadata supplied by the edit listener pipeline.',
  name: 'State or resource name to read or write.',
  negValue: 'Optional negative prompt for image generation.',
  prompt: 'OpenAI-style prompt item array or compatible table.',
  promptStr: 'JSON-encoded prompt item array string.',
  reserve: 'Token budget to reserve while loading active lorebooks.',
  role: 'Chat role to assign to the message.',
  search: 'Lorebook search text or keyword.',
  source: 'Source text used as the similarity search basis.',
  startIndex: 'Inclusive chat message index where the operation starts.',
  time: 'Sleep duration in milliseconds.',
  type: 'Listener or runtime dispatch type.',
  url: 'HTTPS URL to request through the native fetch wrapper.',
  useMultimodal: 'Optional flag that allows multimodal prompt handling.',
  value: 'Value passed to the runtime API.',
});

const RISUAI_RUNTIME_DOCUMENTATION = Object.freeze<Record<string, RisuAiLuaRuntimeDocumentation>>({
  Promise: runtimeDoc(
    'wasmoon Promise bridge namespace.',
    ['Provides create, resolve, and all helpers for coroutine-backed async work.'],
    [],
    'Namespace table with Promise helper functions.',
    ['local both = Promise.all({ LLMMain(id, json.encode(prompt1)), LLMMain(id, json.encode(prompt2)) }).await()'],
  ),
  json: runtimeDoc(
    'JSON module mounted into the Lua runtime.',
    ['Use encode/decode for Lua table and JSON string interop.'],
    [],
    'Namespace table with encode/decode functions.',
    ['local encoded = json.encode({ mood = "happy" })\nlocal decoded = json.decode(encoded)'],
  ),
  getChatVar: runtimeDoc('(Injected) Get a per-chat variable.', [], ['id', 'key'], 'Stored string value.'),
  setChatVar: runtimeDoc(
    '(Injected) Set a per-chat variable.',
    ['Requires SAFE id or editDisplay runtime id. Convert numbers to strings before storing.'],
    ['id', 'key', 'value'],
    undefined,
    ['setChatVar(id, "mood", "happy")'],
  ),
  getGlobalVar: runtimeDoc('(Injected) Get a global character-shared variable.', [], ['id', 'key'], 'Stored string value.'),
  alertError: runtimeDoc('(Injected) Show an error alert to the user.', ['Requires SAFE id.'], ['id', 'value']),
  alertNormal: runtimeDoc('(Injected) Show a normal alert to the user.', ['Requires SAFE id.'], ['id', 'value']),
  alertInput: runtimeDoc(
    '(Injected) Prompt the user for text input.',
    ['Requires SAFE id and resolves asynchronously.'],
    ['id', 'value'],
    'Promise-like table resolving to the entered string.',
    ['local userInput = alertInput(id, "Enter message").await()'],
  ),
  alertSelect: runtimeDoc(
    '(Injected) Show a selection dialog.',
    ['Requires SAFE id and resolves with the selected option.'],
    ['id', 'value'],
    'Promise-like table resolving to the selected string.',
  ),
  alertConfirm: runtimeDoc(
    '(Injected) Show a confirmation dialog.',
    ['Requires SAFE id and resolves with true/false.'],
    ['id', 'value'],
    'Promise-like table resolving to a boolean.',
    ['local ok = alertConfirm(id, "Delete this item?").await()'],
  ),
  getChatMain: runtimeDoc('(Injected) Get one chat message as a JSON string.', [], ['id', 'index'], 'JSON string or "null".'),
  getChat: runtimeDoc(
    'Wrapper: decode getChatMain JSON into a chat message table.',
    ['Returns nil when no message exists at the index.'],
    ['id', 'index'],
    'Chat message table or nil.',
    ['local msg = getChat(id, 0)\nif msg then log(msg.data) end'],
  ),
  getFullChatMain: runtimeDoc('(Injected) Get the full chat as a JSON string.', [], ['id'], 'JSON string containing chat messages.'),
  getFullChat: runtimeDoc(
    'Wrapper: decode getFullChatMain JSON into a chat array.',
    [],
    ['id'],
    'Array-like table of chat messages.',
  ),
  setFullChatMain: runtimeDoc('(Injected) Replace the full chat from a JSON string.', ['Requires SAFE id.'], ['id', 'value']),
  setFullChat: runtimeDoc(
    'Wrapper: JSON-encode and replace the full chat.',
    ['Requires SAFE id. Prefer this wrapper when editing decoded chat tables.'],
    ['id', 'value'],
  ),
  setChat: runtimeDoc('(Injected) Replace one chat message text.', ['Requires SAFE id.'], ['id', 'index', 'value']),
  setChatRole: runtimeDoc('(Injected) Replace one chat message role.', ['Requires SAFE id.'], ['id', 'index', 'value']),
  cutChat: runtimeDoc('(Injected) Remove a range of chat messages.', ['Requires SAFE id.'], ['id', 'startIndex', 'endIndex']),
  removeChat: runtimeDoc('(Injected) Remove one chat message.', ['Requires SAFE id.'], ['id', 'index']),
  addChat: runtimeDoc('(Injected) Append a chat message.', ['Requires SAFE id.'], ['id', 'role', 'value']),
  insertChat: runtimeDoc('(Injected) Insert a chat message at an index.', ['Requires SAFE id.'], ['id', 'index', 'role', 'value']),
  getChatLength: runtimeDoc('(Injected) Get the number of chat messages.', [], ['id'], 'Chat message count.'),
  getTokens: runtimeDoc(
    '(Injected) Count tokens for text.',
    ['Requires SAFE id and resolves asynchronously.'],
    ['id', 'value'],
    'Promise-like table resolving to a token count.',
  ),
  sleep: runtimeDoc('(Injected) Sleep for a duration.', ['Requires SAFE id and resolves asynchronously.'], ['id', 'time'], 'Promise-like table resolving after the delay.'),
  cbs: runtimeDoc('(Injected) Run text through the RisuAI chat parser.', [], ['value'], 'Parsed string.'),
  logMain: runtimeDoc('(Injected) Low-level logging sink.', ['Expects a JSON string and is normally called by log().'], ['value']),
  log: runtimeDoc('Wrapper: JSON-encode a value and send it to logMain.', [], ['value'], undefined, ['log({ event = "debug", value = value })']),
  reloadDisplay: runtimeDoc('(Injected) Reload the current chat display.', ['Requires SAFE id.'], ['id']),
  reloadChat: runtimeDoc('(Injected) Reload one chat message display.', ['Requires SAFE id.'], ['id', 'index']),
  similarity: runtimeDoc('(Injected) Run similarity search through HypaProcesser.', ['Requires LOW-LEVEL id.'], ['id', 'source', 'value'], 'Promise-like table resolving to matching text strings.'),
  request: runtimeDoc('(Injected) Perform an HTTPS GET request through native fetch.', ['Requires LOW-LEVEL id.'], ['id', 'url'], 'Promise-like table resolving to status and data.'),
  generateImage: runtimeDoc(
    '(Injected) Generate an image and return inlay markup.',
    ['Requires LOW-LEVEL id. The returned string can be inserted into chat content.'],
    ['id', 'value', 'negValue'],
    'Promise-like table resolving to image inlay markup.',
    ['local inlay = generateImage(id, "1girl, smile", "bad quality").await()\naddChat(id, "char", inlay)'],
  ),
  hash: runtimeDoc('(Injected) Compute SHA-256 for text.', [], ['id', 'value'], 'Promise-like table resolving to a hex hash string.'),
  LLMMain: runtimeDoc(
    '(Injected) Main model LLM call.',
    ['Requires LOW-LEVEL id. Prefer LLM() unless you need raw JSON string control.'],
    ['id', 'promptStr', 'useMultimodal'],
    'Promise-like table resolving to a JSON string: { success, result }.',
  ),
  axLLMMain: runtimeDoc(
    '(Injected) Secondary model LLM call.',
    ['Requires LOW-LEVEL id. Same raw JSON shape as LLMMain.'],
    ['id', 'promptStr', 'useMultimodal'],
    'Promise-like table resolving to a JSON string: { success, result }.',
  ),
  LLM: runtimeDoc(
    'Wrapper: LLM convenience function (main model).',
    ['Internally decodes LLMMain(id, json.encode(prompt), useMultimodal):await().'],
    ['id', 'prompt', 'useMultimodal'],
    'Result envelope with success and result text.',
    [
      [
        'local result = LLM(id, {',
        '  { role = "system", content = "Reply as JSON." },',
        '  { role = "user", content = lastMsg.data },',
        '})',
        'if result.success then',
        '  setChatVar(id, "emotion", result.result)',
        'end',
      ].join('\n'),
    ],
  ),
  axLLM: runtimeDoc(
    'Wrapper: axLLM convenience function (secondary model).',
    ['Use this when a script should call the configured secondary model instead of the main model.'],
    ['id', 'prompt', 'useMultimodal'],
    'Result envelope with success and result text.',
    [
      [
        'local result = axLLM(id, {',
        '  { role = "system", content = "Answer with one word: positive, negative, or neutral." },',
        '  { role = "user", content = text },',
        '})',
        'if result.success then',
        '  setChatVar(id, "sentiment", result.result)',
        'end',
      ].join('\n'),
    ],
  ),
  simpleLLM: runtimeDoc('(Injected) Simple low-level LLM call for a plain prompt string.', ['Requires LOW-LEVEL id.'], ['id', 'prompt'], 'Promise-like table resolving to { success, result }.'),
  getState: runtimeDoc(
    'Wrapper: get JSON-backed state from chat variables.',
    ['Uses getChatVar and json.decode internally. Store complex objects here instead of manual string parsing.'],
    ['id', 'name'],
    'Decoded Lua value, or nil/primitive/table depending on stored JSON.',
    ['local state = getState(id, "game")\nstate.turnCount = state.turnCount + 1\nsetState(id, "game", state)'],
  ),
  setState: runtimeDoc(
    'Wrapper: set JSON-backed state into chat variables.',
    ['Uses json.encode and setChatVar internally. Requires SAFE id through the setChatVar gate.'],
    ['id', 'name', 'value'],
  ),
  getLoreBooks: runtimeDoc('Wrapper: decode getLoreBooksMain JSON.', [], ['id', 'search'], 'Array-like table of matching lorebook entries.'),
  getLoreBooksMain: runtimeDoc('(Injected) Search lorebooks and return JSON.', [], ['id', 'search'], 'JSON string for matching lorebooks, or nil.'),
  loadLoreBooks: runtimeDoc(
    'Wrapper: decode active lorebooks from loadLoreBooksMain.',
    ['The wrapper does not forward reserve; call loadLoreBooksMain(id, reserve) directly for token budgeting.'],
    ['id'],
    'Array-like table of active lorebooks.',
  ),
  loadLoreBooksMain: runtimeDoc('(Injected) Load active lorebooks with token budgeting.', ['Requires LOW-LEVEL id.'], ['id', 'reserve'], 'Promise-like table resolving to lorebook JSON.'),
  listenEdit: runtimeDoc(
    'Wrapper: register edit listeners for prompt/display/input/output hooks.',
    ['Listeners run in sequence and may transform the current value.'],
    ['type', 'func'],
    undefined,
    ['listenEdit("editInput", function(id, value, meta)\n  return value\nend)'],
  ),
  async: runtimeDoc(
    'Wrapper: turn a callback into a Promise-like async function.',
    ['Use this for onOutput, onInput, and button handlers when awaiting runtime calls.'],
    ['callback'],
    'Function returning a RisuAI Promise-like table.',
  ),
  callListenMain: runtimeDoc('(Wrapper internal) Dispatch one edit listener pipeline.', [], ['type', 'id', 'value', 'meta'], 'Transformed listener value.'),
  getCharacterImage: runtimeDoc('Wrapper: await character image helper.', [], ['id'], 'Character image inlay markup string.'),
  getPersonaImage: runtimeDoc('Wrapper: await persona image helper.', [], ['id'], 'Persona image inlay markup string.'),
  onInput: runtimeDoc('Script hook: called before user input is sent.', ['Return false to stop sending.'], ['id'], 'Hook result consumed by the RisuAI script engine.'),
  onOutput: runtimeDoc('Script hook: called after AI output is received.', ['Return false to stop further processing.'], ['id'], 'Hook result consumed by the RisuAI script engine.'),
  onStart: runtimeDoc('Script hook: called when the script engine initializes for a chat.', [], ['id'], 'Hook result consumed by the RisuAI script engine.'),
  onButtonClick: runtimeDoc('Script hook: called when a registered UI button is clicked.', [], ['id', 'data'], 'Hook result consumed by the RisuAI script engine.'),
});

/**
 * runtimeDoc 함수.
 * runtime documentation catalog 항목을 짧고 일관된 형태로 생성함.
 *
 * @param summary - hover와 LuaDoc 첫 줄에 표시할 요약
 * @param details - summary 아래에 이어질 상세 설명 목록
 * @param parameterNames - 공통 parameter description catalog에서 가져올 파라미터 이름 목록
 * @param returns - 반환값 설명
 * @param examples - Lua 예제 코드 목록
 * @returns runtime documentation catalog 항목
 */
function runtimeDoc(
  summary: string,
  details: readonly string[] = [],
  parameterNames: readonly string[] = [],
  returns?: string,
  examples: readonly string[] = [],
): RisuAiLuaRuntimeDocumentation {
  return {
    summary,
    details,
    parameters: parameterNames.map((name) => ({
      name,
      description: PARAMETER_DESCRIPTIONS[name] ?? 'Runtime parameter.',
    })),
    returns,
    examples,
  };
}

/**
 * createFallbackRuntimeDocumentation 함수.
 * 상세 문서가 아직 없는 runtime global도 category/access 기반 최소 설명을 받게 함.
 *
 * @param globalName - 문서화할 runtime global 이름
 * @returns fallback runtime documentation catalog 항목
 */
function createFallbackRuntimeDocumentation(globalName: string): RisuAiLuaRuntimeDocumentation {
  const apiEntry = RISUAI_API[globalName];
  const details = apiEntry
    ? [`Category: ${apiEntry.cat}. Access: ${apiEntry.access}. Direction: ${apiEntry.rw}.`]
    : ['Runtime global exposed by the RisuAI Lua scripting environment.'];
  return runtimeDoc(`RisuAI runtime global: ${globalName}.`, details);
}

const RISUAI_RUNTIME_STUB_SIGNATURES = Object.freeze<Record<string, readonly string[]>>({
  Promise: [
    'Promise = {}',
    'function Promise.create(executor) end',
    'function Promise.resolve(value) end',
    'function Promise.all(values) end',
  ],
  json: ['json = {}', 'function json.encode(value) end', 'function json.decode(s) end'],
  getChatVar: [
    '---@type fun(id: string, key: string): string',
    'getChatVar = function(id, key) end',
  ],
  setChatVar: [
    '---@type fun(id: string, key: string, value: string)',
    'setChatVar = function(id, key, value) end',
  ],
  getGlobalVar: [
    '---@type fun(id: string, key: string): string',
    'getGlobalVar = function(id, key) end',
  ],
  alertError: ['---@type fun(id: string, value: string)', 'alertError = function(id, value) end'],
  alertNormal: ['---@type fun(id: string, value: string)', 'alertNormal = function(id, value) end'],
  alertInput: [
    '---@type fun(id: string, value: string): table',
    'alertInput = function(id, value) end',
  ],
  alertSelect: [
    '---@type fun(id: string, value: string[]): table',
    'alertSelect = function(id, value) end',
  ],
  alertConfirm: [
    '---@type fun(id: string, value: string): table',
    'alertConfirm = function(id, value) end',
  ],
  getChatMain: [
    '---@type fun(id: string, index: number): string',
    'getChatMain = function(id, index) end',
  ],
  getChat: [
    '---@type fun(id: string, index: number): table|nil',
    'getChat = function(id, index) end',
  ],
  getFullChatMain: ['---@type fun(id: string): string', 'getFullChatMain = function(id) end'],
  getFullChat: ['---@type fun(id: string): table[]', 'getFullChat = function(id) end'],
  setFullChatMain: [
    '---@type fun(id: string, value: string)',
    'setFullChatMain = function(id, value) end',
  ],
  setFullChat: ['---@type fun(id: string, value: table)', 'setFullChat = function(id, value) end'],
  setChat: [
    '---@type fun(id: string, index: number, value: string)',
    'setChat = function(id, index, value) end',
  ],
  setChatRole: [
    '---@type fun(id: string, index: number, value: string)',
    'setChatRole = function(id, index, value) end',
  ],
  cutChat: [
    '---@type fun(id: string, startIndex: number, endIndex: number)',
    'cutChat = function(id, startIndex, endIndex) end',
  ],
  removeChat: ['---@type fun(id: string, index: number)', 'removeChat = function(id, index) end'],
  addChat: [
    '---@type fun(id: string, role: string, value: string)',
    'addChat = function(id, role, value) end',
  ],
  insertChat: [
    '---@type fun(id: string, index: number, role: string, value: string)',
    'insertChat = function(id, index, role, value) end',
  ],
  getChatLength: ['---@type fun(id: string): number', 'getChatLength = function(id) end'],
  getTokens: [
    '---@type fun(id: string, value: string): table',
    'getTokens = function(id, value) end',
  ],
  sleep: ['---@type fun(id: string, time: number): table', 'sleep = function(id, time) end'],
  cbs: ['---@type fun(value: string): string', 'cbs = function(value) end'],
  logMain: ['---@type fun(value: string)', 'logMain = function(value) end'],
  log: ['---@type fun(value: any)', 'log = function(value) end'],
  reloadDisplay: ['---@type fun(id: string)', 'reloadDisplay = function(id) end'],
  reloadChat: ['---@type fun(id: string, index: number)', 'reloadChat = function(id, index) end'],
  similarity: [
    '---@type fun(id: string, source: string, value: string[]): table',
    'similarity = function(id, source, value) end',
  ],
  request: ['---@type fun(id: string, url: string): table', 'request = function(id, url) end'],
  generateImage: [
    '---@type fun(id: string, value: string, negValue?: string): table',
    'generateImage = function(id, value, negValue) end',
  ],
  hash: ['---@type fun(id: string, value: string): table', 'hash = function(id, value) end'],
  LLMMain: [
    '---@type fun(id: string, promptStr: string, useMultimodal?: boolean): table',
    'LLMMain = function(id, promptStr, useMultimodal) end',
  ],
  axLLMMain: [
    '---@type fun(id: string, promptStr: string, useMultimodal?: boolean): table',
    'axLLMMain = function(id, promptStr, useMultimodal) end',
  ],
  LLM: [
    '---@type fun(id: string, prompt: table, useMultimodal?: boolean): table',
    'LLM = function(id, prompt, useMultimodal) end',
  ],
  axLLM: [
    '---@type fun(id: string, prompt: table, useMultimodal?: boolean): table',
    'axLLM = function(id, prompt, useMultimodal) end',
  ],
  simpleLLM: [
    '---@type fun(id: string, prompt: string): table',
    'simpleLLM = function(id, prompt) end',
  ],
  getState: [
    '---@type fun(id: string, name: string): RisuStateValue',
    'getState = function(id, name) end',
  ],
  setState: [
    '---@type fun(id: string, name: string, value: RisuStateValue)',
    'setState = function(id, name, value) end',
  ],
  getLoreBooks: [
    '---@type fun(id: string, search: string): RisuLoreBook[]',
    'getLoreBooks = function(id, search) end',
  ],
  getLoreBooksMain: [
    '---@type fun(id: string, search: string): string|nil',
    'getLoreBooksMain = function(id, search) end',
  ],
  loadLoreBooks: ['---@type fun(id: string): table[]', 'loadLoreBooks = function(id) end'],
  loadLoreBooksMain: [
    '---@type fun(id: string, reserve: number): table',
    'loadLoreBooksMain = function(id, reserve) end',
  ],
  listenEdit: [
    '---@type fun(type: string, func: function)',
    'listenEdit = function(type, func) end',
  ],
  async: ['---@type fun(callback: function): function', 'async = function(callback) end'],
  callListenMain: [
    '---@type fun(type: string, id: string, value: any, meta: any): any',
    'callListenMain = function(type, id, value, meta) end',
  ],
});

const LUA_TYPE_FUNCTION_PATTERN = /^---@type fun\((?<params>.*)\)(?:: (?<returns>.+))?$/u;
const LUA_ASSIGNMENT_FUNCTION_PATTERN = /^(?<name>[A-Za-z_][A-Za-z0-9_]*) = function\((?<params>.*)\) end$/u;

/**
 * formatRuntimeSignature 함수.
 * LuaLS stub 선언 줄을 overlay hover용 compact signature 문자열로 변환함.
 *
 * @param globalName - signature를 만들 runtime global 이름
 * @param declarationLines - LuaLS stub에 쓰이는 선언 줄 목록
 * @returns hover에 표시할 compact signature
 */
function formatRuntimeSignature(globalName: string, declarationLines: readonly string[]): string {
  const typeLine = declarationLines.find((line) => line.startsWith('---@type fun('));
  const assignmentLine = declarationLines.find((line) => LUA_ASSIGNMENT_FUNCTION_PATTERN.test(line));
  const typeMatch = typeLine?.match(LUA_TYPE_FUNCTION_PATTERN);
  const assignmentMatch = assignmentLine?.match(LUA_ASSIGNMENT_FUNCTION_PATTERN);

  if (!typeMatch?.groups || !assignmentMatch?.groups) {
    return declarationLines.join('\n') || `${globalName}(...: any): any`;
  }

  const typedParams = typeMatch.groups.params;
  const returnType = typeMatch.groups.returns ?? 'void';
  const parameterNames = assignmentMatch.groups.params
    .split(',')
    .map((param) => param.trim())
    .filter(Boolean);
  const typeByName = new Map<string, string>();
  for (const typedParam of typedParams.split(',')) {
    const [name, type] = typedParam.split(':').map((part) => part.trim());
    if (name && type) {
      typeByName.set(name.replace(/\?$/u, ''), type);
    }
  }

  const formattedParams = parameterNames.map((paramName) => {
    const displayName = globalName === 'log' && paramName === 'value' ? 'message' : paramName;
    return `${displayName}: ${typeByName.get(paramName) ?? 'any'}`;
  });

  return `${globalName}(${formattedParams.join(', ')}): ${returnType}`;
}

/**
 * assertMinimalStubApiAvailability 함수.
 * 최소 LuaLS stub이 의존하는 API 이름이 core metadata에 존재하는지 확인함.
 *
 * @param apiNames - 현재 stub에서 노출하려는 API 이름 목록
 */
function assertMinimalStubApiAvailability(apiNames: readonly string[]): void {
  for (const apiName of apiNames) {
    if (!(apiName in RISUAI_API)) {
      throw new Error(`RisuAI Lua stub generation requires RISUAI_API[${apiName}] to exist.`);
    }
  }
}

/**
 * createMinimalRisuAiLuaTypeStub 함수.
 * LuaLS가 `workspace.library`로 읽을 RisuAI runtime definition file 본문을 생성함.
 *
 * @returns deterministic `risu-runtime.lua` file contents
 */
export function createMinimalRisuAiLuaTypeStub(): string {
  assertMinimalStubApiAvailability(REQUIRED_RISUAI_STUB_API_NAMES);

  return [
    '---@meta',
    '-- Generated by Risu Workbench to describe the upstream RisuAI Lua runtime surface for LuaLS.',
    '',
    '---@alias RisuStateValue nil|boolean|number|string|table',
    '',
    '---@class RisuLoreBookEntry',
    '---@field key? string',
    '---@field keys? string[]',
    '---@field content? string',
    '---@field comment? string',
    '---@field secondKey? string',
    '---@field enabled? boolean',
    '---@field regex? boolean',
    '',
    '---@class RisuLoreBook',
    '---@field name? string',
    '---@field insertorder? number',
    '---@field activated? boolean',
    '---@field entries RisuLoreBookEntry[]',
    '',
    ...createRisuAiRuntimeStubDeclarations(),
    '-- RisuAI runtime globals are also reachable through Lua global table member access.',
    ...createRisuAiGlobalTableAliases(),
    '',
  ].join('\n');
}

/**
 * getRisuAiLuaDiagnosticGlobals 함수.
 * upstream declareAPI와 luaCodeWrapper helper가 제공하는 known global 이름을 반환함.
 *
 * @returns LuaLS diagnostics.globals에 주입할 deterministic global 이름 목록
 */
export function getRisuAiLuaDiagnosticGlobals(): readonly string[] {
  return [
    ...new Set([
      ...Object.keys(RISUAI_API),
      ...RISUAI_EXTRA_INJECTED_GLOBAL_NAMES,
      ...RISUAI_WRAPPER_GLOBAL_NAMES,
      ...RISUAI_RUNTIME_NAMESPACE_NAMES,
      ...RISUAI_SCRIPT_HOOK_NAMES,
    ]),
  ].sort((left, right) => left.localeCompare(right));
}

/**
 * getRisuAiLuaRuntimeSignatures 함수.
 * RisuAI Lua runtime API hover/definition overlay가 재사용할 signature catalog를 반환함.
 *
 * @returns runtime global name별 Lua signature map
 */
export function getRisuAiLuaRuntimeSignatures(): ReadonlyMap<string, string> {
  return new Map(
    getRisuAiLuaDiagnosticGlobals().map((globalName) => [
      globalName,
      formatRuntimeSignature(
        globalName,
        RISUAI_RUNTIME_STUB_SIGNATURES[globalName] ?? createFallbackGlobalStub(globalName),
      ),
    ]),
  );
}

/**
 * getRisuAiLuaRuntimeDocumentation 함수.
 * RisuAI Lua runtime overlay와 generated stub가 공유할 문서 catalog를 반환함.
 *
 * @returns runtime global name별 documentation map
 */
export function getRisuAiLuaRuntimeDocumentation(): ReadonlyMap<string, RisuAiLuaRuntimeDocumentation> {
  return new Map(
    getRisuAiLuaDiagnosticGlobals().map((globalName) => [
      globalName,
      RISUAI_RUNTIME_DOCUMENTATION[globalName] ?? createFallbackRuntimeDocumentation(globalName),
    ]),
  );
}

/**
 * createRisuAiRuntimeStubDeclarations 함수.
 * known global 목록을 LuaLS `---@meta` stub 선언으로 변환함.
 *
 * @returns generated runtime global declaration lines
 */
function createRisuAiRuntimeStubDeclarations(): string[] {
  return getRisuAiLuaDiagnosticGlobals().flatMap((globalName) => [
    ...createLuaDocCommentLines(
      RISUAI_RUNTIME_DOCUMENTATION[globalName] ?? createFallbackRuntimeDocumentation(globalName),
    ),
    ...(RISUAI_RUNTIME_STUB_SIGNATURES[globalName] ?? createFallbackGlobalStub(globalName)),
    '',
  ]);
}

/**
 * createRisuAiGlobalTableAliases 함수.
 * `_G.axLLM` 같은 global table member access에서 LuaLS undefined-field 진단이 나지 않도록 alias를 생성함.
 *
 * @returns generated `_G.<name> = <name>` alias lines
 */
function createRisuAiGlobalTableAliases(): string[] {
  return getRisuAiLuaDiagnosticGlobals().map((globalName) => `_G.${globalName} = ${globalName}`);
}

/**
 * createLuaDocCommentLines 함수.
 * runtime documentation catalog 항목을 LuaLS가 읽을 수 있는 LuaDoc 주석으로 변환함.
 *
 * @param documentation - runtime global에 연결된 문서 항목
 * @returns LuaDoc 주석 라인 목록
 */
function createLuaDocCommentLines(documentation: RisuAiLuaRuntimeDocumentation | undefined): string[] {
  if (!documentation) {
    return [];
  }

  return [
    `--- ${documentation.summary}`,
    ...documentation.details.map((detail) => `--- ${detail}`),
    ...documentation.parameters.map((parameter) => `--- @param ${parameter.name} ${parameter.description}`),
    ...(documentation.returns ? [`--- @return ${documentation.returns}`] : []),
    ...documentation.examples.flatMap((example) =>
      example.split('\n').map((line, index) => `--- ${index === 0 ? '@usage ' : ''}${line}`),
    ),
  ];
}

/**
 * createFallbackGlobalStub 함수.
 * 상세 시그니처가 아직 없는 upstream global도 generic function으로 선언함.
 *
 * @param globalName - LuaLS에 알려줄 전역 이름
 * @returns generic function declaration lines
 */
function createFallbackGlobalStub(globalName: string): readonly string[] {
  return [`---@type fun(...: any): any`, `${globalName} = function(...) end`];
}
