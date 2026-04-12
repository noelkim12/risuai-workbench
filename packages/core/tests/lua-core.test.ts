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
      charxArg: null,
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
      charxArg: null,
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
      charxArg: null,
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
});
