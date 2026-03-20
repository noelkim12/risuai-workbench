/* Risuai Lua scripting ambient declarations for TypeScriptToLua (tstl)
 *
 * Based on:
 * - Injected globals via declareAPI(...) in src/ts/process/scriptings.ts
 * - Lua helper globals created by luaCodeWrapper(...) in same file
 *
 * Notes:
 * - Many functions require "safe" or "low-level" access at runtime via an accessKey (id).
 *   This is enforced in JS, not by types. We document it in comments.
 * - The Lua runtime uses wasmoon and a Promise bridge that supports :await() in Lua.
 *   We model a minimal Promise-like interface below.
 */

/** Minimal promise-like object used in Risuai Lua wrapper (supports `:await()` and `:finally(cb)`). */
declare interface RisuaiPromise<T = unknown> {
  /** Blocks/awaits in Lua wrapper style (`promise:await()`). */
  await(): T;

  /** Attaches a finally handler (used by wrapper's async implementation). */
  finally(cb: (...args: any[]) => any): RisuaiPromise<T>;
}

/** Chat roles used by the internal chat model. */
declare type RisuaiChatRole = "user" | "char";

/** A single chat message shape used by wrapper helpers (decoded from JSON). */
declare interface RisuaiChatMessage {
  role: RisuaiChatRole;
  data: string;
  time?: number;
}

/** Common result envelope used by LLM helpers (decoded from JSON in wrapper). */
declare interface RisuaiLLMResult {
  success: boolean;
  result: string;
}

/**
 * Multi-modal attachment shape.
 * Matches the MultiModal interface in src/ts/process/index.svelte.ts.
 */
declare interface RisuaiMultiModal {
  type: "image" | "video" | "audio";
  base64: string;
  width?: number;
  height?: number;
}

/**
 * OpenAI-style chat message shape.
 * Matches the OpenAIChat interface in src/ts/process/index.svelte.ts.
 * This is the format received by `editRequest` listeners and used by LLMMain/axLLMMain.
 */
declare interface RisuaiOpenAIChat {
  role: "system" | "user" | "assistant" | "function";
  content: string;
  memo?: string;
  name?: string;
  removable?: boolean;
  attr?: string[];
  multimodals?: RisuaiMultiModal[];
  thoughts?: string[];
  cachePoint?: boolean;
}

/** A chat prompt item (best-effort, matches usage in scriptings.ts). */
declare interface RisuaiPromptItem {
  role: "system" | "sys" | "user" | "assistant" | "bot" | "char";
  content: string;
  multimodals?: RisuaiMultiModal[];
}

/** Edit-listener types supported by wrapper. */
declare type RisuaiEditListenType = "editRequest" | "editDisplay" | "editInput" | "editOutput";

/* -------------------------------------------------------------------------------------------------
 * Injected API (JS -> Lua globals via declareAPI)
 * These are the raw low-level globals the wrapper builds on.
 * ------------------------------------------------------------------------------------------------- */

/**
 * (Injected) Get per-chat variable.
 * @example
 * const mood = getChatVar(id, "mood");
 * // 주의: 값이 없으면 빈 문자열 또는 undefined 반환. 안전한 접근은 utils/risuai.ts의 getChatVarOr() 사용 권장.
 */
declare function getChatVar(id: string, key: string): string;
/**
 * (Injected) Set per-chat variable. Requires SAFE id OR editDisplay id at runtime.
 * @example
 * setChatVar(id, "mood", "happy");
 * // 숫자 저장 시 tostring() 필수: setChatVar(id, "score", tostring(75));
 */
declare function setChatVar(id: string, key: string, value: string): void;
/**
 * (Injected) Get global variable (전체 캐릭터 공유).
 * @example
 * const lang = getGlobalVar(id, "language");
 */
declare function getGlobalVar(id: string, key: string): string;

/** (Injected) Stop sending / stop chat generation. Requires SAFE id. */
declare function stopChat(id: string): void;

