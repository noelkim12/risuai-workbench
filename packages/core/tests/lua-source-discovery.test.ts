import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  classifyLuaSourceRole,
  discoverLuaAnalysisFiles,
  discoverLuaSourceFiles,
} from '../src/cli/analyze/shared/lua-source-discovery';

let tempDir: string;

function writeFile(root: string, relativePath: string, text: string): void {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
}

describe('lua-source-discovery', () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-lua-discovery-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('discovers recursive .risulua files under lua with main first and split roles', () => {
    writeFile(tempDir, 'lua/domain/core.risulua', 'function domainCore() return true end');
    writeFile(tempDir, 'lua/features/core.risulua', 'function featureCore() return true end');
    writeFile(tempDir, 'lua/runtime/output.risulua', 'function onOutput() return nil end');
    writeFile(tempDir, 'lua/state/variable_store.risulua', 'return {}');
    writeFile(tempDir, 'lua/main.risulua', 'require("domain.core")');
    writeFile(tempDir, 'dist/generated.risulua', 'function generated() return false end');
    writeFile(tempDir, 'legacy/original.risulua', 'function original() return false end');

    const result = discoverLuaSourceFiles(tempDir);

    expect(result.map((file) => file.relativePath)).toEqual([
      'lua/main.risulua',
      'lua/domain/core.risulua',
      'lua/features/core.risulua',
      'lua/runtime/output.risulua',
      'lua/state/variable_store.risulua',
    ]);
    expect(result.map((file) => file.luaRelativePath)).toEqual([
      'main.risulua',
      'domain/core.risulua',
      'features/core.risulua',
      'runtime/output.risulua',
      'state/variable_store.risulua',
    ]);
    expect(result.map((file) => file.role)).toEqual([
      'main',
      'domain',
      'features',
      'runtime',
      'state',
    ]);
  });

  it('prefers recursive .risulua over .lua when both extensions exist', () => {
    writeFile(tempDir, 'lua/domain/modern.risulua', 'function modern() return true end');
    writeFile(tempDir, 'lua/legacy.lua', 'function legacy() return false end');

    const result = discoverLuaSourceFiles(tempDir);

    expect(result.map((file) => file.relativePath)).toEqual(['lua/domain/modern.risulua']);
  });

  it('falls back to recursive .lua files when no .risulua source exists', () => {
    writeFile(tempDir, 'lua/nested/legacy.lua', 'function legacy() return true end');

    const result = discoverLuaSourceFiles(tempDir);

    expect(result.map((file) => file.relativePath)).toEqual(['lua/nested/legacy.lua']);
    expect(result[0].role).toBe('unknown');
  });

  it('discovers recursive analysis JSON files under lua only', () => {
    writeFile(tempDir, 'lua/domain/core.analysis.json', '{"stateVars":{}}');
    writeFile(tempDir, 'lua/runtime/output.analysis.json', '{"stateVars":{}}');
    writeFile(tempDir, 'dist/generated.analysis.json', '{"stateVars":{}}');

    const result = discoverLuaAnalysisFiles(tempDir);

    expect(result.map((file) => file.relativePath)).toEqual([
      'lua/domain/core.analysis.json',
      'lua/runtime/output.analysis.json',
    ]);
  });

  it('classifies every split role path explicitly', () => {
    expect(classifyLuaSourceRole('main.risulua')).toBe('main');
    expect(classifyLuaSourceRole('runtime/start.risulua')).toBe('runtime');
    expect(classifyLuaSourceRole('handler_helpers/output_helpers.risulua')).toBe('handler_helpers');
    expect(classifyLuaSourceRole('common/helpers.risulua')).toBe('common');
    expect(classifyLuaSourceRole('host_globals/global_functions.risulua')).toBe('host_globals');
    expect(classifyLuaSourceRole('button_actions/actions.risulua')).toBe('button_actions');
    expect(classifyLuaSourceRole('state/variable_store.risulua')).toBe('state');
    expect(classifyLuaSourceRole('prompts/instruction_store.risulua')).toBe('prompts');
    expect(classifyLuaSourceRole('domain/calc_damage.risulua')).toBe('domain');
    expect(classifyLuaSourceRole('schema/constants.risulua')).toBe('schema');
    expect(classifyLuaSourceRole('features/core.risulua')).toBe('features');
    expect(classifyLuaSourceRole('sections/000_prelude.risulua')).toBe('sections');
    expect(classifyLuaSourceRole('preload/foo.risulua')).toBe('preload');
    expect(classifyLuaSourceRole('misc/tool.risulua')).toBe('unknown');
  });
});
