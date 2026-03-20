/**
 * API 메타데이터 정보를 담는 타입이에요.
 */
export type ApiMeta = {
  /** API 카테고리 (state, chat, ui 등) */
  cat: string;
  /** 접근 수준 (safe, wrapper, low-level 등) */
  access: string;
  /** 읽기/쓰기 구분 */
  rw: 'read' | 'write';
};

/**
 * RisuAI에서 제공하는 주요 Lua API 함수들의 메타데이터 정의에요.
 */
export const RISUAI_API: Record<string, ApiMeta> = {
  getChatVar: { cat: 'state', access: 'injected', rw: 'read' },
  setChatVar: { cat: 'state', access: 'safe', rw: 'write' },
  getState: { cat: 'state', access: 'wrapper', rw: 'read' },
  setState: { cat: 'state', access: 'wrapper', rw: 'write' },
  getGlobalVar: { cat: 'state', access: 'injected', rw: 'read' },
  getChat: { cat: 'chat', access: 'wrapper', rw: 'read' },
  getFullChat: { cat: 'chat', access: 'wrapper', rw: 'read' },
  setChat: { cat: 'chat', access: 'safe', rw: 'write' },
  setFullChat: { cat: 'chat', access: 'safe', rw: 'write' },
  getChatLength: { cat: 'chat', access: 'injected', rw: 'read' },
  addChat: { cat: 'chat', access: 'safe', rw: 'write' },
  removeChat: { cat: 'chat', access: 'safe', rw: 'write' },
  cutChat: { cat: 'chat', access: 'safe', rw: 'write' },
  insertChat: { cat: 'chat', access: 'safe', rw: 'write' },
  reloadChat: { cat: 'chat', access: 'safe', rw: 'write' },
  reloadDisplay: { cat: 'ui', access: 'safe', rw: 'write' },
  alertNormal: { cat: 'ui', access: 'safe', rw: 'write' },
  alertError: { cat: 'ui', access: 'safe', rw: 'write' },
  alertInput: { cat: 'ui', access: 'safe', rw: 'write' },
  alertSelect: { cat: 'ui', access: 'safe', rw: 'write' },
  alertConfirm: { cat: 'ui', access: 'safe', rw: 'write' },
  generateImage: { cat: 'ai', access: 'low-level', rw: 'write' },
  LLM: { cat: 'ai', access: 'low-level', rw: 'write' },
  LLMMain: { cat: 'ai', access: 'low-level', rw: 'write' },
  axLLM: { cat: 'ai', access: 'low-level', rw: 'write' },
  axLLMMain: { cat: 'ai', access: 'low-level', rw: 'write' },
  simpleLLM: { cat: 'ai', access: 'low-level', rw: 'write' },
  getName: { cat: 'character', access: 'injected', rw: 'read' },
  setName: { cat: 'character', access: 'safe', rw: 'write' },
  getDescription: { cat: 'character', access: 'safe', rw: 'read' },
  setDescription: { cat: 'character', access: 'safe', rw: 'write' },
  getPersonaName: { cat: 'character', access: 'injected', rw: 'read' },
  getPersonaDescription: { cat: 'character', access: 'injected', rw: 'read' },
  getCharacterImage: { cat: 'character', access: 'wrapper', rw: 'read' },
  getPersonaImage: { cat: 'character', access: 'wrapper', rw: 'read' },
  getCharacterFirstMessage: { cat: 'character', access: 'injected', rw: 'read' },
  getCharacterLastMessage: { cat: 'character', access: 'injected', rw: 'read' },
  getUserLastMessage: { cat: 'character', access: 'injected', rw: 'read' },
  getLoreBooks: { cat: 'lore', access: 'wrapper', rw: 'read' },
  loadLoreBooks: { cat: 'lore', access: 'wrapper', rw: 'read' },
  upsertLocalLoreBook: { cat: 'lore', access: 'safe', rw: 'write' },
  stopChat: { cat: 'control', access: 'safe', rw: 'write' },
  getTokens: { cat: 'utility', access: 'safe', rw: 'read' },
  sleep: { cat: 'utility', access: 'safe', rw: 'write' },
  log: { cat: 'utility', access: 'wrapper', rw: 'write' },
  cbs: { cat: 'utility', access: 'injected', rw: 'read' },
  listenEdit: { cat: 'event', access: 'wrapper', rw: 'write' },
  async: { cat: 'utility', access: 'wrapper', rw: 'read' },
  request: { cat: 'network', access: 'low-level', rw: 'read' },
  similarity: { cat: 'ai', access: 'low-level', rw: 'read' },
  hash: { cat: 'utility', access: 'low-level', rw: 'read' },
};

/**
 * Lua 표준 라이브러리 함수들 중 분석 시 무시하거나 식별할 함수 목록이에요.
 */
export const LUA_STDLIB_CALLS = new Set([
  'string', 'table', 'math', 'os', 'pcall', 'tostring', 'tonumber', 'type', 'ipairs', 'pairs', 'next', 'select', 'unpack', 'print', 'error', 'assert',
]);
