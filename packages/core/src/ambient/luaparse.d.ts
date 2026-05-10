declare module 'luaparse' {
export interface ParseOptions {
    comments?: boolean;
    locations?: boolean;
    ranges?: boolean;
    scope?: boolean;
    luaVersion?: string;
    extendedIdentifiers?: boolean;
    encodingMode?: 'none' | 'x-user-defined' | 'pseudo-latin1';
  }

  export interface Chunk {
    body: unknown[];
    comments?: unknown[];
  }

  export function parse(source: string, options?: ParseOptions): Chunk;

  const luaparse: {
    parse: typeof parse;
  };

  export default luaparse;
}
