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
    expect(result.serialized.functions.find((fn) => fn.name === 'onoutput')?.stateReads).toContain('ct_Language');
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
});
