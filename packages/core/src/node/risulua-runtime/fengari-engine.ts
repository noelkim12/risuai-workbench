import {
  lauxlib,
  lua,
  lualib,
  to_luastring,
  type LuaState,
} from 'fengari';

import {
  RISULUA_RUNTIME_LIMITS,
  type RisuLuaDiagnostic,
  type RisuLuaEngineRequest,
  type RisuLuaEngineResult,
  type RisuLuaJsonValue,
  type RisuLuaTraceEvent,
} from './contracts';
import { validateRuntimeModuleId, validateRuntimeModuleMap } from './module-map';
import { normalizeRisuLuaJsonValue } from './value-codec';
import { installHostProfile, type HostProfileController } from './host-profiles';

export function runRisuLuaInProcess(request: RisuLuaEngineRequest): RisuLuaEngineResult {
  let moduleMap;
  try {
    moduleMap = validateRuntimeModuleMap(request.moduleMap);
  } catch (error) {
    return errorResult({
      id: 'RUNTIME_INVALID_REQUEST',
      message: errorMessage(error),
    });
  }

  const state = lauxlib.luaL_newstate();
  const trace: RisuLuaTraceEvent[] = [];
  const moduleReferences = new Map<string, number>();
  let pendingDiagnostic: RisuLuaDiagnostic | undefined;
  let activeModuleId = moduleMap.entryModuleId;
  let hostController: HostProfileController | undefined;
  let instructions = 0;

  const failLua = (diagnostic: RisuLuaDiagnostic): never => {
    pendingDiagnostic = diagnostic;
    lua.lua_pushstring(state, to_luastring(diagnostic.message));
    return lua.lua_error(state);
  };

  const executeModule = (moduleId: string): boolean => {
    const cachedReference = moduleReferences.get(moduleId);
    if (cachedReference !== undefined) {
      lua.lua_rawgeti(state, lua.LUA_REGISTRYINDEX, cachedReference);
      return true;
    }

    const source = moduleMap.modules[moduleId];
    if (source === undefined) {
      pendingDiagnostic = {
        id: 'RUNTIME_MODULE_NOT_FOUND',
        message: `RisuLua runtime module not found: ${moduleId}`,
        moduleId,
      };
      lua.lua_pushstring(state, to_luastring(pendingDiagnostic.message));
      return false;
    }

    trace.push({ sequence: trace.length + 1, kind: 'module', name: moduleId });
    const sourceBytes = to_luastring(source);
    const loadStatus = lauxlib.luaL_loadbuffer(
      state,
      sourceBytes,
      sourceBytes.length,
      to_luastring(`@${moduleId}`),
    );
    if (loadStatus !== lua.LUA_OK) {
      const message = stackError(state);
      pendingDiagnostic = {
        id: 'RUNTIME_COMPILE_ERROR',
        message,
        moduleId,
        line: diagnosticLine(message),
      };
      return false;
    }

    const previousModuleId = activeModuleId;
    activeModuleId = moduleId;
    const callStatus = lua.lua_pcall(state, 0, 1, 0);
    activeModuleId = previousModuleId;
    if (callStatus !== lua.LUA_OK) {
      const message = stackError(state);
      pendingDiagnostic ??= {
        id: 'RUNTIME_LUA_ERROR',
        message,
        moduleId,
        line: diagnosticLine(message),
      };
      return false;
    }

    if (lua.lua_type(state, -1) === lua.LUA_TNIL) {
      lua.lua_pop(state, 1);
      lua.lua_pushboolean(state, true);
    }
    lua.lua_pushvalue(state, -1);
    moduleReferences.set(moduleId, lauxlib.luaL_ref(state, lua.LUA_REGISTRYINDEX));
    return true;
  };

  try {
    openSafeLibraries(state);
    installRequire(state, executeModule, failLua);
    const hookInterval = Math.max(1, Math.min(1_000, request.limits.instructionLimit));
    lua.lua_sethook(state, () => {
      instructions += hookInterval;
      if (instructions >= request.limits.instructionLimit) {
        failLua({
          id: 'RUNTIME_INSTRUCTION_LIMIT',
          message: `RisuLua instruction limit exceeded: ${request.limits.instructionLimit}`,
        });
      }
    }, lua.LUA_MASKCOUNT, hookInterval);
    hostController = installHostProfile({
      state,
      request,
      trace,
      pushValue: pushJsonValue,
      readValue: readJsonValue,
      failLua,
    });
    const finish = (result: RisuLuaEngineResult): RisuLuaEngineResult => applyEngineMetrics(
      applyHostResult(result, hostController),
      instructions,
    );

    const targetModuleId = request.target.moduleId ?? moduleMap.entryModuleId;
    try {
      validateRuntimeModuleId(targetModuleId);
    } catch (error) {
      return finish(errorResult({
        id: 'RUNTIME_INVALID_REQUEST',
        message: errorMessage(error),
        moduleId: targetModuleId,
      }, trace));
    }

    if (!executeModule(targetModuleId)) {
      return finish(errorResult(pendingDiagnostic ?? internalDiagnostic(stackError(state)), trace));
    }

    if (request.target.kind === 'export') {
      if (lua.lua_type(state, -1) !== lua.LUA_TTABLE) {
        return finish(errorResult({
          id: 'RUNTIME_LUA_ERROR',
          message: `Module ${targetModuleId} does not return an export table`,
          moduleId: targetModuleId,
        }, trace));
      }
      lua.lua_getfield(state, -1, to_luastring(request.target.exportName));
      lua.lua_remove(state, -2);
      if (lua.lua_type(state, -1) !== lua.LUA_TFUNCTION) {
        return finish(errorResult({
          id: 'RUNTIME_LUA_ERROR',
          message: `Module export is not callable: ${request.target.exportName}`,
          moduleId: targetModuleId,
        }, trace));
      }

      const args = request.target.args ?? [];
      for (const arg of args) pushJsonValue(state, normalizeRisuLuaJsonValue(arg));
      activeModuleId = targetModuleId;
      const callStatus = lua.lua_pcall(state, args.length, 1, 0);
      if (callStatus !== lua.LUA_OK) {
        const message = stackError(state);
        return finish(errorResult(pendingDiagnostic ?? {
          id: 'RUNTIME_LUA_ERROR',
          message,
          moduleId: activeModuleId,
          line: diagnosticLine(message),
        }, trace));
      }
    }

    let value: RisuLuaJsonValue;
    try {
      value = readJsonValue(state, -1);
    } catch (error) {
      return finish(errorResult({
        id: 'RUNTIME_VALUE_LIMIT',
        message: errorMessage(error),
        moduleId: targetModuleId,
      }, trace));
    }

    return finish({
      status: 'ok',
      value,
      stateDiff: {},
      trace,
      diagnostics: [],
      metrics: metrics(trace),
    });
  } catch (error) {
    return applyEngineMetrics(
      applyHostResult(
        errorResult(pendingDiagnostic ?? internalDiagnostic(errorMessage(error)), trace),
        hostController,
      ),
      instructions,
    );
  } finally {
    lua.lua_close(state);
  }
}

