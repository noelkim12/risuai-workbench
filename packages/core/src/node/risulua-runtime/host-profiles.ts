import { lua, to_luastring, type LuaState } from 'fengari';

import {
  type RisuLuaDiagnostic,
  type RisuLuaEngineRequest,
  type RisuLuaJsonValue,
  type RisuLuaStateDiff,
  type RisuLuaTraceEvent,
} from './contracts';
import { normalizeRisuLuaJsonValue } from './value-codec';

export const PROFILE_FUNCTIONS = Object.freeze({
  minimal: ['async'],
  'button-action': [
    'async',
    'getChatVar',
    'setChatVar',
    'getGlobalVar',
    'setGlobalVar',
    'alertError',
    'alertNormal',
    'reloadDisplay',
    'addChat',
  ],
  'chat-state': [
    'async',
    'getChatVar',
    'setChatVar',
    'getGlobalVar',
    'setGlobalVar',
    'getState',
    'setState',
    'alertError',
    'alertNormal',
    'reloadDisplay',
    'addChat',
  ],
} as const);

interface InstallHostProfileOptions {
  state: LuaState;
  request: RisuLuaEngineRequest;
  trace: RisuLuaTraceEvent[];
  pushValue: (state: LuaState, value: RisuLuaJsonValue) => void;
  readValue: (state: LuaState, index: number) => RisuLuaJsonValue;
  failLua: (diagnostic: RisuLuaDiagnostic) => never;
}

export interface HostProfileController {
  readonly hostCalls: number;
  readonly traceTruncated: boolean;
  snapshot(): Readonly<Record<string, RisuLuaJsonValue>>;
  diff(): RisuLuaStateDiff;
}

export function installHostProfile(options: InstallHostProfileOptions): HostProfileController {
  const { state, request, trace, pushValue, readValue, failLua } = options;
  const profile = request.hostProfile ?? 'minimal';
  const initialChat = cloneRecord(request.host?.chatVariables);
  const initialGlobal = cloneRecord(request.host?.globalVariables);
  const initialState = cloneRecord(request.host?.state);
  const chatVariables = { ...initialChat };
  const globalVariables = { ...initialGlobal };
  const stateValues = { ...initialState };
  let hostCalls = 0;
  let traceTruncated = false;

  const recordCall = (
    name: string,
    args: readonly RisuLuaJsonValue[] = [],
    result?: RisuLuaJsonValue,
  ): void => {
    hostCalls += 1;
    if (hostCalls > request.limits.hostCallLimit) {
      failLua({
        id: 'RUNTIME_HOST_CALL_LIMIT',
        message: 'RisuLua host-call limit exceeded: ' + request.limits.hostCallLimit,
      });
    }
    if (trace.length >= request.limits.maxTraceEvents) {
      traceTruncated = true;
      return;
    }
    trace.push({
      sequence: trace.length + 1,
      kind: 'host-call',
      name,
      ...(args.length > 0 ? { args } : {}),
      ...(result !== undefined ? { result } : {}),
    });
  };

  register(state, 'async', (callbackState) => {
    recordCall('async');
    lua.lua_pushvalue(callbackState, 1);
    return 1;
  });

  if (profile !== 'minimal') {
    registerGetter(state, 'getChatVar', chatVariables, recordCall, pushValue, failLua);
    registerSetter(state, 'setChatVar', chatVariables, recordCall, readValue, failLua);
    registerGetter(state, 'getGlobalVar', globalVariables, recordCall, pushValue, failLua);
    registerSetter(state, 'setGlobalVar', globalVariables, recordCall, readValue, failLua);

    for (const name of ['alertError', 'alertNormal'] as const) {
      register(state, name, (callbackState) => {
        const message = stringArgument(callbackState, 1, name, failLua);
        recordCall(name, [message]);
        lua.lua_createtable(callbackState, 0, 1);
        lua.lua_pushjsfunction(callbackState, () => 0);
        lua.lua_setfield(callbackState, -2, to_luastring('await'));
        return 1;
      });
    }

    register(state, 'reloadDisplay', () => {
      recordCall('reloadDisplay');
      return 0;
    });
    register(state, 'addChat', (callbackState) => {
      const role = stringArgument(callbackState, 1, 'addChat', failLua);
      const content = stringArgument(callbackState, 2, 'addChat', failLua);
      recordCall('addChat', [role, content]);
      return 0;
    });
  }

  if (profile === 'chat-state') {
    registerGetter(state, 'getState', stateValues, recordCall, pushValue, failLua);
    registerSetter(state, 'setState', stateValues, recordCall, readValue, failLua);
  }

  for (const [name, value] of Object.entries(request.host?.globals ?? {})) {
    pushValue(state, normalizeRisuLuaJsonValue(value));
    lua.lua_setglobal(state, to_luastring(name));
  }
  installDeterministicRandom(state, request.host?.randomSeed ?? 1);

  return {
    get hostCalls() {
      return hostCalls;
    },
    get traceTruncated() {
      return traceTruncated;
    },
    snapshot: () => ({
      chatVariables: cloneRecord(chatVariables),
      globalVariables: cloneRecord(globalVariables),
      state: cloneRecord(stateValues),
    }),
    diff: () => ({
      ...diffRecord(initialChat, chatVariables, 'chatVariables'),
      ...diffRecord(initialGlobal, globalVariables, 'globalVariables'),
      ...diffRecord(initialState, stateValues, 'state'),
    }),
  };
}