/**
 * (Injected) UI alerts. Require SAFE id.
 * @example
 * alertError(id, "치명적 오류가 발생했습니다.");
 * alertNormal(id, "저장이 완료되었습니다.");
 */
declare function alertError(id: string, value: string): void;
declare function alertNormal(id: string, value: string): void;

/**
 * (Injected) Prompt the user for text input. Requires SAFE id.
 * Resolves with the entered string.
 * @example
 * // 사용자 입력을 받아 메시지로 전송
 * const userInput = alertInput(id, "메시지를 입력하세요").await();
 * if (userInput && userInput !== "") {
 *   addChat(id, "user", userInput);
 * }
 */
declare function alertInput(id: string, value: string): Promise<string> | RisuaiPromise<string>;

/**
 * (Injected) Show a selection dialog. Requires SAFE id.
 * Resolves with the selected option string.
 * @example
 * const choice = alertSelect(id, ["옵션A", "옵션B", "옵션C"]).await();
 */
declare function alertSelect(id: string, value: string[]): Promise<string> | RisuaiPromise<string>;

/**
 * (Injected) Confirm dialog. Requires SAFE id.
 * @example
 * // 위험한 작업 전 확인
 * const ok = alertConfirm(id, "정말 삭제하시겠습니까?").await();
 * if (!ok) return;
 */
declare function alertConfirm(id: string, value: string): Promise<boolean> | RisuaiPromise<boolean>;

/** (Injected) Get a single chat message as JSON string (or "null"). */
declare function getChatMain(id: string, index: number): string;

/**
 * (Injected) Chat mutation helpers. Require SAFE id.
 *
 * @example
 * // 마지막 메시지 텍스트 교체
 * const chatLen = getChatLength(id);
 * setChat(id, chatLen - 1, "새로운 메시지 내용");
 *
 * @example
 * // 메시지 추가 후 불필요한 메시지 제거
 * addChat(id, "char", "캐릭터 응답 텍스트");
 * removeChat(id, oldIndex);
 *
 * @example
 * // 특정 위치에 메시지 삽입
 * insertChat(id, 2, "user", "중간에 삽입된 메시지");
 */
declare function setChat(id: string, index: number, value: string): void;
declare function setChatRole(id: string, index: number, value: string): void;
declare function cutChat(id: string, start: number, end: number): void;
declare function removeChat(id: string, index: number): void;
declare function addChat(id: string, role: string, value: string): void;
declare function insertChat(id: string, index: number, role: string, value: string): void;

/**
 * (Injected) Tokenizer. Requires SAFE id. Returns token count.
 * @example
 * // 토큰 수 기반 텍스트 잘라내기
 * const tokens = getTokens(id, longText).await();
 * if (tokens > 2000) {
 *   // 텍스트 줄이기 로직
 * }
 */
declare function getTokens(id: string, value: string): Promise<number> | RisuaiPromise<number>;

/** (Injected) Get chat length. */
declare function getChatLength(id: string): number;

/** (Injected) Get full chat as JSON string. */
declare function getFullChatMain(id: string): string;
/** (Injected) Set full chat from JSON string. Requires SAFE id. */
declare function setFullChatMain(id: string, value: string): void;

/** (Injected) Sleep helper. Requires SAFE id. */
declare function sleep(id: string, time: number): Promise<true> | RisuaiPromise<true>;

/** (Injected) Chat parser helper (runs risuChatParser). No access check required. */
declare function cbs(value: string): string;

/** (Injected) Logging: expects JSON string, parses then logs. */
declare function logMain(value: string): void;

/** (Injected) Reload UI. Requires SAFE id. */
declare function reloadDisplay(id: string): void;
declare function reloadChat(id: string, index: number): void;

/* -------- Low-level access required (ScriptingLowLevelIds) -------- */

/** (Injected) Similarity search via HypaProcesser. Requires LOW-LEVEL id. Returns matching text strings. */
declare function similarity(id: string, source: string, value: string[]): Promise<string[]> | RisuaiPromise<string[]>;

/**
 * (Injected) HTTPS GET request via native fetch wrapper.
 * Requires LOW-LEVEL id.
 * Returns a JSON string: { status: number, data: string }
 */
