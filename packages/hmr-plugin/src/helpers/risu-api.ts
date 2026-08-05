/**
 * Boundary adapter for direct risuai.* access.
 */
import type { ControllerDeps, HmrEvent, HmrPublicState } from "../hmr/controller";
import type {
  HmrChatDebugMessage,
  HmrChatDebugScriptStateValue,
  HmrChatDebugSnapshot,
} from "../hmr/protocol";
import { createMappingStore } from "../hmr/storage";
import { getGlobalStorage, removeGlobalStorage, setGlobalStorage } from "./plugin-storage";

type RisuPlatform = "web" | "tauri" | "node";

type LocalNetworkRequestInit = RequestInit & {
  readonly networkRoute?: "local_network";
  readonly requestTimeoutMs: number;
};

type RisuAlertBridge = {
  readonly alertError?: (message: string) => Promise<void>;
};

type RisuDatabaseSubset = Parameters<typeof risuai.setDatabaseLite>[0];
type RisuModuleList = NonNullable<RisuDatabaseSubset["modules"]>;
const REQUIRED_PLUGIN_PERMISSIONS = ["db", "mainDom"] as const;

// tauri/node: 'local_network' routes to native/server-side fetch that can reach 127.0.0.1.
// web: RisuAI hard-rejects networkRoute='local_network'; a plain nativeFetch becomes a direct
// browser fetch when the user enables Plain Fetch (loopback is a secure-context exception).
const LOCAL_ROUTE_FETCH_OPTIONS: LocalNetworkRequestInit = {
  method: "GET",
  networkRoute: "local_network",
  requestTimeoutMs: 40_000,
};

const WEB_FETCH_OPTIONS: LocalNetworkRequestInit = {
  method: "GET",
  requestTimeoutMs: 40_000,
};

let cachedPlatform: Promise<RisuPlatform> | undefined;

function getPlatform(): Promise<RisuPlatform> {
  cachedPlatform ??= risuai.getRuntimeInfo().then((info) => toPlatform(info.platform));
  return cachedPlatform;
}

function toPlatform(value: string): RisuPlatform {
  if (value === "web" || value === "tauri" || value === "node") {
    return value;
  }

  throw new Error(`Unsupported RisuAI platform: ${value}`);
}

async function requestRequiredPluginPermissions(): Promise<boolean> {
  for (const permission of REQUIRED_PLUGIN_PERMISSIONS) {
    if (permission === "db") {
      if ((await risuai.getDatabase([])) === null) return false;
      continue;
    }
    if (!(await risuai.requestPluginPermission(permission))) return false;
  }

  return true;
}

async function fetchOk(url: string, init?: RequestInit): Promise<Response> {
  const baseOptions = (await getPlatform()) === "web" ? WEB_FETCH_OPTIONS : LOCAL_ROUTE_FETCH_OPTIONS;
  const options: LocalNetworkRequestInit = { ...baseOptions, ...init, requestTimeoutMs: 40_000 };
  const response = await risuai.nativeFetch(url, options);
  if (!response.ok) {
    throw new Error(`HMR server response ${response.status}`);
  }

  return response;
}

