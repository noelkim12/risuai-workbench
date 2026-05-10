import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

import { analyzeLuaWithWasmSync } from 'risu-workbench-core';
import {
  buildRisuLuaBridgeIndex,
  createRisuLuaBridgeDefinition,
  createRisuLuaBridgeHover,
} from '../../src/features/navigation/risulua-bridge-index';

function makeTempWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'risulua-bridge-index-'));
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

describe('risulua bridge index', () => {
  it('links a main public bridge to the generated module member definition', () => {
    const root = makeTempWorkspace();
    const mainPath = path.join(root, 'lua', 'main.risulua');
    const modulePath = path.join(root, 'lua', 'button_actions', 'actions.risulua');
    const regexPath = path.join(root, 'regex', 'Heroine_옷_설정.risuregex');

    const mainSource = [
      'local __button_actions = require("button_actions.actions")',
      '---@source regex/Heroine_옷_설정.risuregex:11:0',
      'setHeroineClothes = __button_actions.setHeroineClothes',
      '',
    ].join('\n');
    const moduleSource = [
      'local M = {}',
      'function M.setHeroineClothes(triggerId)',
      '  return triggerId',
      'end',
      'return M',
      '',
    ].join('\n');

    writeFile(mainPath, mainSource);
    writeFile(modulePath, moduleSource);
    writeFile(regexPath, `${Array.from({ length: 11 }, (_, index) => `line ${index + 1}`).join('\n')}\n`);

    const mainWasm = analyzeLuaWithWasmSync(mainSource, {
      includeRequireAliases: true,
      includeMemberBridgeAssignments: true,
      includeSourceComments: true,
    });
    const moduleWasm = analyzeLuaWithWasmSync(moduleSource, {
      includeModuleMemberDefinitions: true,
    });

    const index = buildRisuLuaBridgeIndex({
      uri: pathToFileURL(mainPath).href,
      text: mainSource,
      wasmResult: mainWasm,
      moduleResults: new Map([[pathToFileURL(modulePath).href, { text: moduleSource, wasmResult: moduleWasm }]]),
    });

    const bridge = index.publicBridgesByName.get('setHeroineClothes');
    expect(bridge?.moduleName).toBe('button_actions.actions');
    expect(bridge?.targetDefinitionUri).toBe(pathToFileURL(modulePath).href);
    expect(bridge?.sourceOrigin?.path).toBe('regex/Heroine_옷_설정.risuregex');
  });

  it('creates definition and hover for a public bridge assignment', () => {
    const root = makeTempWorkspace();
    const mainPath = path.join(root, 'lua', 'main.risulua');
    const modulePath = path.join(root, 'lua', 'button_actions', 'actions.risulua');

    const mainSource = [
      'local __button_actions = require("button_actions.actions")',
      '---@source regex/Heroine_옷_설정.risuregex:11:0',
      'setHeroineClothes = __button_actions.setHeroineClothes',
      '',
    ].join('\n');
    const moduleSource = 'local M = {}\nfunction M.setHeroineClothes()\nend\nreturn M\n';

    writeFile(mainPath, mainSource);
    writeFile(modulePath, moduleSource);

    const mainUri = pathToFileURL(mainPath).href;
    const moduleUri = pathToFileURL(modulePath).href;
    const moduleWasm = analyzeLuaWithWasmSync(moduleSource, {
      includeModuleMemberDefinitions: true,
    });
    const moduleResults = new Map([[moduleUri, { text: moduleSource, wasmResult: moduleWasm }]]);

    const definition = createRisuLuaBridgeDefinition(mainSource, { line: 2, character: 5 }, mainUri, moduleResults);
    const hover = createRisuLuaBridgeHover(mainSource, { line: 2, character: 5 }, mainUri, moduleResults);

    expect(definition?.[0]?.targetUri).toBe(moduleUri);
    expect(hover?.contents).toEqual({
      kind: 'markdown',
      value: [
        '**setHeroineClothes**',
        '',
        'Generated RisuLua bridge.',
        '',
        '- Public symbol: `setHeroineClothes`',
        '- Module export: `button_actions.actions.setHeroineClothes`',
        '- Source: `regex/Heroine_옷_설정.risuregex:11:0`',
      ].join('\n'),
    });
  });

  it('resolves RHS bridge member access to module export alias definitions', () => {
    const root = makeTempWorkspace();
    const mainPath = path.join(root, 'lua', 'main.risulua');
    const modulePath = path.join(root, 'lua', 'button_actions', 'actions.risulua');
    const mainSource = [
      'local __button_actions = require("button_actions.actions")',
      'removeActionButton = __button_actions.removeActionButton',
      '',
    ].join('\n');
    const moduleSource = [
      'local M = {}',
      'local removeActionButton = async(function(triggerId)',
      '  return triggerId',
      'end)',
      'M.removeActionButton = removeActionButton',
      'return M',
      '',
    ].join('\n');
    writeFile(mainPath, mainSource);
    writeFile(modulePath, moduleSource);

    const mainUri = pathToFileURL(mainPath).href;
    const moduleUri = pathToFileURL(modulePath).href;
    const definition = createRisuLuaBridgeDefinition(
      mainSource,
      { line: 1, character: 42 },
      mainUri,
      new Map([
        [
          moduleUri,
          { text: moduleSource, wasmResult: analyzeLuaWithWasmSync(moduleSource, { includeModuleMemberDefinitions: true }) },
        ],
      ]),
    );

    expect(definition?.[0]?.targetUri).toBe(moduleUri);
    expect(definition?.[0]?.targetRange).toEqual({
      start: { line: 4, character: 2 },
      end: { line: 4, character: 20 },
    });
    expect(definition?.[0]?.originSelectionRange).toEqual({
      start: { line: 1, character: 38 },
      end: { line: 1, character: 56 },
    });
  });

  it('returns null instead of jumping to the LHS when a bridge target cannot be resolved', () => {
    const root = makeTempWorkspace();
    const mainPath = path.join(root, 'lua', 'main.risulua');
    const mainSource = [
      'local __button_actions = require("button_actions.actions")',
      'removeActionButton = __button_actions.removeActionButton',
      '',
    ].join('\n');
    writeFile(mainPath, mainSource);

    const definition = createRisuLuaBridgeDefinition(
      mainSource,
      { line: 1, character: 42 },
      pathToFileURL(mainPath).href,
    );

    expect(definition).toBeNull();
  });

  it('keeps UTF-16 bridge ranges correct with non-ascii prefixes', () => {
    const root = makeTempWorkspace();
    const mainPath = path.join(root, 'lua', 'main.risulua');
    const modulePath = path.join(root, 'lua', 'button_actions', 'actions.risulua');
    const mainSource = [
      'local __button_actions = require("button_actions.actions")',
      '한글_prefix = 1',
      'setHeroineClothes = __button_actions.setHeroineClothes',
      '',
    ].join('\n');
    const moduleSource = 'local M = {}\nfunction M.setHeroineClothes()\nend\nreturn M\n';
    writeFile(mainPath, mainSource);
    writeFile(modulePath, moduleSource);

    const definition = createRisuLuaBridgeDefinition(
      mainSource,
      { line: 2, character: 5 },
      pathToFileURL(mainPath).href,
      new Map([
        [
          pathToFileURL(modulePath).href,
          { text: moduleSource, wasmResult: analyzeLuaWithWasmSync(moduleSource, { includeModuleMemberDefinitions: true }) },
        ],
      ]),
    );

    expect(definition?.[0]?.originSelectionRange).toEqual({
      start: { line: 2, character: 0 },
      end: { line: 2, character: 17 },
    });
  });
});
