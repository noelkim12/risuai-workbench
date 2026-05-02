import { analyzeLuaSource } from './lua-core';
import { analyzeLuaWithWasm } from './lua-wasm-adapter';
import type { LuaAnalysisArtifact } from './lua-core';
import type { LuaWasmAnalyzeOptions } from './lua-wasm-types';
import type { LuaWasmAnalyzeResult } from './lua-wasm-types';

const MAX_LUA_BACKEND_FALLBACK_SOURCE_LENGTH = 512 * 1024;

export type LuaAnalysisBackendKind = 'rust-wasm' | 'luaparse' | 'disabled';

export interface LuaAnalysisBackendRequest {
  readonly filePath: string;
  readonly source: string;
  readonly backend?: LuaAnalysisBackendKind;
  readonly analyzeWithWasm?: (
    source: string,
    options?: LuaWasmAnalyzeOptions,
  ) => Promise<LuaWasmAnalyzeResult>;
}

export interface LuaBackendAnalysisResult {
  readonly backend: LuaAnalysisBackendKind;
  readonly wasmResult?: LuaWasmAnalyzeResult;
  readonly artifact?: LuaAnalysisArtifact;
}

export async function analyzeLuaWithBackend(
  request: LuaAnalysisBackendRequest,
): Promise<LuaBackendAnalysisResult> {
  const backend = request.backend ?? 'rust-wasm';

  if (backend === 'disabled') {
    return { backend };
  }

  if (backend === 'luaparse') {
    return analyzeWithLuaparse(request);
  }

  const analyzeWithWasm = request.analyzeWithWasm ?? analyzeLuaWithWasm;
  try {
    return {
      backend,
      wasmResult: await analyzeWithWasm(request.source, {
        includeStringLiterals: true,
        includeStateAccesses: true,
      }),
    };
  } catch {
    if (shouldDisableOversizedLuaFallback(request)) {
      return { backend: 'disabled' };
    }
    return analyzeWithLuaparse(request);
  }
}

function shouldDisableOversizedLuaFallback(request: LuaAnalysisBackendRequest): boolean {
  return (
    request.filePath.toLowerCase().endsWith('.risulua') &&
    request.source.length > MAX_LUA_BACKEND_FALLBACK_SOURCE_LENGTH
  );
}

function analyzeWithLuaparse(request: LuaAnalysisBackendRequest): LuaBackendAnalysisResult {
  return {
    backend: 'luaparse',
    artifact: analyzeLuaSource({ filePath: request.filePath, source: request.source }),
  };
}
