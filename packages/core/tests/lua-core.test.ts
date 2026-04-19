import { describe, expect, it } from 'vitest';
import { analyzeLuaSource } from '../src/domain/analyze/lua-core';

describe('analyzeLuaSource', () => {
  it('returns reusable Lua analysis data for collectors, reports, and relationship network builders', () => {
    const result = analyzeLuaSource({
      filePath: '/tmp/sample.lua',
      source: `
        function setlanguage1()
          setChatVar('ct_Language', '1')
        end
        function onoutput()
          return getChatVar('ct_Language')
        end
      `,
      charxData: null,
    });

    expect(result.collected.stateVars.get('ct_Language')?.writtenBy.has('setlanguage1')).toBe(true);
    expect(result.collected.stateVars.get('ct_Language')?.readBy.has('onoutput')).toBe(true);
    expect(result.serialized.functions.find((fn) => fn.name === 'onoutput')?.stateReads).toContain(
      'ct_Language',
    );
    expect(result.elementCbs[0]).toMatchObject({ elementType: 'lua', elementName: 'sample' });
  });

  it('serializes standalone lua analysis from the shared core result', () => {
    const result = analyzeLuaSource({
      filePath: '/tmp/sample.lua',
      source: `
        function setlanguage1()
          setChatVar('ct_Language', '1')
        end
        function onoutput()
          return getChatVar('ct_Language')
        end
      `,
      charxData: null,
    });

    expect(result.serialized.stateVars.ct_Language).toBeDefined();
  });

  it('collects preload modules, require bindings, and resolved module calls without false links', () => {
    const result = analyzeLuaSource({
      filePath: '/tmp/preload-flow.lua',
      source: [
        "package.preload['pkg.alpha'] = function()",
        '  local M = {}',
        '  function M.run()',
        "    return getChatVar('ct_alpha')",
        '  end',
        '  return M',
        'end',
        '',
        'function onInput()',
        "  local alpha = require('pkg.alpha')",
        '  alpha.run()',
        "  local missing = require('pkg.missing')",
        '  missing.run()',
        'end',
      ].join('\n'),
      charxData: null,
    });

    const collected = result.collected as any;
    const analyzePhase = result.analyzePhase as any;

    expect(collected.preloadModules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleName: 'pkg.alpha',
          functionName: expect.any(String),
        }),
      ]),
    );
    expect(collected.requireBindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          localName: 'alpha',
          moduleName: 'pkg.alpha',
          containingFunction: 'oninput',
        }),
        expect.objectContaining({
          localName: 'missing',
          moduleName: 'pkg.missing',
          containingFunction: 'oninput',
        }),
      ]),
    );
    expect(collected.moduleMemberCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ caller: 'oninput', aliasName: 'alpha', memberName: 'run' }),
        expect.objectContaining({ caller: 'oninput', aliasName: 'missing', memberName: 'run' }),
      ]),
    );

    const exportedMembers = collected.preloadModules?.[0]?.exportedMembers as
      | Map<string, string>
      | undefined;
    expect(exportedMembers).toBeInstanceOf(Map);
    const resolvedCallee = exportedMembers?.get('run');
    expect(resolvedCallee).toBeTruthy();

    expect(analyzePhase.resolvedModuleCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          caller: 'oninput',
          callee: resolvedCallee,
          moduleName: 'pkg.alpha',
          memberName: 'run',
        }),
      ]),
    );
    expect(result.analyzePhase.callGraph.get('oninput')?.has(resolvedCallee as string)).toBe(true);
    expect(result.analyzePhase.calledBy.get(resolvedCallee as string)?.has('oninput')).toBe(true);
    expect(analyzePhase.resolvedModuleCalls).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ moduleName: 'pkg.missing' })]),
    );
  });

  it('collects lore api calls for main lore APIs and preserves upsert target names', () => {
    const result = analyzeLuaSource({
      filePath: '/tmp/lore-main.lua',
      source: [
        'function inspectLore(id)',
        '  local one = getLoreBooksMain(id, "Entry1")',
        '  local active = loadLoreBooksMain(id, 512)',
        '  upsertLocalLoreBook(id, "Entry1", "body", {})',
        '  return one, active',
        'end',
      ].join('\n'),
      charxData: null,
    });

    expect(result.collected.loreApiCalls).toEqual([
      {
        apiName: 'getLoreBooksMain',
        keyword: 'Entry1',
        line: 2,
        containingFunction: 'inspectlore',
      },
      {
        apiName: 'loadLoreBooksMain',
        keyword: null,
        line: 3,
        containingFunction: 'inspectlore',
      },
      {
        apiName: 'upsertLocalLoreBook',
        keyword: 'Entry1',
        line: 4,
        containingFunction: 'inspectlore',
      },
    ]);
    expect(result.serialized.functions.find((fn) => fn.name === 'inspectlore')?.apiNames).toEqual([
      'getLoreBooksMain',
      'loadLoreBooksMain',
      'upsertLocalLoreBook',
    ]);
  });

  it('reads wrapper state keys from getState/setState calls with chat context arguments', () => {
    const result = analyzeLuaSource({
      filePath: '/tmp/module-wrapper.lua',
      source: [
        'function boot(chat)',
        '  local current = getState(chat, "mode")',
        '  setState(chat, "mana", current)',
        'end',
      ].join('\n'),
      charxData: null,
    });

    expect(result.collected.stateVars.get('mode')?.readBy.has('boot')).toBe(true);
    expect(result.collected.stateVars.get('mana')?.writtenBy.has('boot')).toBe(true);
    expect(result.elementCbs[0]?.reads.has('mode')).toBe(true);
    expect(result.elementCbs[0]?.writes.has('mana')).toBe(true);
  });

  it('reads setChatVar/getChatVar keys when triggerId is passed as the first argument', () => {
    const result = analyzeLuaSource({
      filePath: '/tmp/module-trigger.lua',
      source: [
        'function boot(triggerId)',
        '  local current = getChatVar(triggerId, "mode")',
        '  setChatVar(triggerId, "mana", current)',
        'end',
      ].join('\n'),
      charxData: null,
    });

    expect(result.collected.stateVars.get('mode')?.readBy.has('boot')).toBe(true);
    expect(result.collected.stateVars.get('mana')?.writtenBy.has('boot')).toBe(true);
    expect(result.elementCbs[0]?.reads.has('mode')).toBe(true);
    expect(result.elementCbs[0]?.writes.has('mana')).toBe(true);
  });

  describe('stateAccessOccurrences metadata', () => {
    it('captures exact occurrence metadata for static getState calls', () => {
      const result = analyzeLuaSource({
        filePath: '/tmp/read-test.lua',
        source: [
          'function readMode()',
          '  return getState("mode")',
          'end',
        ].join('\n'),
        charxData: null,
      });

      const occurrences = result.collected.stateAccessOccurrences;
      expect(occurrences).toHaveLength(1);
      expect(occurrences[0]).toMatchObject({
        key: 'mode',
        direction: 'read',
        apiName: 'getState',
        containingFunction: 'readmode',
        line: 2,
      });
      // Verify exact byte range exists and is valid
      expect(occurrences[0].argStart).toBeGreaterThan(0);
      expect(occurrences[0].argEnd).toBeGreaterThan(occurrences[0].argStart);
    });

    it('captures exact occurrence metadata for static setState calls', () => {
      const result = analyzeLuaSource({
        filePath: '/tmp/write-test.lua',
        source: [
          'function writeMana()',
          '  setState("mana", 100)',
          'end',
        ].join('\n'),
        charxData: null,
      });

      const occurrences = result.collected.stateAccessOccurrences;
      expect(occurrences).toHaveLength(1);
      expect(occurrences[0]).toMatchObject({
        key: 'mana',
        direction: 'write',
        apiName: 'setState',
        containingFunction: 'writemana',
        line: 2,
      });
      expect(occurrences[0].argStart).toBeGreaterThan(0);
      expect(occurrences[0].argEnd).toBeGreaterThan(occurrences[0].argStart);
    });

    it('captures exact occurrence metadata for setChatVar/getChatVar calls', () => {
      const result = analyzeLuaSource({
        filePath: '/tmp/chatvar-test.lua',
        source: [
          'function updateChatVar()',
          '  setChatVar("user_pref", "dark")',
          '  return getChatVar("user_pref")',
          'end',
        ].join('\n'),
        charxData: null,
      });

      const occurrences = result.collected.stateAccessOccurrences;
      expect(occurrences).toHaveLength(2);

      const writeOcc = occurrences.find((o) => o.apiName === 'setChatVar');
      const readOcc = occurrences.find((o) => o.apiName === 'getChatVar');

      expect(writeOcc).toMatchObject({
        key: 'user_pref',
        direction: 'write',
        containingFunction: 'updatechatvar',
        line: 2,
      });
      expect(readOcc).toMatchObject({
        key: 'user_pref',
        direction: 'read',
        containingFunction: 'updatechatvar',
        line: 3,
      });
    });

    it('preserves one occurrence per static access without collapsing', () => {
      const result = analyzeLuaSource({
        filePath: '/tmp/multi-access.lua',
        source: [
          'function multiAccess()',
          '  setState("counter", 1)',
          '  setState("counter", 2)',
          '  setState("counter", 3)',
          'end',
        ].join('\n'),
        charxData: null,
      });

      const occurrences = result.collected.stateAccessOccurrences;
      expect(occurrences).toHaveLength(3);
      // Each occurrence should have a unique line
      const lines = occurrences.map((o) => o.line);
      expect(new Set(lines).size).toBe(3);
    });

    it('skips dynamic-key accesses without fabricating occurrences', () => {
      const result = analyzeLuaSource({
        filePath: '/tmp/dynamic-key.lua',
        source: [
          'function dynamicAccess(key)',
          '  setState(key, "value")',
          '  setState("static_key", "value")',
          'end',
        ].join('\n'),
        charxData: null,
      });

      const occurrences = result.collected.stateAccessOccurrences;
      // Dynamic key access (setState(key, "value")) should NOT produce a fake occurrence
      // Only the true static key access should be recorded
      expect(occurrences).toHaveLength(1);
      expect(occurrences[0].key).toBe('static_key');
      expect(occurrences[0].apiName).toBe('setState');
      expect(occurrences[0].containingFunction).toBe('dynamicaccess');
      // Verify the dynamic key access did not create a fake "value" occurrence
      const fakeValueOcc = occurrences.find((o) => o.key === 'value');
      expect(fakeValueOcc).toBeUndefined();
    });

    it('includes occurrences in serialized output', () => {
      const result = analyzeLuaSource({
        filePath: '/tmp/serialize-test.lua',
        source: [
          'function test()',
          '  setState("flag", true)',
          'end',
        ].join('\n'),
        charxData: null,
      });

      expect(result.serialized.stateAccessOccurrences).toHaveLength(1);
      expect(result.serialized.stateAccessOccurrences[0]).toMatchObject({
        key: 'flag',
        direction: 'write',
        apiName: 'setState',
        containingFunction: 'test',
      });
    });

    it('captures top-level occurrences with <top-level> as containing function', () => {
      const result = analyzeLuaSource({
        filePath: '/tmp/toplevel.lua',
        source: 'setState("global_flag", 1)',
        charxData: null,
      });

      const occurrences = result.collected.stateAccessOccurrences;
      expect(occurrences).toHaveLength(1);
      expect(occurrences[0].containingFunction).toBe('<top-level>');
      expect(occurrences[0].key).toBe('global_flag');
    });
  });
});
