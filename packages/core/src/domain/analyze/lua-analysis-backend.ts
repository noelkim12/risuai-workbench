/**
 * Lua 분석 백엔드를 선택하고 Rust WASM 또는 luaparse 분석으로 위임하는 어댑터.
 * @file packages/core/src/domain/analyze/lua-analysis-backend.ts
 */

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

/**
 * analyzeLuaWithBackend 함수.
 * 요청된 백엔드 정책에 따라 Rust WASM 분석을 우선 실행하고 필요하면 luaparse 분석으로 대체함.
 *
 * @param request - 분석할 Lua 파일 정보와 백엔드 선택, 선택적 WASM 분석 함수를 담은 요청
 * @returns 사용된 백엔드와 WASM 결과 또는 luaparse 분석 아티팩트
 */
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

/**
 * shouldDisableOversizedLuaFallback 함수.
 * 너무 큰 risulua 파일에서 luaparse fallback을 생략해야 하는지 판정함.
 *
 * @param request - 파일 경로와 소스 길이를 확인할 Lua 분석 요청
 * @returns oversized risulua fallback을 비활성화해야 하면 true
 */
function shouldDisableOversizedLuaFallback(request: LuaAnalysisBackendRequest): boolean {
  return (
    request.filePath.toLowerCase().endsWith('.risulua') &&
    request.source.length > MAX_LUA_BACKEND_FALLBACK_SOURCE_LENGTH
  );
}

/**
 * analyzeWithLuaparse 함수.
 * luaparse 기반 코어 분석기를 실행해 Lua 분석 결과를 생성함.
 *
 * @param request - luaparse로 분석할 Lua 파일 경로와 소스
 * @returns luaparse 백엔드 표시와 분석 아티팩트를 담은 결과
 */
function analyzeWithLuaparse(request: LuaAnalysisBackendRequest): LuaBackendAnalysisResult {
  return {
    backend: 'luaparse',
    artifact: analyzeLuaSource({ filePath: request.filePath, source: request.source }),
  };
}
