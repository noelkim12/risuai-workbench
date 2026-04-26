/**
 * RisuAI Lua runtime globals를 LuaLS가 읽을 수 있는 stub 텍스트로 생성하는 유틸.
 * @file packages/core/src/domain/analyze/lua-type-stubs.ts
 */

import { RISUAI_API } from './lua-api';

export const RISUAI_LUA_RUNTIME_STUB_FILE_NAME = 'risu-runtime.lua';

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
 * createRisuAiRuntimeStubDeclarations 함수.
 * known global 목록을 LuaLS `---@meta` stub 선언으로 변환함.
 *
 * @returns generated runtime global declaration lines
 */
function createRisuAiRuntimeStubDeclarations(): string[] {
  return getRisuAiLuaDiagnosticGlobals().flatMap((globalName) => [
    ...(RISUAI_RUNTIME_STUB_SIGNATURES[globalName] ?? createFallbackGlobalStub(globalName)),
    '',
  ]);
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