declare function request(id: string, url: string): Promise<string> | RisuaiPromise<string>;

/**
 * (Injected) Generate image and return inlay markup string.
 * Requires LOW-LEVEL id.
 * Returns something like "{{inlay::...}}"
 *
 * @example
 * // 프롬프트 기반 이미지 생성
 * const prompt = "1girl, smile, outdoors";
 * const negPrompt = "bad quality, worst quality";
 * const [ok, inlay] = pcall(() => generateImage(id, prompt, negPrompt).await());
 * if (ok) {
 *   addChat(id, "char", inlay);
 * }
 *
 * @example
 * // 기존 메시지에 이미지 삽입
 * const result = generateImage(id, prompt).await();
 * const chatLen = getChatLength(id);
 * const lastMsg = getChat(id, chatLen - 1);
 * if (lastMsg) {
 *   setChat(id, chatLen - 1, lastMsg.data + "\n" + result);
 * }
 */
declare function generateImage(
  id: string,
  value: string,
  negValue?: string
): Promise<string> | RisuaiPromise<string>;

/** (Injected) Get character/persona image inlay markup. */
declare function getCharacterImageMain(id: string): Promise<string> | RisuaiPromise<string>;
declare function getPersonaImageMain(id: string): Promise<string> | RisuaiPromise<string>;

/** (Injected) SHA-256 hash helper. No access check required. Returns hex-encoded hash string. */
declare function hash(id: string, value: string): Promise<string> | RisuaiPromise<string>;

/**
 * (Injected) LLM call (메인 모델).
 * Requires LOW-LEVEL id.
 * Accepts promptStrJson: JSON string of prompt items.
 * Returns JSON string: { success: boolean, result: string }
 *
 * 일반적으로는 래퍼 함수 `LLM()`을 사용하세요. 직접 사용은 특수한 경우에만.
 */
declare function LLMMain(
  id: string,
  promptStr: string,
  useMultimodal?: boolean
): Promise<string> | RisuaiPromise<string>;

/** (Injected) Alternate LLM call. Requires LOW-LEVEL id. Same shape as LLMMain. */
declare function axLLMMain(
  id: string,
  promptStr: string,
  useMultimodal?: boolean
): Promise<string> | RisuaiPromise<string>;

/**
 * (Injected) Simple LLM call.
 * Requires LOW-LEVEL id.
 * Note: In TS it returns an object (not JSON string). Lua marshalling depends on wasmoon.
 */
declare function simpleLLM(
  id: string,
  prompt: string
): Promise<RisuaiLLMResult> | RisuaiPromise<RisuaiLLMResult>;

/* -------- Character/persona helpers -------- */

declare function getName(id: string): string;
/** Requires SAFE id. */
declare function setName(id: string, name: string): void;

/** Requires SAFE id. Throws if character is a group. */
declare function getDescription(id: string): string;
/** Requires SAFE id. */
declare function setDescription(id: string, desc: string): void;

declare function getCharacterFirstMessage(id: string): string;
/** Requires SAFE id. Returns true on success, false/void otherwise. */
declare function setCharacterFirstMessage(id: string, data: string): boolean | void;

declare function getPersonaName(id: string): string;
declare function getPersonaDescription(id: string): string;

declare function getAuthorsNote(id: string): string;

/** Requires SAFE id. */
declare function getBackgroundEmbedding(id: string): string;
/** Requires SAFE id. Returns true on success, false/void otherwise. */
declare function setBackgroundEmbedding(id: string, data: string): boolean | void;

/* -------- Lore books -------- */

/** Returns JSON string for found lore books (or void). */
declare function getLoreBooksMain(id: string, search: string): string | void;

/** Upsert local lorebook. Requires SAFE id. */
declare function upsertLocalLoreBook(
  id: string,
  name: string,
  content: string,
  options: {
    alwaysActive?: boolean;
    insertOrder?: number;
    key?: string;
    secondKey?: string;
    regex?: boolean;
  }
): void;

