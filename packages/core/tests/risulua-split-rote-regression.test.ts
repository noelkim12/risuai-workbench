import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseCharx, parseModuleRisumFull } from '../src/cli/extract/parsers';
import { extractRegexFromModule, serializeRegexContent } from '../src/domain/regex';
import {
  createRisuLuaModuleTableArtifacts,
  parseRisuLuaModuleTableSource,
  validateRisuLuaModuleTableCapturePreservation,
} from '../src/domain/risulua-split';
import { executeRisuLua } from '../src/node/risulua-runtime/worker-runner';
import { resolveFixtureRepositoryRoot } from './helpers/fixture-corpus';

describe('risulua-split Rote regression', () => {
  it('partially modularizes capture-heavy Rote Lua without losing lexical captures', async () => {
    const { source, buttonActionSources } = readRoteFixture();

    const artifacts = await createRisuLuaModuleTableArtifacts({
      source,
      sourcePath: 'test_suites/Rote.charx',
      targetName: 'Rote',
      domainGeneration: 'validated',
      buttonActionSources,
    });

    const luaPaths = artifacts.workspaceFiles
      .map((file) => file.path)
      .filter((filePath) => filePath.startsWith('lua/'));
    const main = artifacts.workspaceFiles.find((file) => file.path === 'lua/main.risulua');

    expect(luaPaths.length).toBeGreaterThan(1);
    expect(main?.content.length).toBeLessThan(source.length);
    expect(main?.content.length).toBeLessThan(100 * 1024);
    expect(main?.content.split('\n').length).toBeLessThan(1_800);
    const domainModule = artifacts.workspaceFiles.find((file) => file.path === 'lua/domain/rote.risulua');
    const buttonModule = artifacts.workspaceFiles.find((file) => file.path === 'lua/button_actions/actions.risulua');
    const variableStoreModule = artifacts.workspaceFiles.find((file) => file.path === 'lua/state/variable_store.risulua');
    const variableStoreContract = artifacts.dryRunResult.refactorMap.modules.find((moduleContract) => moduleContract.category === 'state-store');
    expect(domainModule).toBeDefined();
    expect(buttonModule).toBeDefined();
    expect(variableStoreModule?.content).toContain('M.ROTE_BACKGROUND_OPTIONS =');
    expect(variableStoreContract?.exports).toContain('ROTE_BACKGROUND_OPTIONS');
    expect(main?.content).not.toContain('\nROTE_BACKGROUND_OPTIONS = {');
    expect(domainModule?.content).not.toContain('require("button_actions.actions")');
    const variableStoreLoad = await executeRisuLua({
      moduleMap: {
        entryModuleId: 'main',
        modules: {
          main: 'return require("state.variable_store")',
          'state.variable_store': variableStoreModule?.content ?? '',
        },
      },
      target: { kind: 'module' },
      hostProfile: 'minimal',
    });
    expect(variableStoreLoad.status, variableStoreLoad.diagnostics.map((diagnostic) => diagnostic.message).join('; ')).toBe('ok');
    const preservedNames = new Set(artifacts.dryRunResult.refactorMap.preserved.map((entry) => entry.originalName));
    expect([...preservedNames].filter((name) => [
      'state_block_from_text',
      'latest_state_message_zero_index',
      'latest_state_block',
      'latest_aux_state',
      'load_result_compact',
      'handle_choice',
      'queue_cheat',
      'queue_target_edit',
    ].includes(name))).toEqual([]);
    for (const file of artifacts.workspaceFiles.filter((candidate) => candidate.path.startsWith('lua/'))) {
      const parseResult = await parseRisuLuaModuleTableSource(file.content);
      if (!parseResult.ok) {
        const details = parseResult.syntaxErrors.map((error) => {
          const lines = file.content.split('\n');
          const row = error.pointRange.startPoint.row;
          return `${error.message} at line ${row + 1}: ${JSON.stringify(lines.slice(Math.max(0, row - 2), row + 3))}`;
        });
        throw new Error(`${file.path}: ${details.join('; ')}`);
      }
    }
    await expect(validateRisuLuaModuleTableCapturePreservation({
      modulePlans: artifacts.topLevelRewrite.modulePlans,
      refactorMap: artifacts.dryRunResult.refactorMap,
    })).resolves.toEqual([]);
  });
});

function readRoteFixture(): {
  source: string;
  buttonActionSources: Array<{ sourceFile: string; source: string }>;
} {
  const fixturePath = path.join(resolveFixtureRepositoryRoot(), 'test_suites', 'Rote.charx');
  const { moduleData } = parseCharx(fs.readFileSync(fixturePath));
  if (moduleData === null) throw new Error('Rote charx has no embedded module');

  const parsedModule = parseModuleRisumFull(moduleData);
  const module = parsedModule?.module;
  const triggers = isRecord(module) ? module['trigger'] : undefined;
  if (!Array.isArray(triggers)) throw new Error('Rote module has no trigger array');

  const source = triggers.flatMap((trigger) => {
    if (!isRecord(trigger) || !Array.isArray(trigger['effect'])) return [];
    return trigger['effect'].flatMap((effect) => {
      if (!isRecord(effect) || effect['type'] !== 'triggerlua' || typeof effect['code'] !== 'string') {
        return [];
      }
      return [effect['code']];
    });
  }).join('\n\n');
  const regexEntries = isRecord(module) ? extractRegexFromModule(module, 'module') ?? [] : [];
  const buttonActionSources = regexEntries.map((entry, index) => ({
    sourceFile: `regex/${index}.risuregex`,
    source: serializeRegexContent(entry),
  }));
  return { source, buttonActionSources };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
