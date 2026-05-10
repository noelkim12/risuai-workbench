import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  createRisuLuaSourceCommentHover,
  createRisuLuaSourceCommentDefinition,
  hasRisuLuaSourceCommentAtPosition,
  parseRisuLuaSourceCommentLine,
} from '../../src/features/navigation/risulua-source-definition';

function makeTempWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'risulua-source-definition-'));
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

describe('parseRisuLuaSourceCommentLine', () => {
  it('parses generated source comments with relative paths', () => {
    expect(parseRisuLuaSourceCommentLine('---@source regex/toggle.risuregex:2:0')).toEqual({
      column: 0,
      line: 2,
      sourcePath: 'regex/toggle.risuregex',
    });
  });

  it('parses generated source comments with Unicode paths', () => {
    expect(parseRisuLuaSourceCommentLine('  ---@source regex/▶▶◆_시작.risuregex:122:0')).toEqual({
      column: 0,
      line: 122,
      sourcePath: 'regex/▶▶◆_시작.risuregex',
    });
  });

  it('returns null for malformed comments', () => {
    expect(parseRisuLuaSourceCommentLine('---@source regex/toggle.risuregex')).toBeNull();
    expect(parseRisuLuaSourceCommentLine('-- @source regex/toggle.risuregex:2:0')).toBeNull();
    expect(parseRisuLuaSourceCommentLine('---@source regex/toggle.risuregex:0:0')).toBeNull();
  });
});

describe('hasRisuLuaSourceCommentAtPosition', () => {
  it('detects valid source comments even when target file resolution is handled elsewhere', () => {
    const source = '-- Button action bridge: toggle\n---@source regex/missing.risuregex:2:0\n';

    expect(hasRisuLuaSourceCommentAtPosition(source, { line: 1, character: 15 })).toBe(true);
    expect(hasRisuLuaSourceCommentAtPosition(source, { line: 0, character: 5 })).toBe(false);
  });
});

describe('createRisuLuaSourceCommentDefinition', () => {
  it('creates a LocationLink from lua/main.risulua to workspace-root relative source', () => {
    const root = makeTempWorkspace();
    const mainPath = path.join(root, 'lua', 'main.risulua');
    const sourcePath = path.join(root, 'regex', 'toggle.risuregex');
    writeFile(mainPath, '-- Button action bridge: toggle\n---@source regex/toggle.risuregex:2:0\ntoggle = true\n');
    writeFile(sourcePath, '@@@ OUT\n{{button::Toggle::toggle}}\n');

    const source = fs.readFileSync(mainPath, 'utf8');
    const definition = createRisuLuaSourceCommentDefinition(source, { line: 1, character: 15 }, pathToFileURL(mainPath).href);

    expect(definition).toHaveLength(1);
    expect(definition?.[0]?.targetUri).toBe(pathToFileURL(sourcePath).href);
    expect(definition?.[0]?.targetRange).toEqual({
      start: { line: 1, character: 0 },
      end: { line: 1, character: 0 },
    });
    expect(definition?.[0]?.targetSelectionRange).toEqual({
      start: { line: 1, character: 0 },
      end: { line: 1, character: 0 },
    });
    expect(definition?.[0]?.originSelectionRange).toEqual({
      start: { line: 1, character: 11 },
      end: { line: 1, character: 37 },
    });
  });

  it('resolves Unicode source paths without losing file URI encoding', () => {
    const root = makeTempWorkspace();
    const mainPath = path.join(root, 'lua', 'main.risulua');
    const sourcePath = path.join(root, 'regex', '▶▶◆_시작.risuregex');
    writeFile(mainPath, '---@source regex/▶▶◆_시작.risuregex:122:0\n');
    writeFile(sourcePath, `${Array.from({ length: 122 }, (_, index) => `line ${index + 1}`).join('\n')}\n`);

    const definition = createRisuLuaSourceCommentDefinition(
      fs.readFileSync(mainPath, 'utf8'),
      { line: 0, character: 20 },
      pathToFileURL(mainPath).href,
    );

    expect(definition?.[0]?.targetUri).toBe(pathToFileURL(sourcePath).href);
    expect(definition?.[0]?.targetRange.start).toEqual({ line: 121, character: 0 });
  });

  it('returns source comment definitions before any LuaLS definition merge policy is needed', () => {
    const root = makeTempWorkspace();
    const mainPath = path.join(root, 'lua', 'main.risulua');
    const sourcePath = path.join(root, 'regex', 'skill_set.risuregex');
    writeFile(mainPath, [
      '-- Button action bridge: skill_3_Set',
      '---@source regex/skill_set.risuregex:2:0',
      'skill_3_Set = __button_actions.skill_3_Set',
      '',
    ].join('\n'));
    writeFile(sourcePath, '@@@ OUT\n<button risu-trigger="skill_3_Set">=</button>\n');

    const definition = createRisuLuaSourceCommentDefinition(
      fs.readFileSync(mainPath, 'utf8'),
      { line: 1, character: 5 },
      pathToFileURL(mainPath).href,
    );

    expect(definition).toEqual([
      expect.objectContaining({
        targetUri: pathToFileURL(sourcePath).href,
        targetRange: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } },
      }),
    ]);
  });

  it('returns null when cursor is not on a source comment line', () => {
    const root = makeTempWorkspace();
    const mainPath = path.join(root, 'lua', 'main.risulua');
    const source = '-- Button action bridge: toggle\n---@source regex/toggle.risuregex:2:0\n';

    expect(createRisuLuaSourceCommentDefinition(source, { line: 0, character: 5 }, pathToFileURL(mainPath).href)).toBeNull();
  });

  it('returns null when the target file does not exist', () => {
    const root = makeTempWorkspace();
    const mainPath = path.join(root, 'lua', 'main.risulua');
    writeFile(mainPath, '---@source regex/missing.risuregex:2:0\n');

    expect(createRisuLuaSourceCommentDefinition(
      fs.readFileSync(mainPath, 'utf8'),
      { line: 0, character: 15 },
      pathToFileURL(mainPath).href,
    )).toBeNull();
  });
});

describe('createRisuLuaSourceCommentHover', () => {
  it('creates markdown hover content for source comment navigation markers', () => {
    const root = makeTempWorkspace();
    const mainPath = path.join(root, 'lua', 'main.risulua');
    const sourcePath = path.join(root, 'regex', 'toggle.risuregex');
    writeFile(mainPath, '---@source regex/toggle.risuregex:2:0\n');
    writeFile(sourcePath, '@@@ OUT\n{{button::Toggle::toggle}}\n');

    const hover = createRisuLuaSourceCommentHover(
      fs.readFileSync(mainPath, 'utf8'),
      { line: 0, character: 12 },
      pathToFileURL(mainPath).href,
    );

    expect(hover).toEqual({
      contents: {
        kind: 'markdown',
        value: [
          '**RisuLua generated source**',
          '',
          'Generated from `regex/toggle.risuregex:2:0`.',
          '',
          'Go to Definition opens the original source location directly; LuaLS is skipped for this generated source marker.',
        ].join('\n'),
      },
      range: {
        start: { line: 0, character: 11 },
        end: { line: 0, character: 37 },
      },
    });
  });

  it('returns null when cursor is not on a source comment line', () => {
    const root = makeTempWorkspace();
    const mainPath = path.join(root, 'lua', 'main.risulua');
    const source = '-- Button action bridge: toggle\n---@source regex/toggle.risuregex:2:0\n';

    expect(createRisuLuaSourceCommentHover(source, { line: 0, character: 5 }, pathToFileURL(mainPath).href)).toBeNull();
  });
});