/**
 * Load active lorebooks with token budgeting.
 * Requires LOW-LEVEL id.
 * Returns JSON string (array).
 */
declare function loadLoreBooksMain(id: string, reserve: number): Promise<string> | RisuaiPromise<string>;

/* -------- Last message helpers (injected; declared once despite duplicate registration in code) -------- */

declare function getCharacterLastMessage(id: string): string;
declare function getUserLastMessage(id: string): string;

/* -------------------------------------------------------------------------------------------------
 * Wrapper helper API (Lua-side globals created by luaCodeWrapper)
 * These are what script authors are expected to use directly.
 * ------------------------------------------------------------------------------------------------- */

/**
 * Wrapper: decode getChatMain JSON into an object (or null).
 * @example
 * const msg = getChat(id, 0);
 * if (msg) {
 *   log(`[${msg.role}] ${msg.data}`);
 * }
 */
declare function getChat(id: string, index: number): RisuaiChatMessage | null;

/**
 * Wrapper: decode getFullChatMain JSON into an array.
 * @example
 * // 전체 채팅에서 마지막 메시지 접근
 * const chat = getFullChat(id);
 * const lastMsg = chat[chat.length - 1];
 * if (lastMsg.role === "char") {
 *   // 캐릭터 응답 후처리
 * }
 */
declare function getFullChat(id: string): RisuaiChatMessage[];

/**
 * Wrapper: encode and set full chat. Requires SAFE id.
 * @example
 * // 특정 메시지의 태그 수정 후 전체 채팅 갱신
 * const chat = getFullChat(id);
 * chat[targetIndex].data = newContent;
 * setFullChat(id, chat);
 */
declare function setFullChat(id: string, value: RisuaiChatMessage[] | unknown): void;

/** Wrapper: JSON-encode then log via logMain. */
declare function log(value: unknown): void;

/**
 * Wrapper: decode getLoreBooksMain JSON.
 * @example
 * // 키워드로 로어북 검색
 * const books = getLoreBooks(id, "마법 체계");
 * for (const book of books) {
 *   log(book);
 * }
 */
declare function getLoreBooks(id: string, search: string): unknown[];

/**
 * Wrapper: decode loadLoreBooksMain(id):await().
 * NOTE: The Lua wrapper does NOT forward a `reserve` parameter to loadLoreBooksMain,
 * so the JS side receives `undefined` for reserve, causing ALL lorebooks to load
 * without token budgeting. Call loadLoreBooksMain(id, reserve) directly if needed.
 */
declare function loadLoreBooks(id: string): unknown[];

/**
 * Wrapper: LLM convenience function (메인 모델).
 * Internally: json.decode(LLMMain(id, json.encode(prompt), useMultimodal):await())
 *
 * @example
 * // 시스템 + 유저 프롬프트로 LLM 호출
 * const result = LLM(id, [
 *   { role: "system", content: "당신은 감정 분석기입니다. JSON으로 답하세요." },
 *   { role: "user", content: lastMsg.data },
 * ]);
 * if (result.success) {
 *   const parsed = json.decode<{ emotion: string }>(result.result);
 *   setChatVar(id, "emotion", parsed.emotion);
 * }
 *
 * @example
 * // Promise.all로 병렬 LLM 호출 (async 핸들러 내에서)
 * const [r1, r2] = Promise.all([
 *   LLMMain(id, json.encode(prompt1)),
 *   LLMMain(id, json.encode(prompt2)),
 * ]).await();
 */
declare function LLM(
  id: string,
  prompt: RisuaiPromptItem[] | unknown,
  useMultimodal?: boolean
): RisuaiLLMResult;

/**
 * Wrapper: axLLM convenience function (보조 모델 — 설정에서 지정한 Secondary Model).
 * 메인 모델과 다른 모델로 호출할 때 사용.
 *
 * @example
 * // 보조 모델로 짧은 판단 요청
 * const result = axLLM(id, [
 *   { role: "system", content: "한 단어로 답하세요: 긍정/부정/중립" },
 *   { role: "user", content: text },
 * ]);
 * if (result.success) {
 *   setChatVar(id, "sentiment", result.result);
 * }
 */
