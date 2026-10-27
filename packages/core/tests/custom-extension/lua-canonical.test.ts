import { describe, expect, it } from 'vitest';
import type { CustomExtensionTarget } from '../../src/domain/custom-extension/contracts';
import {
  buildLuaPath,
  extractLuaFromCharx,
  extractLuaFromModule,
  injectLuaIntoCharx,
  injectLuaIntoModule,
  resolveDuplicateLuaSources,
  LuaAdapterError,
} from '../../src/domain/custom-extension/extensions/lua';

describe('lua canonical adapter', () => {

  describe('target discrimination', () => {
    it('rejects preset target with clear error', () => {
      expect(() => buildLuaPath('preset' as CustomExtensionTarget, 'test')).toThrow(
        LuaAdapterError,
      );
      expect(() => buildLuaPath('preset' as CustomExtensionTarget, 'test')).toThrow(
        /preset.*does not support.*risulua/,
      );
    });
  });

  describe('extractLuaFromModule', () => {
    it('extracts triggerlua code from module trigger array', () => {
      const module = {
        trigger: [
          {
            comment: 'init',
            effect: [{ type: 'triggerlua', code: 'function init() return 1 end' }],
          },
        ],
      };
      const result = extractLuaFromModule(module, 'module');
      expect(result).toBe('-- Trigger: init\nfunction init() return 1 end\n');
    });

    it('falls back to legacy module.triggerscript string', () => {
      const module = { triggerscript: 'function init() return 1 end' };
      const result = extractLuaFromModule(module, 'module');
      expect(result).toBe('function init() return 1 end');
    });
  });

  describe('injectLuaIntoCharx', () => {

    it('deletes field when content is null', () => {
      const charx: { triggerscript?: string } = { triggerscript: 'old' };
      injectLuaIntoCharx(charx, null, 'charx');
      expect(charx.triggerscript).toBeUndefined();
    });
  });

  describe('injectLuaIntoModule', () => {

    it('deletes field when content is null', () => {
      const module: { triggerscript?: string; trigger?: Array<Record<string, unknown>> } = {
        triggerscript: 'old',
        trigger: [{ type: 'manual' }],
      };
      injectLuaIntoModule(module, null, 'module');
      expect(module.triggerscript).toBeUndefined();
      expect(module.trigger).toBeUndefined();
    });
  });

  describe('resolveDuplicateLuaSources', () => {

    it('throws deterministically for multiple .risulua files (charx)', () => {
      const file1 = {
        target: 'charx' as const,
        source: 'lua/a.risulua',
        content: 'function a() end',
      };
      const file2 = {
        target: 'charx' as const,
        source: 'lua/b.risulua',
        content: 'function b() end',
      };
      expect(() => resolveDuplicateLuaSources([file1, file2])).toThrow(LuaAdapterError);
      expect(() => resolveDuplicateLuaSources([file1, file2])).toThrow(
        /Duplicate .risulua sources.*multiple files found/,
      );
    });
  });

  describe('round-trip integrity', () => {
    it('maintains lossless round-trip for charx triggerscript', () => {
      const original = `function onTrigger()
  local user = "{{user}}"
  print("Hello " .. user)
  return true
end`;
      const charx = { triggerscript: original };

      // Extract
      const extracted = extractLuaFromCharx(charx, 'charx');
      expect(extracted).toBe(original);

      // Serialize and inject back
      const newCharx: { triggerscript?: string } = {};
      injectLuaIntoCharx(newCharx, extracted, 'charx');
      expect(newCharx.triggerscript).toBe(original);
    });

    it('maintains lossless round-trip for module triggerscript', () => {
      const original = `function init()
  -- Module initialization
  globalState = {}
end

function process()
  return {{input}} * 2
end`;
      const module = { triggerscript: original };

      // Extract
      const extracted = extractLuaFromModule(module, 'module');
      expect(extracted).toBe(original);

      // Serialize and inject back
      const newModule: { triggerscript?: string; trigger?: Array<Record<string, unknown>> } = {};
      injectLuaIntoModule(newModule, extracted, 'module');
      expect(newModule.trigger).toEqual([
        {
          comment: 'Canonical Lua Trigger',
          type: 'manual',
          conditions: [],
          effect: [{ type: 'triggerlua', code: original }],
        },
      ]);
    });

    it('handles complex triggerscript with CBS placeholders', () => {
      const original = `function greet()
  local msg = "Welcome {{user}} to {{char}}'s adventure!"
  local time = "{{current_time}}"
  return {
    message = msg,
    timestamp = time,
    stats = {
      hp = {{hp}},
      mp = {{mp}}
    }
  }
end`;

      const charx = { triggerscript: original };
      const extracted = extractLuaFromCharx(charx, 'charx');

      const newCharx: { triggerscript?: string } = {};
      injectLuaIntoCharx(newCharx, extracted, 'charx');

      expect(newCharx.triggerscript).toBe(original);
    });

    it('handles empty triggerscript round-trip', () => {
      const original = '';
      const module = { triggerscript: original };

      const extracted = extractLuaFromModule(module, 'module');
      expect(extracted).toBe('');

      const newModule: { triggerscript?: string; trigger?: Array<Record<string, unknown>> } = {};
      injectLuaIntoModule(newModule, extracted, 'module');
      expect(newModule.trigger).toEqual([
        {
          comment: 'Canonical Lua Trigger',
          type: 'manual',
          conditions: [],
          effect: [{ type: 'triggerlua', code: '' }],
        },
      ]);
    });
  });
});
