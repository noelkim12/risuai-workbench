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
  callback: 'RisuAI Lua runtime bridge를 통해 감싸거나 실행할 함수입니다.',
  data: 'RisuAI UI/runtime에서 전달하는 button identifier 또는 callback payload입니다.',
  endIndex: '작업이 멈추는 exclusive chat message index입니다.',
  func: 'RisuAI edit pipeline에서 호출되는 listener callback입니다.',
  id: 'RisuAI script callback에서 전달하는 안전한 runtime access key입니다.',
  index: '0-based chat message index입니다.',
  key: '선택한 RisuAI variable namespace 안의 variable key입니다.',
  meta: 'Edit listener pipeline이 제공하는 runtime metadata입니다.',
  name: '읽거나 쓸 state 또는 resource 이름입니다.',
  negValue: '이미지 생성을 위한 선택적 negative prompt입니다.',
  prompt: 'OpenAI-style prompt item array 또는 호환 table입니다.',
  promptStr: 'JSON으로 encode된 prompt item array string입니다.',
  reserve: 'Active lorebook을 로드하는 동안 남겨둘 token budget입니다.',
  role: '메시지에 부여할 chat role입니다.',
  search: 'Lorebook 검색 텍스트 또는 keyword입니다.',
  source: 'Similarity search 기준으로 쓰는 source text입니다.',
  startIndex: '작업이 시작되는 inclusive chat message index입니다.',
  time: '밀리초 단위 sleep duration입니다.',
  type: 'Listener 또는 runtime dispatch type입니다.',
  url: 'Native fetch wrapper를 통해 요청할 HTTPS URL입니다.',
  useMultimodal: 'Multimodal prompt 처리를 허용하는 선택적 flag입니다.',
  value: 'Runtime API로 전달하는 값입니다.',
});