export class ChatSnapshotCaptureError extends Error {
  constructor(readonly code: "CHAT_UNAVAILABLE" | "CHAT_SHAPE_INVALID") {
    super(code);
    this.name = "ChatSnapshotCaptureError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function readOptionalString(value: Record<string, unknown>, fields: readonly string[]): string | undefined {
  let selected: string | undefined;
  for (const field of fields) {
    const candidate = value[field];
    if (candidate === undefined) continue;
    if (typeof candidate !== "string" || candidate.length === 0) {
      throw new ChatSnapshotCaptureError("CHAT_SHAPE_INVALID");
    }
    selected ??= candidate;
  }
  return selected;
}

function captureScriptstate(value: unknown): Readonly<Record<string, HmrChatDebugScriptStateValue>> {
  if (value === undefined) return {};
  if (!isPlainRecord(value)) throw new ChatSnapshotCaptureError("CHAT_SHAPE_INVALID");

  const scriptstate: Record<string, HmrChatDebugScriptStateValue> = {};
  for (const [key, stateValue] of Object.entries(value)) {
    if (
      !key.startsWith("$") ||
      (typeof stateValue !== "string" &&
        typeof stateValue !== "boolean" &&
        (typeof stateValue !== "number" || !Number.isFinite(stateValue)))
    ) {
      throw new ChatSnapshotCaptureError("CHAT_SHAPE_INVALID");
    }
    scriptstate[key] = stateValue;
  }
  return scriptstate;
}

function captureRecentMessages(value: unknown): readonly HmrChatDebugMessage[] {
  if (!Array.isArray(value)) throw new ChatSnapshotCaptureError("CHAT_SHAPE_INVALID");

  const startIndex = Math.max(0, value.length - 2);
  const recentMessages: HmrChatDebugMessage[] = [];
  for (let index = startIndex; index < value.length; index += 1) {
    const candidate = value[index];
    if (!isRecord(candidate) || typeof candidate["role"] !== "string" || typeof candidate["data"] !== "string") {
      throw new ChatSnapshotCaptureError("CHAT_SHAPE_INVALID");
    }
    if (candidate["role"].length === 0) throw new ChatSnapshotCaptureError("CHAT_SHAPE_INVALID");
    const time = candidate["time"];
    if (time !== undefined && (typeof time !== "number" || !Number.isFinite(time))) {
      throw new ChatSnapshotCaptureError("CHAT_SHAPE_INVALID");
    }
    recentMessages.push(time === undefined
      ? { index, role: candidate["role"], data: candidate["data"] }
      : { index, role: candidate["role"], data: candidate["data"], time });
  }
  return recentMessages;
}

export async function captureCurrentChatSnapshot(): Promise<HmrChatDebugSnapshot> {
  const [characterIndex, chatIndex] = await Promise.all([
    risuai.getCurrentCharacterIndex(),
    risuai.getCurrentChatIndex(),
  ]);
  if (!Number.isInteger(characterIndex) || characterIndex < 0 || !Number.isInteger(chatIndex) || chatIndex < 0) {
    throw new ChatSnapshotCaptureError("CHAT_UNAVAILABLE");
  }

  const [characterValue, chatValue] = await Promise.all([
    risuai.getCharacterFromIndex(characterIndex),
    risuai.getChatFromIndex(characterIndex, chatIndex),
  ]);
  if (characterValue === null || chatValue === null) throw new ChatSnapshotCaptureError("CHAT_UNAVAILABLE");
  if (!isRecord(characterValue) || !isRecord(chatValue)) throw new ChatSnapshotCaptureError("CHAT_SHAPE_INVALID");

  const characterId = readOptionalString(characterValue, ["chaId", "characterId", "id"]);
  const characterName = readOptionalString(characterValue, ["name", "characterName"]);
  const character = characterId === undefined
    ? characterName === undefined ? {} : { name: characterName }
    : characterName === undefined ? { id: characterId } : { id: characterId, name: characterName };
  const chatId = readOptionalString(chatValue, ["chatId", "id"]);
  const chatName = readOptionalString(chatValue, ["name", "chatName", "title"]);
  const chat = chatId === undefined
    ? chatName === undefined ? {} : { name: chatName }
    : chatName === undefined ? { id: chatId } : { id: chatId, name: chatName };

  return {
    capturedAt: Date.now(),
    character,
    chat,
    scriptstate: captureScriptstate(chatValue["scriptstate"]),
    recentMessages: captureRecentMessages(chatValue["message"]),
  };
}

function toImageBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  if (Array.isArray(value) && value.every((item) => typeof item === "number")) {
    return new Uint8Array(value);
  }

  return null;
}

export async function alertErrorSafe(message: string): Promise<void> {
  const candidate = (risuai as unknown as RisuAlertBridge).alertError;
  if (typeof candidate === "function") {
    await candidate(message);
    return;
  }

  console.error(message);
}

export function createRisuControllerDeps(
  ui: { onState(state: HmrPublicState): void; onEvent(event: HmrEvent): void },
): ControllerDeps {
  return {
    getPlatform,
    fetchJson: async (url) => (await fetchOk(url)).json(),
    postJson: async (url, body) => {
      await fetchOk(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
    },
    fetchBinary: async (url) => new Uint8Array(await (await fetchOk(url)).arrayBuffer()),
    getCharacters: async () => {
      const db = await risuai.getDatabase(["characters"]);
      return Array.isArray(db?.characters) ? [...db.characters] : [];
    },
    setCharacterToIndex: (index, character) => risuai.setCharacterToIndex(index, character),
    getModules: async () => {
      const db = await risuai.getDatabase(["modules"]);
      return Array.isArray(db?.modules) ? [...db.modules] : [];
    },
    setModulesLite: (modules) => risuai.setDatabaseLite({ modules: modules as RisuModuleList }),
    persistDatabase: async () => {
      const db = await risuai.getDatabase(["characters", "modules"]);
      if (db !== null) {
        await risuai.setDatabase(db);
      }
    },
    probeImage: async (fileName) => {
      try {
        const bytes = await risuai.readImage(fileName);
        return bytes !== null && bytes !== undefined;
      } catch (error) {
        if (error instanceof Error) {
          return false;
        }

        throw error;
      }
    },
    saveAsset: (bytes) => risuai.saveAsset(bytes),
    store: createMappingStore({
      getItem: (key) => getGlobalStorage(key),
      setItem: (key, value) => setGlobalStorage(key, value),
      removeItem: (key) => removeGlobalStorage(key),
    }),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    onState: ui.onState,
    onEvent: ui.onEvent,
    alertError: alertErrorSafe,
  };
}

export const risuUi = {
  showContainer: () => risuai.showContainer("fullscreen"),
  hideContainer: () => risuai.hideContainer(),
  requestRequiredPermissions: requestRequiredPluginPermissions,
  readImageBytes: async (path: string): Promise<Uint8Array | null> => {
    try {
      return toImageBytes(await risuai.readImage(path));
    } catch (error) {
      if (error instanceof Error) {
        return null;
      }

      throw error;
    }
  },
} as const;