function openSafeLibraries(state: LuaState): void {
  const libraries = [
    ['_G', lualib.luaopen_base],
    [lualib.LUA_COLIBNAME, lualib.luaopen_coroutine],
    [lualib.LUA_TABLIBNAME, lualib.luaopen_table],
    [lualib.LUA_STRLIBNAME, lualib.luaopen_string],
    [lualib.LUA_MATHLIBNAME, lualib.luaopen_math],
    [lualib.LUA_UTF8LIBNAME, lualib.luaopen_utf8],
  ] as const;
  for (const [name, openFunction] of libraries) {
    lauxlib.luaL_requiref(state, to_luastring(name), openFunction, 1);
    lua.lua_pop(state, 1);
  }

  for (const name of ['io', 'os', 'debug', 'package', 'load', 'loadfile', 'dofile', 'collectgarbage']) {
    lua.lua_pushnil(state);
    lua.lua_setglobal(state, to_luastring(name));
  }
}

function installRequire(
  state: LuaState,
  executeModule: (moduleId: string) => boolean,
  failLua: (diagnostic: RisuLuaDiagnostic) => never,
): void {
  lua.lua_pushjsfunction(state, (callbackState) => {
    const moduleId = lua.lua_tojsstring(callbackState, 1);
    if (moduleId === null) {
      return failLua({
        id: 'RUNTIME_INVALID_REQUEST',
        message: 'RisuLua require expects a string module id',
      });
    }
    try {
      validateRuntimeModuleId(moduleId);
    } catch (error) {
      return failLua({
        id: 'RUNTIME_INVALID_REQUEST',
        message: errorMessage(error),
        moduleId,
      });
    }
    if (!executeModule(moduleId)) return lua.lua_error(callbackState);
    return 1;
  });
  lua.lua_setglobal(state, to_luastring('require'));
}

export function pushJsonValue(state: LuaState, value: RisuLuaJsonValue): void {
  if (value === null) {
    lua.lua_pushnil(state);
  } else if (typeof value === 'boolean') {
    lua.lua_pushboolean(state, value);
  } else if (typeof value === 'number') {
    if (Number.isInteger(value)) lua.lua_pushinteger(state, value);
    else lua.lua_pushnumber(state, value);
  } else if (typeof value === 'string') {
    lua.lua_pushstring(state, to_luastring(value));
  } else if (Array.isArray(value)) {
    lua.lua_createtable(state, value.length, 0);
    value.forEach((item, index) => {
      pushJsonValue(state, item);
      lua.lua_rawseti(state, -2, index + 1);
    });
  } else {
    const record = value as Readonly<Record<string, RisuLuaJsonValue>>;
    lua.lua_createtable(state, 0, Object.keys(record).length);
    for (const [key, item] of Object.entries(record)) {
      pushJsonValue(state, item);
      lua.lua_setfield(state, -2, to_luastring(key));
    }
  }
}

