/**
 * RisuAI Lua type stub generation helpers for LuaLS companion injection.
 * @file packages/cbs-lsp/src/providers/lua/typeStubs.ts
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import {
  RISUAI_LUA_RUNTIME_STUB_FILE_NAME,
  createMinimalRisuAiLuaTypeStub,
} from 'risu-workbench-core';

export { createMinimalRisuAiLuaTypeStub, getRisuAiLuaDiagnosticGlobals } from 'risu-workbench-core';

const DEFAULT_RISUAI_STUB_ROOT = path.join(tmpdir(), `cbs-lsp-risu-stubs-${process.pid}`);

/**
 * RisuAiLuaTypeStubWorkspace 클래스.
 * process-scope temp root 아래 LuaLS용 generated `.d.lua` stub 파일을 유지함.
 */
export class RisuAiLuaTypeStubWorkspace {
  readonly rootPath: string;

  constructor(rootPath: string = DEFAULT_RISUAI_STUB_ROOT) {
    this.rootPath = rootPath;
    mkdirSync(this.rootPath, { recursive: true });
  }

  /**
   * getRuntimeStubFilePath 함수.
   * generated runtime stub 파일 절대 경로를 반환함.
   *
   * @returns `risu-runtime.lua` 절대 경로
   */
  getRuntimeStubFilePath(): string {
    return path.join(this.rootPath, RISUAI_LUA_RUNTIME_STUB_FILE_NAME);
  }

  /**
   * getRuntimeStubContents 함수.
   * 현재 runtime stub 파일에 기록할 canonical Lua text를 반환함.
   *
   * @returns generated runtime stub 본문
   */
  getRuntimeStubContents(): string {
    return createMinimalRisuAiLuaTypeStub();
  }

  /**
   * syncRuntimeStub 함수.
   * 최소 RisuAI runtime type stub를 현재 root에 다시 기록함.
   *
   * @returns 기록된 stub 파일 절대 경로
   */
  syncRuntimeStub(): string {
    const stubFilePath = this.getRuntimeStubFilePath();
    mkdirSync(this.rootPath, { recursive: true });
    writeFileSync(stubFilePath, this.getRuntimeStubContents(), 'utf8');
    return stubFilePath;
  }

  /**
   * reset 함수.
   * 테스트나 종료 경로에서 generated stub root 전체를 비움.
   */
  reset(): void {
    rmSync(this.rootPath, { recursive: true, force: true });
    mkdirSync(this.rootPath, { recursive: true });
  }
}

/**
 * createRisuAiLuaTypeStubWorkspace 함수.
 * 기본 generated stub workspace 인스턴스를 생성함.
 *
 * @param rootPath - 테스트용 override stub root
 * @returns generated stub workspace helper
 */
export function createRisuAiLuaTypeStubWorkspace(rootPath?: string): RisuAiLuaTypeStubWorkspace {
  return new RisuAiLuaTypeStubWorkspace(rootPath);
}

/**
 * getDefaultRisuAiLuaStubRootPath 함수.
 * process-scope 기본 generated stub root 경로를 노출함.
 *
 * @returns 기본 generated stub root 절대 경로
 */
export function getDefaultRisuAiLuaStubRootPath(): string {
  return DEFAULT_RISUAI_STUB_ROOT;
}