declare function axLLM(
  id: string,
  prompt: RisuaiPromptItem[] | unknown,
  useMultimodal?: boolean
): RisuaiLLMResult;

/** Wrapper: await image helpers. */
declare function getCharacterImage(id: string): string;
declare function getPersonaImage(id: string): string;

/**
 * Wrapper: register edit listeners.
 * The `func` will be called in sequence and may transform `value`.
 *
 * For `editRequest`, `value` is the full prompt array (OpenAIChat[]).
 * For `editDisplay`/`editInput`/`editOutput`, `value` is a string.
 *
 * @example
 * // editRequest — LLM 프롬프트에 시스템 메시지 주입
 * listenEdit("editRequest", (id, value, meta) => {
 *   const prompts = value;
 *   // 프롬프트 배열 끝에 시스템 메시지 추가
 *   prompts.push({ role: "system", content: "현재 감정: " + getChatVar(id, "emotion") });
 *   return prompts;
 * });
 *
 * @example
 * // editDisplay — 채팅 표시에 HTML 위젯 삽입
 * listenEdit("editDisplay", (id, value, meta) => {
 *   const panel = `<div class="status-panel">HP: ${getChatVar(id, "hp")}</div>`;
 *   return value + panel;
 * });
 *
 * @example
 * // editDisplay에서 setChatVar 사용 가능
 * listenEdit("editDisplay", (id, value, meta) => {
 *   setChatVar(id, "lastDisplayTime", os.date("%H:%M") as string);
 *   return value;
 * });
 *
 * @example
 * // editInput — 사용자 입력 전처리
 * listenEdit("editInput", (id, value, meta) => {
 *   // 특정 명령어 감지 후 변환
 *   if (string.find(value, "^/generate")[0] !== undefined) {
 *     return "[이미지 생성 요청]";
 *   }
 *   return value;
 * });
 */
declare function listenEdit(
  type: "editRequest",
  func: (id: string, value: RisuaiOpenAIChat[], meta: unknown) => RisuaiOpenAIChat[]
): void;
declare function listenEdit(
  type: "editDisplay" | "editInput" | "editOutput",
  func: (id: string, value: string, meta: unknown) => string
): void;

/**
 * Wrapper: get JSON-backed state from chat vars.
 * getState/setState는 내부적으로 getChatVar/setChatVar + JSON encode/decode를 사용합니다.
 * 복잡한 객체를 저장할 때 사용하세요.
 *
 * @example
 * // 게임 상태 관리
 * interface GameState {
 *   affection: number;
 *   day: number;
 *   flags: Record<string, boolean>;
 * }
 * const state = getState<GameState>(id, "game");
 * state.affection = state.affection + 5;
 * setState(id, "game", state);
 */
declare function getState<T = unknown>(id: string, name: string): T;

/** Wrapper: set JSON-backed state into chat vars. Requires SAFE id at runtime via setChatVar gate. */
declare function setState<T = unknown>(id: string, name: string, value: T): void;

/**
 * Wrapper: async helper that turns a callback into a function returning a Promise-like object.
 * 이벤트 핸들러(onOutput, onInput, onButtonClick)에서 await를 사용하려면 반드시 async()로 감싸야 합니다.
 *
 * @example
 * // onOutput에서 비동기 작업
 * onOutput = async((id: string) => {
 *   const tokens = getTokens(id, getCharacterLastMessage(id)).await();
 *   log(`Token count: ${tokens}`);
 * });
 *
 * @example
 * // onButtonClick에서 비동기 UI 상호작용
 * onButtonClick = async((id: string, data: string) => {
 *   if (data === "reset") {
 *     const ok = alertConfirm(id, "초기화하시겠습니까?").await();
 *     if (ok) {
 *       setState(id, "game", { score: 0 });
 *       reloadDisplay(id);
 *     }
 *   }
 * });
 */