export function readJsonValue(
  state: LuaState,
  index: number,
  depth = 0,
  ancestors = new Set<object>(),
  budget = { entries: 0 },
): RisuLuaJsonValue {
  if (depth > RISULUA_RUNTIME_LIMITS.maxValueDepth) {
    throw new Error(`Lua result exceeds maximum depth ${RISULUA_RUNTIME_LIMITS.maxValueDepth}`);
  }
  const type = lua.lua_type(state, index);
  if (type === lua.LUA_TNIL) return null;
  if (type === lua.LUA_TBOOLEAN) return lua.lua_toboolean(state, index);
  if (type === lua.LUA_TNUMBER) return lua.lua_isinteger(state, index)
    ? lua.lua_tointeger(state, index)
    : lua.lua_tonumber(state, index);
  if (type === lua.LUA_TSTRING) return lua.lua_tojsstring(state, index) ?? '';
  if (type !== lua.LUA_TTABLE) throw new Error('Unsupported Lua result type');

  const absoluteIndex = lua.lua_absindex(state, index);
  const pointer = lua.lua_topointer(state, absoluteIndex);
  if (pointer && ancestors.has(pointer)) throw new Error('Cyclic Lua result table is not supported');
  if (pointer) ancestors.add(pointer);

  const entries: Array<[string | number, RisuLuaJsonValue]> = [];
  try {
    lua.lua_pushnil(state);
    while (lua.lua_next(state, absoluteIndex) !== 0) {
      const keyType = lua.lua_type(state, -2);
      let key: string | number;
      if (keyType === lua.LUA_TSTRING) {
        key = lua.lua_tojsstring(state, -2) ?? '';
      } else if (keyType === lua.LUA_TNUMBER && lua.lua_isinteger(state, -2)) {
        key = lua.lua_tointeger(state, -2);
      } else {
        lua.lua_pop(state, 1);
        throw new Error('Lua result tables require string or integer keys');
      }
      budget.entries += 1;
      if (budget.entries > RISULUA_RUNTIME_LIMITS.maxValueEntries) {
        lua.lua_pop(state, 1);
        throw new Error(`Lua result exceeds maximum entries ${RISULUA_RUNTIME_LIMITS.maxValueEntries}`);
      }
      entries.push([key, readJsonValue(state, -1, depth + 1, ancestors, budget)]);
      lua.lua_pop(state, 1);
    }
  } finally {
    if (pointer) ancestors.delete(pointer);
  }

  const numericKeys = entries.map(([key]) => key);
  const isArray = entries.length > 0
    && numericKeys.every((key) => typeof key === 'number' && key >= 1)
    && Math.max(...numericKeys as number[]) === entries.length;
  if (isArray) {
    return entries
      .sort(([left], [right]) => Number(left) - Number(right))
      .map(([, value]) => value);
  }

  const record: Record<string, RisuLuaJsonValue> = {};
  for (const [key, value] of entries.sort(([left], [right]) => String(left).localeCompare(String(right)))) {
    record[String(key)] = value;
  }
  return record;
}

function stackError(state: LuaState): string {
  return lua.lua_tojsstring(state, -1) ?? 'Unknown Lua error';
}

function diagnosticLine(message: string): number | undefined {
  const match = message.match(/:(\d+):/);
  return match ? Number(match[1]) : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function internalDiagnostic(message: string): RisuLuaDiagnostic {
  return { id: 'RUNTIME_INTERNAL_ERROR', message };
}

function errorResult(
  diagnostic: RisuLuaDiagnostic,
  trace: readonly RisuLuaTraceEvent[] = [],
): RisuLuaEngineResult {
  return {
    status: 'error',
    stateDiff: {},
    trace,
    diagnostics: [diagnostic],
    metrics: metrics(trace),
  };
}

function metrics(trace: readonly RisuLuaTraceEvent[]) {
  return {
    instructions: 0,
    hostCalls: 0,
    traceEvents: trace.length,
    traceTruncated: false,
  };
}

function applyHostResult(
  result: RisuLuaEngineResult,
  controller: HostProfileController | undefined,
): RisuLuaEngineResult {
  if (!controller) return result;
  return {
    ...result,
    state: controller.snapshot(),
    stateDiff: controller.diff(),
    metrics: {
      ...result.metrics,
      hostCalls: controller.hostCalls,
      traceEvents: result.trace.length,
      traceTruncated: controller.traceTruncated,
    },
  };
}

function applyEngineMetrics(result: RisuLuaEngineResult, instructions: number): RisuLuaEngineResult {
  return {
    ...result,
    metrics: {
      ...result.metrics,
      instructions,
    },
  };
}