function register(
  state: LuaState,
  name: string,
  callback: (state: LuaState) => number,
): void {
  lua.lua_pushjsfunction(state, callback);
  lua.lua_setglobal(state, to_luastring(name));
}

function registerGetter(
  state: LuaState,
  name: string,
  values: Record<string, RisuLuaJsonValue>,
  recordCall: (name: string, args?: readonly RisuLuaJsonValue[], result?: RisuLuaJsonValue) => void,
  pushValue: (state: LuaState, value: RisuLuaJsonValue) => void,
  failLua: (diagnostic: RisuLuaDiagnostic) => never,
): void {
  register(state, name, (callbackState) => {
    const key = stringArgument(callbackState, 1, name, failLua);
    const value = values[key] ?? null;
    recordCall(name, [key], value);
    pushValue(callbackState, value);
    return 1;
  });
}

function registerSetter(
  state: LuaState,
  name: string,
  values: Record<string, RisuLuaJsonValue>,
  recordCall: (name: string, args?: readonly RisuLuaJsonValue[], result?: RisuLuaJsonValue) => void,
  readValue: (state: LuaState, index: number) => RisuLuaJsonValue,
  failLua: (diagnostic: RisuLuaDiagnostic) => never,
): void {
  register(state, name, (callbackState) => {
    const key = stringArgument(callbackState, 1, name, failLua);
    let value: RisuLuaJsonValue;
    try {
      value = readValue(callbackState, 2);
    } catch (error) {
      return failLua({
        id: 'RUNTIME_VALUE_LIMIT',
        message: error instanceof Error ? error.message : String(error),
      });
    }
    recordCall(name, [key, value]);
    if (value === null) delete values[key];
    else values[key] = value;
    return 0;
  });
}

function stringArgument(
  state: LuaState,
  index: number,
  functionName: string,
  failLua: (diagnostic: RisuLuaDiagnostic) => never,
): string {
  const value = lua.lua_tojsstring(state, index);
  if (value === null) {
    return failLua({
      id: 'RUNTIME_LUA_ERROR',
      message: functionName + ' expects a string argument at position ' + index,
    });
  }
  return value;
}

function installDeterministicRandom(state: LuaState, requestedSeed: number): void {
  let seed = normalizeSeed(requestedSeed);
  const next = () => {
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
    return seed / 0x1_0000_0000;
  };

  lua.lua_getglobal(state, to_luastring('math'));
  lua.lua_pushjsfunction(state, (callbackState) => {
    const argumentCount = lua.lua_gettop(callbackState);
    const random = next();
    if (argumentCount === 0) {
      lua.lua_pushnumber(callbackState, random);
    } else if (argumentCount === 1) {
      const upper = lua.lua_tointeger(callbackState, 1);
      lua.lua_pushinteger(callbackState, Math.floor(random * upper) + 1);
    } else {
      const lower = lua.lua_tointeger(callbackState, 1);
      const upper = lua.lua_tointeger(callbackState, 2);
      lua.lua_pushinteger(callbackState, Math.floor(random * (upper - lower + 1)) + lower);
    }
    return 1;
  });
  lua.lua_setfield(state, -2, to_luastring('random'));
  lua.lua_pushjsfunction(state, (callbackState) => {
    seed = normalizeSeed(lua.lua_tointeger(callbackState, 1));
    return 0;
  });
  lua.lua_setfield(state, -2, to_luastring('randomseed'));
  lua.lua_pop(state, 1);
}

function normalizeSeed(value: number): number {
  const seed = Number.isFinite(value) ? Math.trunc(value) >>> 0 : 1;
  return seed === 0 ? 1 : seed;
}

function cloneRecord(
  value: Readonly<Record<string, RisuLuaJsonValue>> | undefined,
): Record<string, RisuLuaJsonValue> {
  return { ...(value ?? {}) };
}

function diffRecord(
  initial: Record<string, RisuLuaJsonValue>,
  current: Record<string, RisuLuaJsonValue>,
  key: keyof RisuLuaStateDiff,
): Partial<RisuLuaStateDiff> {
  const diff: Record<string, RisuLuaJsonValue | null> = {};
  for (const name of [...new Set([...Object.keys(initial), ...Object.keys(current)])].sort()) {
    if (!(name in current)) diff[name] = null;
    else if (!(name in initial) || !jsonEqual(initial[name], current[name])) diff[name] = current[name];
  }
  return Object.keys(diff).length > 0 ? { [key]: diff } : {};
}

function jsonEqual(left: RisuLuaJsonValue, right: RisuLuaJsonValue): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

