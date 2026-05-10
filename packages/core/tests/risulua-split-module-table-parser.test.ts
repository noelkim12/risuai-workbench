import { describe, expect, it } from 'vitest';

import {
  createRisuLuaUtf8ByteStringMap,
  parseRisuLuaModuleTableSource,
  sliceSourceRange,
  type RisuLuaModuleTableParseResult,
  type RisuLuaModuleTableParseSuccess,
} from '../src/domain/risulua-split';

function textsForNode(result: Awaited<ReturnType<typeof parseRisuLuaModuleTableSource>>, nodeType: string): string[] {
  return result.executableRanges.filter((range) => range.nodeType === nodeType).map((range) => range.text);
}

function expectParseSuccess(result: RisuLuaModuleTableParseResult): asserts result is RisuLuaModuleTableParseSuccess {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error('Expected Lua parser success.');
  }
}

describe('risulua module-table tree-sitter parser backend', () => {
  it('initializes tree-sitter Lua and exposes parser-derived executable table ranges', async () => {
    const source = [
      'local M = {}',
      'function M.onStart()',
      '  return 1',
      'end',
      'return M',
    ].join('\n');

    const result = await parseRisuLuaModuleTableSource(source);

    expectParseSuccess(result);
    expect(result.parser).toBe('tree-sitter-lua');
    expect(result.rewriteEligible).toBe(true);
    expect(result.syntaxErrors).toEqual([]);
    expect(textsForNode(result, 'table_constructor')).toContain('{}');

    const functionRanges = textsForNode(result, 'function_declaration');
    expect(functionRanges).toEqual(expect.arrayContaining([expect.stringContaining('function M.onStart()')]));
  });

  it('maps LF parser ranges back to exact JavaScript source slices', async () => {
    const source = 'local M = {}\nfunction M.run()\n  return M\nend\n';
    const result = await parseRisuLuaModuleTableSource(source);
    expectParseSuccess(result);

    const table = result.executableRanges.find((range) => range.nodeType === 'table_constructor');
    expect(table).toBeDefined();
    expect(table?.text).toBe('{}');
    expect(table ? sliceSourceRange(source, table.sourceRange) : '').toBe('{}');
    expect(table?.sourceRange.startLine).toBe(1);
    expect(table?.sourceRange.endLine).toBe(1);
  });

  it('maps CRLF parser ranges back to exact JavaScript source slices', async () => {
    const source = 'local M = {}\r\nfunction M.run()\r\n  return M\r\nend\r\n';
    const result = await parseRisuLuaModuleTableSource(source);
    expectParseSuccess(result);

    const functionRange = result.executableRanges.find((range) => range.nodeType === 'function_declaration');
    expect(functionRange).toBeDefined();
    expect(functionRange?.text).toBe('function M.run()\r\n  return M\r\nend');
    expect(functionRange ? sliceSourceRange(source, functionRange.sourceRange) : '').toBe(functionRange?.text);
    expect(functionRange?.sourceRange.startLine).toBe(2);
    expect(functionRange?.sourceRange.endLine).toBe(4);
  });

  it('preserves UTF-8 byte to JavaScript UTF-16 index slices with Korean text and emoji', async () => {
    const source = '-- 한글 😀 prefix\nlocal M = {}\nreturn M';
    const map = createRisuLuaUtf8ByteStringMap(source);
    const result = await parseRisuLuaModuleTableSource(source);
    expectParseSuccess(result);

    const declaration = result.executableRanges.find((range) => range.text === 'local M = {}');
    expect(declaration).toBeDefined();
    expect(declaration?.byteRange.startByte).toBeGreaterThan(declaration?.stringRange.startIndex ?? Number.POSITIVE_INFINITY);
    expect(declaration ? map.byteRangeToJsRange(declaration.byteRange) : undefined).toEqual(declaration?.stringRange);
    expect(declaration ? source.slice(declaration.stringRange.startIndex, declaration.stringRange.endIndex) : '').toBe('local M = {}');
  });

  it('excludes comments, block comments, strings, and long bracket strings from executable candidates', async () => {
    const source = [
      '-- fakeLine = function() return 1 end',
      '--[[',
      'function fakeBlock() return 2 end',
      ']]',
      'local quoted = "function fakeString() return 3 end"',
      'local long = [[',
      'local fakeLong = {}',
      ']]',
      'local M = {}',
    ].join('\n');

    const result = await parseRisuLuaModuleTableSource(source);
    expectParseSuccess(result);
    expect(result.nonExecutableRanges.map((range) => range.nodeType)).toEqual(expect.arrayContaining(['comment', 'string']));
    expect(result.nonExecutableRanges.map((range) => range.text)).toEqual(expect.arrayContaining([
      expect.stringContaining('fakeLine'),
      expect.stringContaining('fakeBlock'),
      expect.stringContaining('fakeString'),
      expect.stringContaining('fakeLong'),
    ]));

    const executableText = result.executableRanges.map((range) => range.text).join('\n');
    expect(executableText).not.toContain('fakeLine');
    expect(executableText).not.toContain('fakeBlock');
    expect(executableText).not.toContain('fakeString');
    expect(executableText).not.toContain('fakeLong');
    expect(textsForNode(result, 'table_constructor')).toContain('{}');
  });

  it('exposes nested functions, async wrapper callback bodies, call identifiers, and member expressions', async () => {
    const source = [
      'onStart = async(function()',
      '  local function nested()',
      '    return RisuAI.chat.send()',
      '  end',
      '  return nested()',
      'end)',
    ].join('\n');

    const result = await parseRisuLuaModuleTableSource(source);
    expectParseSuccess(result);

    expect(textsForNode(result, 'function_declaration')).toEqual(expect.arrayContaining([
      expect.stringContaining('local function nested()'),
    ]));
    expect(textsForNode(result, 'function_call')).toEqual(expect.arrayContaining([
      expect.stringContaining('async(function()'),
      'nested()',
    ]));
    expect(textsForNode(result, 'identifier')).toEqual(expect.arrayContaining(['onStart', 'async', 'nested']));
    expect(textsForNode(result, 'dot_index_expression')).toEqual(expect.arrayContaining(['RisuAI.chat', 'RisuAI.chat.send']));
  });

  it('fails closed with syntax error metadata and no executable rewrite eligibility for malformed Lua', async () => {
    const result = await parseRisuLuaModuleTableSource('local M = {\nfunction broken(');

    expect(result.ok).toBe(false);
    expect(result.rewriteEligible).toBe(false);
    expect(result.syntaxErrors.length).toBeGreaterThan(0);
    expect(result.executableRanges).toEqual([]);
    expect(result.syntaxErrors[0]).toEqual(expect.objectContaining({
      nodeType: expect.any(String),
      byteRange: expect.objectContaining({ startByte: expect.any(Number), endByte: expect.any(Number) }),
      stringRange: expect.objectContaining({ startIndex: expect.any(Number), endIndex: expect.any(Number) }),
      message: expect.any(String),
    }));
  });

  it('exposes metrics with lineStartsBuildCount equal to 1 for successful parse', async () => {
    const source = 'local M = {}\nfunction M.onStart()\n  return 1\nend\nreturn M';
    const result = await parseRisuLuaModuleTableSource(source);

    expectParseSuccess(result);
    expect(result.metrics.lineStartsBuildCount).toBe(1);
  });

  it('exposes metrics with lineStartsBuildCount equal to 1 for failed parse', async () => {
    const result = await parseRisuLuaModuleTableSource('local M = {\nfunction broken(');

    expect(result.ok).toBe(false);
    expect(result.metrics.lineStartsBuildCount).toBe(1);
  });
});
