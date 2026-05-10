declare module 'luaparse' {
  interface ParseOptions {
    comments?: boolean;
    encodingMode?: 'none' | 'x-user-defined' | 'pseudo-latin1';
    extendedIdentifiers?: boolean;
    locations?: boolean;
    luaVersion?: string;
    ranges?: boolean;
    scope?: boolean;
  }

  interface LuaParseModule {
    parse(source: string, options?: ParseOptions): unknown;
  }

  const luaparse: LuaParseModule;
  export default luaparse;
}