declare function async<TArgs extends any[], TResult>(
  callback: (...args: TArgs) => TResult
): (...args: TArgs) => RisuaiPromise<TResult>;

/* -------------------------------------------------------------------------------------------------
 * Lua built-in / wasmoon globals
 * ------------------------------------------------------------------------------------------------- */

/**
 * JSON module loaded via `require 'json'` (mounted from json.lua).
 * Provides encode/decode for Lua <-> JSON interop.
 */
declare namespace json {
  /** Encode a Lua value to a JSON string. */
  function encode(value: unknown): string;
  /** Decode a JSON string to a Lua value. Returns nil on parse failure. */
  function decode<T = unknown>(s: string): T;
}

/**
 * wasmoon Promise bridge. Used by the `async()` wrapper to create coroutine-backed promises.
 * The `.create` factory mirrors `new Promise(executor)` semantics.
 *
 * @example
 * // Promise.create — 직접 Promise 생성
 * const p = Promise.create<string>((resolve) => {
 *   resolve("done");
 * });
 *
 * @example
 * // Promise.all — 병렬 실행
 * const [r1, r2] = Promise.all([
 *   LLMMain(id, json.encode(prompt1)),
 *   LLMMain(id, json.encode(prompt2)),
 * ]).await();
 */
declare namespace Promise {
  function create<T>(executor: (resolve: (value: T) => void, reject: (reason?: any) => void) => void): RisuaiPromise<T>;
  function resolve<T>(value: T): RisuaiPromise<T>;
  function all<T extends readonly unknown[]>(values: [...T]): RisuaiPromise<{ -readonly [K in keyof T]: T[K] extends RisuaiPromise<infer U> ? U : T[K] }>;
}

/* -------------------------------------------------------------------------------------------------
 * Script hook callbacks (optional globals that script authors implement)
 *
 * These are called by the engine based on the `mode` parameter of runScripted().
 * Script authors define whichever hooks they need; none are required.
 * ------------------------------------------------------------------------------------------------- */

/**
 * Called on user input (before sending).
 * Returning `false` will stop the message from being sent.
 *
 * @example
 * // 입력 전처리
 * onInput = async((id: string) => {
 *   const lastUserMsg = getUserLastMessage(id);
 *   if (string.find(lastUserMsg, "^/명령어")[0] !== undefined) {
 *     // 명령어 처리 후 전송 중단
 *     return false;
 *   }
 * });
 */
declare function onInput(id: string): any;

/**
 * Called after AI output is received.
 * Returning `false` will stop further processing.
 *
 * @example
 * // AI 응답 후 상태 변수 업데이트
 * onOutput = async((id: string) => {
 *   const chat = getFullChat(id);
 *   const lastMsg = chat[chat.length - 1];
 *   // 마지막 메시지 분석 후 상태 갱신
 *   const state = getState<GameState>(id, "game");
 *   state.turnCount = state.turnCount + 1;
 *   setState(id, "game", state);
 * });
 */
declare function onOutput(id: string): any;

/**
 * Called when the script engine initializes (first run for a chat).
 *
 * @example
 * // 초기 상태 설정
 * onStart = async((id: string) => {
 *   const existing = getChatVar(id, "initialized");
 *   if (existing !== "true") {
 *     setState(id, "game", { score: 0, day: 1 });
 *     setChatVar(id, "initialized", "true");
 *   }
 * });
 */
declare function onStart(id: string): any;

/**
 * Called when a UI button (registered by the script) is clicked.
 * @param data - The button identifier string passed from the UI.
 *
 * @example
 * // 버튼별 분기 처리
 * onButtonClick = async((id: string, data: string) => {
 *   if (data === "show_stats") {
 *     const state = getState<GameState>(id, "game");
 *     alertNormal(id, `점수: ${state.score}`);
 *   } else if (data === "toggle_mode") {
 *     const current = getChatVar(id, "mode");
 *     setChatVar(id, "mode", current === "on" ? "off" : "on");
 *     reloadDisplay(id);
 *   }
 * });
 */
declare function onButtonClick(id: string, data: string): any;