const RISUAI_RUNTIME_DOCUMENTATION = Object.freeze<Record<string, RisuAiLuaRuntimeDocumentation>>({
  Promise: runtimeDoc(
    'wasmoon Promise bridge namespace입니다.',
    ['코루틴 기반 비동기 작업을 위해 create, resolve, all helper를 제공합니다.'],
    [],
    'Promise helper 함수가 들어 있는 namespace table입니다.',
    ['local both = Promise.all({ LLMMain(id, json.encode(prompt1)), LLMMain(id, json.encode(prompt2)) }).await()'],
  ),
  json: runtimeDoc(
    'Lua runtime에 마운트되는 JSON 모듈입니다.',
    ['Lua table과 JSON string 사이를 변환할 때 encode/decode를 사용합니다.'],
    [],
    'encode/decode 함수가 들어 있는 namespace table입니다.',
    ['local encoded = json.encode({ mood = "happy" })\nlocal decoded = json.decode(encoded)'],
  ),
  getChatVar: runtimeDoc('(Injected) 채팅별 변수를 가져옵니다.', [], ['id', 'key'], '저장된 문자열 값입니다.'),
  setChatVar: runtimeDoc(
    '(Injected) 채팅별 변수를 설정합니다.',
    ['SAFE id 또는 editDisplay runtime id가 필요합니다. 숫자는 저장 전에 문자열로 바꿉니다.'],
    ['id', 'key', 'value'],
    undefined,
    ['setChatVar(id, "mood", "happy")'],
  ),
  getGlobalVar: runtimeDoc('(Injected) 캐릭터가 공유하는 global 변수를 가져옵니다.', [], ['id', 'key'], '저장된 문자열 값입니다.'),
  alertError: runtimeDoc('(Injected) 사용자에게 error alert를 표시합니다.', ['SAFE id가 필요합니다.'], ['id', 'value']),
  alertNormal: runtimeDoc('(Injected) 사용자에게 normal alert를 표시합니다.', ['SAFE id가 필요합니다.'], ['id', 'value']),
  alertInput: runtimeDoc(
    '(Injected) 사용자에게 텍스트 입력을 요청합니다.',
    ['SAFE id가 필요하며 비동기로 resolve됩니다.'],
    ['id', 'value'],
    '입력된 문자열로 resolve되는 Promise 유사 table입니다.',
    ['local userInput = alertInput(id, "Enter message").await()'],
  ),
  alertSelect: runtimeDoc(
    '(Injected) 선택 dialog를 표시합니다.',
    ['SAFE id가 필요하며 선택된 option으로 resolve됩니다.'],
    ['id', 'value'],
    '선택된 문자열로 resolve되는 Promise 유사 table입니다.',
  ),
  alertConfirm: runtimeDoc(
    '(Injected) 확인 dialog를 표시합니다.',
    ['SAFE id가 필요하며 true/false로 resolve됩니다.'],
    ['id', 'value'],
    'boolean으로 resolve되는 Promise 유사 table입니다.',
    ['local ok = alertConfirm(id, "Delete this item?").await()'],
  ),
  getChatMain: runtimeDoc('(Injected) 채팅 메시지 하나를 JSON string으로 가져옵니다.', [], ['id', 'index'], 'JSON string 또는 "null"입니다.'),
  getChat: runtimeDoc(
    'Wrapper: getChatMain JSON을 채팅 메시지 table로 decode합니다.',
    ['해당 index에 메시지가 없으면 nil을 반환합니다.'],
    ['id', 'index'],
    '채팅 메시지 table 또는 nil입니다.',
    ['local msg = getChat(id, 0)\nif msg then log(msg.data) end'],
  ),
  getFullChatMain: runtimeDoc('(Injected) 전체 채팅을 JSON string으로 가져옵니다.', [], ['id'], '채팅 메시지를 담은 JSON string입니다.'),
  getFullChat: runtimeDoc(
    'Wrapper: getFullChatMain JSON을 chat array로 decode합니다.',
    [],
    ['id'],
    '채팅 메시지의 array 유사 table입니다.',
  ),
  setFullChatMain: runtimeDoc('(Injected) JSON string으로 전체 채팅을 교체합니다.', ['SAFE id가 필요합니다.'], ['id', 'value']),
  setFullChat: runtimeDoc(
    'Wrapper: 전체 채팅을 JSON encode한 뒤 교체합니다.',
    ['SAFE id가 필요합니다. Decode된 chat table을 편집할 때는 이 wrapper를 우선 사용합니다.'],
    ['id', 'value'],
  ),
  setChat: runtimeDoc('(Injected) 채팅 메시지 하나의 텍스트를 교체합니다.', ['SAFE id가 필요합니다.'], ['id', 'index', 'value']),
  setChatRole: runtimeDoc('(Injected) 채팅 메시지 하나의 role을 교체합니다.', ['SAFE id가 필요합니다.'], ['id', 'index', 'value']),
  cutChat: runtimeDoc('(Injected) 채팅 메시지 범위를 제거합니다.', ['SAFE id가 필요합니다.'], ['id', 'startIndex', 'endIndex']),
  removeChat: runtimeDoc('(Injected) 채팅 메시지 하나를 제거합니다.', ['SAFE id가 필요합니다.'], ['id', 'index']),
  addChat: runtimeDoc('(Injected) 채팅 메시지를 끝에 추가합니다.', ['SAFE id가 필요합니다.'], ['id', 'role', 'value']),
  insertChat: runtimeDoc('(Injected) 지정한 index에 채팅 메시지를 삽입합니다.', ['SAFE id가 필요합니다.'], ['id', 'index', 'role', 'value']),
  getChatLength: runtimeDoc('(Injected) 채팅 메시지 개수를 가져옵니다.', [], ['id'], '채팅 메시지 개수입니다.'),
  getTokens: runtimeDoc(
    '(Injected) 텍스트의 token 수를 계산합니다.',
    ['SAFE id가 필요하며 비동기로 resolve됩니다.'],
    ['id', 'value'],
    'token 수로 resolve되는 Promise 유사 table입니다.',
  ),
  sleep: runtimeDoc('(Injected) 지정한 시간 동안 대기합니다.', ['SAFE id가 필요하며 비동기로 resolve됩니다.'], ['id', 'time'], '지연 후 resolve되는 Promise 유사 table입니다.'),
  cbs: runtimeDoc('(Injected) 텍스트를 RisuAI chat parser로 처리합니다.', [], ['value'], '파싱된 문자열입니다.'),
  logMain: runtimeDoc('(Injected) low-level logging sink입니다.', ['JSON string을 기대하며 보통 log()가 호출합니다.'], ['value']),
  log: runtimeDoc('Wrapper: 값을 JSON encode해서 logMain으로 보냅니다.', [], ['value'], undefined, ['log({ event = "debug", value = value })']),
  reloadDisplay: runtimeDoc('(Injected) 현재 채팅 display를 다시 로드합니다.', ['SAFE id가 필요합니다.'], ['id']),
  reloadChat: runtimeDoc('(Injected) 채팅 메시지 하나의 display를 다시 로드합니다.', ['SAFE id가 필요합니다.'], ['id', 'index']),
  similarity: runtimeDoc('(Injected) HypaProcesser로 similarity search를 실행합니다.', ['LOW-LEVEL id가 필요합니다.'], ['id', 'source', 'value'], '일치하는 텍스트 문자열로 resolve되는 Promise 유사 table입니다.'),
  request: runtimeDoc('(Injected) native fetch로 HTTPS GET request를 수행합니다.', ['LOW-LEVEL id가 필요합니다.'], ['id', 'url'], 'status와 data로 resolve되는 Promise 유사 table입니다.'),
  generateImage: runtimeDoc(
    '(Injected) 이미지를 생성하고 inlay markup을 반환합니다.',
    ['LOW-LEVEL id가 필요합니다. 반환 문자열은 chat content에 삽입할 수 있습니다.'],
    ['id', 'value', 'negValue'],
    'image inlay markup으로 resolve되는 Promise 유사 table입니다.',
    ['local inlay = generateImage(id, "1girl, smile", "bad quality").await()\naddChat(id, "char", inlay)'],
  ),
  hash: runtimeDoc('(Injected) 텍스트의 SHA-256을 계산합니다.', [], ['id', 'value'], 'hex hash string으로 resolve되는 Promise 유사 table입니다.'),
  LLMMain: runtimeDoc(
    '(Injected) main model LLM 호출입니다.',
    ['LOW-LEVEL id가 필요합니다. Raw JSON string 제어가 필요하지 않다면 LLM()을 우선 사용합니다.'],
    ['id', 'promptStr', 'useMultimodal'],
    'JSON string으로 resolve되는 Promise 유사 table입니다. Shape는 { success, result }입니다.',
  ),
  axLLMMain: runtimeDoc(
    '(Injected) secondary model LLM 호출입니다.',
    ['LOW-LEVEL id가 필요합니다. Raw JSON shape는 LLMMain과 같습니다.'],
    ['id', 'promptStr', 'useMultimodal'],
    'JSON string으로 resolve되는 Promise 유사 table입니다. Shape는 { success, result }입니다.',
  ),
  LLM: runtimeDoc(
    'Wrapper: main model을 호출하는 LLM 편의 함수입니다.',
    ['내부에서 LLMMain(id, json.encode(prompt), useMultimodal):await() 결과를 decode합니다.'],
    ['id', 'prompt', 'useMultimodal'],
    'success와 result text를 담은 result envelope입니다.',
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
    'Wrapper: secondary model을 호출하는 axLLM 편의 함수입니다.',
    ['스크립트가 main model 대신 설정된 secondary model을 호출해야 할 때 사용합니다.'],
    ['id', 'prompt', 'useMultimodal'],
    'success와 result text를 담은 result envelope입니다.',
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
  simpleLLM: runtimeDoc('(Injected) plain prompt string을 위한 단순 low-level LLM 호출입니다.', ['LOW-LEVEL id가 필요합니다.'], ['id', 'prompt'], '{ success, result }로 resolve되는 Promise 유사 table입니다.'),
  getState: runtimeDoc(
    'Wrapper: chat variable에서 JSON 기반 state를 가져옵니다.',
    ['내부에서 getChatVar와 json.decode를 사용합니다. 복잡한 객체는 문자열을 직접 파싱하지 말고 여기에 저장합니다.'],
    ['id', 'name'],
    '저장된 JSON에 따라 decode된 Lua value, nil, primitive, table 중 하나입니다.',
    ['local state = getState(id, "game")\nstate.turnCount = state.turnCount + 1\nsetState(id, "game", state)'],
  ),
  setState: runtimeDoc(
    'Wrapper: JSON 기반 state를 chat variable에 설정합니다.',
    ['내부에서 json.encode와 setChatVar를 사용합니다. setChatVar gate를 통과하는 SAFE id가 필요합니다.'],
    ['id', 'name', 'value'],
  ),
  getLoreBooks: runtimeDoc('Wrapper: getLoreBooksMain JSON을 decode합니다.', [], ['id', 'search'], '일치하는 lorebook entry의 array 유사 table입니다.'),
  getLoreBooksMain: runtimeDoc('(Injected) lorebook을 검색하고 JSON을 반환합니다.', [], ['id', 'search'], '일치하는 lorebook의 JSON string 또는 nil입니다.'),
  loadLoreBooks: runtimeDoc(
    'Wrapper: loadLoreBooksMain에서 active lorebook을 decode합니다.',
    ['이 wrapper는 reserve를 전달하지 않습니다. Token budget을 조정하려면 loadLoreBooksMain(id, reserve)를 직접 호출합니다.'],
    ['id'],
    'active lorebook의 array 유사 table입니다.',
  ),
  loadLoreBooksMain: runtimeDoc('(Injected) token budget을 적용해 active lorebook을 로드합니다.', ['LOW-LEVEL id가 필요합니다.'], ['id', 'reserve'], 'lorebook JSON으로 resolve되는 Promise 유사 table입니다.'),
  listenEdit: runtimeDoc(
    'Wrapper: prompt/display/input/output hook의 edit listener를 등록합니다.',
    ['Listener는 순서대로 실행되며 현재 값을 변환할 수 있습니다.'],
    ['type', 'func'],
    undefined,
    ['listenEdit("editInput", function(id, value, meta)\n  return value\nend)'],
  ),
  async: runtimeDoc(
    'Wrapper: callback을 Promise 유사 async 함수로 바꿉니다.',
    ['Runtime 호출을 await해야 하는 onOutput, onInput, button handler에서 사용합니다.'],
    ['callback'],
    'RisuAI Promise 유사 table을 반환하는 함수입니다.',
  ),
  callListenMain: runtimeDoc('(Wrapper internal) edit listener pipeline 하나를 dispatch합니다.', [], ['type', 'id', 'value', 'meta'], '변환된 listener 값입니다.'),
  getCharacterImage: runtimeDoc('Wrapper: character image helper를 await합니다.', [], ['id'], 'Character image inlay markup string입니다.'),
  getPersonaImage: runtimeDoc('Wrapper: persona image helper를 await합니다.', [], ['id'], 'Persona image inlay markup string입니다.'),
  onInput: runtimeDoc('Script hook: 사용자 입력이 전송되기 전에 호출됩니다.', ['전송을 중단하려면 false를 반환합니다.'], ['id'], 'RisuAI script engine이 소비하는 hook 결과입니다.'),
  onOutput: runtimeDoc('Script hook: AI output을 받은 뒤 호출됩니다.', ['이후 처리를 중단하려면 false를 반환합니다.'], ['id'], 'RisuAI script engine이 소비하는 hook 결과입니다.'),
  onStart: runtimeDoc('Script hook: 채팅의 script engine이 초기화될 때 호출됩니다.', [], ['id'], 'RisuAI script engine이 소비하는 hook 결과입니다.'),
  onButtonClick: runtimeDoc('Script hook: 등록된 UI button이 클릭될 때 호출됩니다.', [], ['id', 'data'], 'RisuAI script engine이 소비하는 hook 결과입니다.'),
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
      description: PARAMETER_DESCRIPTIONS[name] ?? 'Runtime parameter입니다.',
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
    ? [`Category는 ${apiEntry.cat}, access는 ${apiEntry.access}, direction은 ${apiEntry.rw}입니다.`]
    : ['RisuAI Lua scripting environment가 노출하는 runtime global입니다.'];
  return runtimeDoc(`RisuAI runtime global ${globalName}입니다.`, details);
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
