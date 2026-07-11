/**
 * Boundary adapter for direct risuai.* access.
 */
import type { ControllerDeps, HmrEvent, HmrPublicState } from "../hmr/controller";
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
let requiredPermissionsRequest: Promise<boolean> | undefined;

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
    if (!(await risuai.requestPluginPermission(permission))) return false;
  }

  return true;
}

async function fetchOk(url: string): Promise<Response> {
  const options = (await getPlatform()) === "web" ? WEB_FETCH_OPTIONS : LOCAL_ROUTE_FETCH_OPTIONS;
  const response = await risuai.nativeFetch(url, options);
  if (!response.ok) {
    throw new Error(`HMR server response ${response.status}`);
  }

  return response;
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
  requestRequiredPermissions: () => {
    requiredPermissionsRequest ??= requestRequiredPluginPermissions().then(
      (granted) => {
        if (!granted) requiredPermissionsRequest = undefined;
        return granted;
      },
      (error: unknown) => {
        requiredPermissionsRequest = undefined;
        throw error;
      },
    );
    return requiredPermissionsRequest;
  },
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
