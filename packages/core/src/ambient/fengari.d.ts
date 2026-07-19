declare module 'fengari' {
  export type LuaState = object;
  export type LuaString = Uint8Array;
  export type LuaCFunction = (state: LuaState) => number;
  export type LuaHook = (state: LuaState, activationRecord: unknown) => void;

  export function to_luastring(value: string): LuaString;

  export interface LuaApi {
    readonly LUA_OK: number;
    readonly LUA_MASKCOUNT: number;
    readonly LUA_REGISTRYINDEX: number;
    readonly LUA_TNIL: number;
    readonly LUA_TBOOLEAN: number;
    readonly LUA_TNUMBER: number;
    readonly LUA_TSTRING: number;
    readonly LUA_TTABLE: number;
    readonly LUA_TFUNCTION: number;
    lua_absindex(state: LuaState, index: number): number;
    lua_close(state: LuaState): void;
    lua_createtable(state: LuaState, arraySize: number, recordSize: number): void;
    lua_error(state: LuaState): never;
    lua_getfield(state: LuaState, index: number, key: LuaString): number;
    lua_getglobal(state: LuaState, name: LuaString): number;
    lua_gettop(state: LuaState): number;
    lua_isinteger(state: LuaState, index: number): boolean;
    lua_next(state: LuaState, index: number): number;
    lua_pcall(state: LuaState, argumentCount: number, resultCount: number, errorFunction: number): number;
    lua_pop(state: LuaState, count: number): void;
    lua_pushboolean(state: LuaState, value: boolean): void;
    lua_pushinteger(state: LuaState, value: number): void;
    lua_pushjsfunction(state: LuaState, callback: LuaCFunction): void;
    lua_pushnil(state: LuaState): void;
    lua_pushnumber(state: LuaState, value: number): void;
    lua_pushstring(state: LuaState, value: LuaString): void;
    lua_pushvalue(state: LuaState, index: number): void;
    lua_rawgeti(state: LuaState, index: number, reference: number): number;
    lua_rawseti(state: LuaState, index: number, integerKey: number): void;
    lua_remove(state: LuaState, index: number): void;
    lua_setfield(state: LuaState, index: number, key: LuaString): void;
    lua_setglobal(state: LuaState, name: LuaString): void;
    lua_sethook(state: LuaState, hook: LuaHook | null, mask: number, count: number): void;
    lua_settable(state: LuaState, index: number): void;
    lua_toboolean(state: LuaState, index: number): boolean;
    lua_tointeger(state: LuaState, index: number): number;
    lua_tojsstring(state: LuaState, index: number): string | null;
    lua_tonumber(state: LuaState, index: number): number;
    lua_topointer(state: LuaState, index: number): object | null;
    lua_type(state: LuaState, index: number): number;
  }

  export interface LuaAuxLib {
    luaL_loadbuffer(
      state: LuaState,
      source: LuaString,
      size: number,
      chunkName: LuaString,
    ): number;
    luaL_newstate(): LuaState;
    luaL_ref(state: LuaState, index: number): number;
    luaL_requiref(
      state: LuaState,
      moduleName: LuaString,
      openFunction: LuaCFunction,
      global: number,
    ): void;
  }

  export interface LuaLib {
    readonly LUA_COLIBNAME: string;
    readonly LUA_TABLIBNAME: string;
    readonly LUA_STRLIBNAME: string;
    readonly LUA_MATHLIBNAME: string;
    readonly LUA_UTF8LIBNAME: string;
    readonly luaopen_base: LuaCFunction;
    readonly luaopen_coroutine: LuaCFunction;
    readonly luaopen_table: LuaCFunction;
    readonly luaopen_string: LuaCFunction;
    readonly luaopen_math: LuaCFunction;
    readonly luaopen_utf8: LuaCFunction;
  }

  export const lua: LuaApi;
  export const lauxlib: LuaAuxLib;
  export const lualib: LuaLib;
}
