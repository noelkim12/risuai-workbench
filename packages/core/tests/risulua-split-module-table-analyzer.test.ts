import { describe, expect, it } from 'vitest';

import {
  analyzeRisuLuaModuleTable,
  parseRisuLuaModuleTableSource,
  type RisuLuaModuleTableAnalyzerResult,
} from '../src/domain/risulua-split';

describe('risulua-split module-table analyzer', () => {
  it('records runtime roots separately from public host-visible globals', async () => {
    const result = await analyze(lines([
      'onOutput = async(function(text)',
      '  return text',
      'end)',
      '',
      'function setLanguage1(language)',
      '  return language',
      'end',
      '',
      'setHeroineClothes = async(function(clothes)',
      '  alertNormal(clothes)',
      'end)',
    ]));

    expect(result.runtimeRoots).toEqual([
      expect.objectContaining({ name: 'onOutput', kind: 'async-handler-assignment', wrapperKind: 'async-wrapper' }),
    ]);
    expect(result.publicGlobals).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'setLanguage1', kind: 'function-declaration', hostVisible: true }),
      expect.objectContaining({ name: 'setHeroineClothes', kind: 'async-function-assignment', wrapperKind: 'async-wrapper', hostVisible: true }),
    ]));
    expect(result.publicGlobals.map((global) => global.name)).not.toContain('onOutput');
    expect(result.lexicalSymbols).toEqual(expect.arrayContaining([
      expect.objectContaining({ originalName: 'onOutput', declarationKind: 'top-level-global-assignment', parameters: ['text'] }),
      expect.objectContaining({ originalName: 'setLanguage1', declarationKind: 'top-level-global-function', parameters: ['language'] }),
      expect.objectContaining({ originalName: 'setHeroineClothes', declarationKind: 'top-level-global-assignment', parameters: ['clothes'] }),
    ]));
  });

  it('classifies host reads writes UI async/network and dynamic environment effects', async () => {
    const result = await analyze(lines([
      'function onInput(key)',
      '  local value = getChatVar(key)',
      '  setChatVar("last", value)',
      '  alertSelect("pick", { "a", "b" })',
      '  LLM("prompt")',
      '  request("https://example.invalid")',
      '  Promise.resolve(value)',
      '  local existing = rawget(_G, key)',
      '  rawset(_G, key, existing)',
      '  return existing',
      'end',
    ]));

    expect(result.hostEffects.reads).toEqual(expect.arrayContaining(['getChatVar']));
    expect(result.hostEffects.writes).toEqual(expect.arrayContaining(['setChatVar']));
    expect(result.hostEffects.uiInteraction).toEqual(expect.arrayContaining(['alertSelect']));
    expect(result.hostEffects.asyncModelNetwork).toEqual(expect.arrayContaining(['LLM', 'request', 'Promise.resolve']));
    expect(result.hostEffects.dynamicEnvironment).toEqual(expect.arrayContaining(['_G', 'rawget', 'rawset']));
  });

  it('ignores block-comment and string-contained runtime roots or public globals', async () => {
    const result = await analyze(lines([
      '--[[',
      'listenEdit("profile.name", function(value)',
      '  setChatVar("bad", value)',
      'end)',
      'function commentedGlobal() return 1 end',
      ']]',
      'local quoted = "function onOutput(text) return text end"',
      'local alsoQuoted = "setHeroineClothes = async(function() end)"',
      'function onStart()',
      '  setChatVar("ready", "yes")',
      'end',
    ]));

    expect(result.runtimeRoots.map((root) => root.name)).toEqual(['onStart']);
    expect(result.publicGlobals.map((global) => global.name)).toEqual([]);
    expect(result.lexicalSymbols.map((symbol) => symbol.originalName)).toEqual(['onStart']);
    expect(result.proceduralBlocks.map((block) => block.name)).toContain('LocalStatement');
  });

  it('records nested handler helpers with parent metadata captures mutations and call sites', async () => {
    const result = await analyze(lines([
      'local count = 0',
      'function onOutput(text)',
      '  local suffix = "!"',
      '  local function decorate(value)',
      '    count = count + 1',
      '    return value .. suffix .. getChatVar("mood")',
      '  end',
      '  return decorate(text)',
      'end',
    ]));

    expect(result.runtimeRoots).toEqual([expect.objectContaining({ name: 'onOutput', kind: 'handler-function' })]);
    expect(result.nestedHandlerHelpers).toEqual([
      expect.objectContaining({
        name: 'decorate',
        parentHandler: expect.objectContaining({ name: 'onOutput', kind: 'handler' }),
        parameters: ['value'],
        captures: expect.arrayContaining(['count', 'suffix']),
        hostEffects: expect.objectContaining({ reads: ['getChatVar'] }),
      }),
    ]);
    const helper = result.nestedHandlerHelpers[0];
    expect(helper.mutations).toEqual([expect.objectContaining({ name: 'count', mutatesCapturedBinding: true })]);
    expect(helper.callSites).toEqual([expect.objectContaining({ name: 'decorate' })]);
  });

  it('records procedural block candidates but never marks them extractable', async () => {
    const result = await analyze(lines([
      'if getChatVar("enabled") then',
      '  setChatVar("seen", "yes")',
      'end',
      'local value = 1',
    ]));

    expect(result.proceduralBlocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'IfStatement', extractable: false }),
      expect.objectContaining({ name: 'LocalStatement', extractable: false }),
    ]));
    expect(result.proceduralBlocks.every((block) => block.extractable === false)).toBe(true);
  });

  it('resolves locals declared inside blocks and loop variables without reporting them as unknown globals', async () => {
    const result = await analyze(lines([
      'function buildStatus(triggerId, values)',
      '  local lines = {}',
      '  if triggerId then',
      '    local clearFlag = getChatVar(triggerId, "clear")',
      '    table.insert(lines, clearFlag)',
      '  end',
      '  for i = 1, #values do',
      '    local raw = values[i]',
      '    table.insert(lines, raw)',
      '  end',
      '  for _, t in ipairs(values) do',
      '    table.insert(lines, t)',
      '  end',
      '  return table.concat(lines, "|")',
      'end',
    ]));

    const symbol = result.lexicalSymbols.find((candidate) => candidate.originalName === 'buildStatus');
    expect(symbol).toBeDefined();
    const unresolvedNames = symbol!.references
      .filter((reference) => reference.resolvedScopeId === undefined)
      .map((reference) => reference.name);

    expect(unresolvedNames).not.toEqual(expect.arrayContaining(['clearFlag', 'i', '_', 't', 'raw', 'lines']));
    expect(symbol!.localDeclarations).toEqual(expect.arrayContaining(['clearFlag', 'i', '_', 't', 'raw', 'lines']));
  });
});

async function analyze(source: string): Promise<RisuLuaModuleTableAnalyzerResult> {
  const parseResult = await parseRisuLuaModuleTableSource(source);
  const analyzerResult = analyzeRisuLuaModuleTable({ source, parseResult });
  expect(analyzerResult.ok).toBe(true);
  return analyzerResult;
}

function lines(sourceLines: string[]): string {
  return `${sourceLines.join('\n')}\n`;
}
