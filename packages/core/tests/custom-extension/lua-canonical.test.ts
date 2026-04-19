import { describe, expect, it } from 'vitest';
import type { CustomExtensionTarget } from '../../src/domain/custom-extension/contracts';
import {
  buildLuaPath,
  extractLuaFromCharx,
  extractLuaFromModule,
  injectLuaIntoCharx,
  injectLuaIntoModule,
  parseLuaContent,
  resolveDuplicateLuaSources,
  serializeLuaContent,
  LuaAdapterError,
} from '../../src/domain/custom-extension/extensions/lua';

describe('lua canonical adapter', () => {
  describe('parseLuaContent', () => {
    it('preserves exact file content without transformation', () => {
      const content = `function onTrigger()
  print("Hello World")
  return true
end`;
      expect(parseLuaContent(content)).toBe(content);
    });

    it('preserves empty strings', () => {
      expect(parseLuaContent('')).toBe('');
    });

    it('preserves multiline Lua scripts with comments', () => {
      const multiline = `-- Trigger script for character
-- This is a comment
function init()
  --[[
    Multi-line comment block
  --]]
  local x = 1
  return x
end`;
      expect(parseLuaContent(multiline)).toBe(multiline);
    });

    it('preserves leading and trailing whitespace', () => {
      const content = '  \nfunction test()\n  return 1\nend\n  ';
      expect(parseLuaContent(content)).toBe(content);
    });

    it('preserves Lua code with CBS string literals', () => {
      const content = `function greet()
  local msg = "Hello {{user}}, welcome to {{char}}'s world!"
  return msg
end`;
      expect(parseLuaContent(content)).toBe(content);
    });

    it('preserves complex triggerscript with multiple functions', () => {
      const complex = `function onLoad()
  print("Loading...")
end

function onTrigger()
  if condition then
    return "{{result}}"
  end
end

function onUnload()
  print("Unloading...")
end`;
      expect(parseLuaContent(complex)).toBe(complex);
    });
  });

  describe('serializeLuaContent', () => {
    it('serializes content exactly as-is', () => {
      const content = `function test()
  return 42
end`;
      expect(serializeLuaContent(content)).toBe(content);
    });

    it('serializes empty strings', () => {
      expect(serializeLuaContent('')).toBe('');
    });

    it('is inverse of parseLuaContent (round-trip identity)', () => {
      const original = `function calculate()
  local x = {{value}}
  return x * 2
end`;
      const parsed = parseLuaContent(original);
      const serialized = serializeLuaContent(parsed);
      expect(serialized).toBe(original);
    });
  });

  describe('target discrimination', () => {
    it('rejects preset target with clear error', () => {
      expect(() => buildLuaPath('preset' as CustomExtensionTarget, 'test')).toThrow(
        LuaAdapterError
      );
      expect(() => buildLuaPath('preset' as CustomExtensionTarget, 'test')).toThrow(
        /preset.*does not support.*risulua/
      );
    });

    it('accepts charx target', () => {
      expect(() => buildLuaPath('charx', 'test-charx')).not.toThrow();
    });

    it('accepts module target', () => {
      expect(() => buildLuaPath('module', 'test-module')).not.toThrow();
    });
  });

  describe('buildLuaPath', () => {
    it('builds charx Lua path with target name', () => {
      const path = buildLuaPath('charx', 'MyCharacter');
      expect(path).toBe('lua/MyCharacter.risulua');
    });

    it('builds module Lua path with target name', () => {
      const path = buildLuaPath('module', 'my-module');
      expect(path).toBe('lua/my-module.risulua');
    });

    it('sanitizes names with special characters', () => {
      const path = buildLuaPath('charx', 'char/with\\slashes');
      expect(path).toBe('lua/char_with_slashes.risulua');
    });

    it('preserves Korean characters in names', () => {
      const path = buildLuaPath('module', '라이트보드-모듈');
      expect(path).toBe('lua/라이트보드-모듈.risulua');
    });

    it('throws for charx without target name', () => {
      expect(() => buildLuaPath('charx', '')).toThrow(LuaAdapterError);
    });

    it('throws for module without target name', () => {
      expect(() => buildLuaPath('module', '')).toThrow(LuaAdapterError);
    });

    it('uses target name for naming (not inferred function names)', () => {
      // Per spec: naming is based on target name, not function names in the script
      const path = buildLuaPath('module', 'merry-rpg-module');
      expect(path).toBe('lua/merry-rpg-module.risulua');
    });
  });

  describe('extractLuaFromCharx', () => {
    it('extracts triggerscript from charx', () => {
      const charx = { triggerscript: 'function onTrigger() return true end' };
      const result = extractLuaFromCharx(charx, 'charx');
      expect(result).toBe('function onTrigger() return true end');
    });

    it('returns null when triggerscript is undefined', () => {
      const charx = {};
      const result = extractLuaFromCharx(charx, 'charx');
      expect(result).toBeNull();
    });

    it('returns null when triggerscript is null', () => {
      const charx = { triggerscript: null as unknown as string };
      const result = extractLuaFromCharx(charx, 'charx');
      expect(result).toBeNull();
    });

    it('preserves empty string triggerscript', () => {
      const charx = { triggerscript: '' };
      const result = extractLuaFromCharx(charx, 'charx');
      expect(result).toBe('');
    });

    it('rejects module target for charx extraction', () => {
      const charx = { triggerscript: 'content' };
      expect(() => extractLuaFromCharx(charx, 'module')).toThrow(LuaAdapterError);
    });

    it('rejects preset target', () => {
      const charx = { triggerscript: 'content' };
      expect(() =>
        extractLuaFromCharx(charx, 'preset' as CustomExtensionTarget)
      ).toThrow(LuaAdapterError);
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

    it('returns null when triggerscript is undefined', () => {
      const module = {};
      const result = extractLuaFromModule(module, 'module');
      expect(result).toBeNull();
    });

    it('returns null when triggerscript is null', () => {
      const module = { triggerscript: null as unknown as string };
      const result = extractLuaFromModule(module, 'module');
      expect(result).toBeNull();
    });

    it('preserves empty string triggerscript', () => {
      const module = { triggerscript: '' };
      const result = extractLuaFromModule(module, 'module');
      expect(result).toBe('');
    });

    it('rejects charx target for module extraction', () => {
      const module = { triggerscript: 'content' };
      expect(() => extractLuaFromModule(module, 'charx')).toThrow(LuaAdapterError);
    });

    it('rejects preset target', () => {
      const module = { triggerscript: 'content' };
      expect(() =>
        extractLuaFromModule(module, 'preset' as CustomExtensionTarget)
      ).toThrow(LuaAdapterError);
    });
  });

  describe('injectLuaIntoCharx', () => {
    it('injects triggerscript into charx', () => {
      const charx: { triggerscript?: string } = {};
      injectLuaIntoCharx(charx, 'function test() end', 'charx');
      expect(charx.triggerscript).toBe('function test() end');
    });

    it('deletes field when content is null', () => {
      const charx: { triggerscript?: string } = { triggerscript: 'old' };
      injectLuaIntoCharx(charx, null, 'charx');
      expect(charx.triggerscript).toBeUndefined();
    });

    it('injects empty string triggerscript', () => {
      const charx: { triggerscript?: string } = {};
      injectLuaIntoCharx(charx, '', 'charx');
      expect(charx.triggerscript).toBe('');
    });

    it('rejects module target for charx injection', () => {
      const charx: { triggerscript?: string } = {};
      expect(() => injectLuaIntoCharx(charx, 'content', 'module')).toThrow(
        LuaAdapterError
      );
    });

    it('rejects preset target', () => {
      const charx: { triggerscript?: string } = {};
      expect(() =>
        injectLuaIntoCharx(charx, 'content', 'preset' as CustomExtensionTarget)
      ).toThrow(LuaAdapterError);
    });
  });

  describe('injectLuaIntoModule', () => {
    it('injects canonical lua into module trigger array', () => {
      const module: { triggerscript?: string; trigger?: Array<Record<string, unknown>> } = {};
      injectLuaIntoModule(module, 'function init() end', 'module');
      expect(module.triggerscript).toBeUndefined();
      expect(module.trigger).toEqual([
        {
          comment: 'Canonical Lua Trigger',
          type: 'manual',
          conditions: [],
          effect: [{ type: 'triggerlua', code: 'function init() end' }],
        },
      ]);
    });

    it('deletes field when content is null', () => {
      const module: { triggerscript?: string; trigger?: Array<Record<string, unknown>> } = {
        triggerscript: 'old',
        trigger: [{ type: 'manual' }],
      };
      injectLuaIntoModule(module, null, 'module');
      expect(module.triggerscript).toBeUndefined();
      expect(module.trigger).toBeUndefined();
    });

    it('injects empty string triggerscript', () => {
      const module: { triggerscript?: string; trigger?: Array<Record<string, unknown>> } = {};
      injectLuaIntoModule(module, '', 'module');
      expect(module.trigger).toEqual([
        {
          comment: 'Canonical Lua Trigger',
          type: 'manual',
          conditions: [],
          effect: [{ type: 'triggerlua', code: '' }],
        },
      ]);
    });

    it('rejects charx target for module injection', () => {
      const module: { triggerscript?: string } = {};
      expect(() => injectLuaIntoModule(module, 'content', 'charx')).toThrow(
        LuaAdapterError
      );
    });

    it('rejects preset target', () => {
      const module: { triggerscript?: string } = {};
      expect(() =>
        injectLuaIntoModule(module, 'content', 'preset' as CustomExtensionTarget)
      ).toThrow(LuaAdapterError);
    });
  });

  describe('resolveDuplicateLuaSources', () => {
    it('returns single source as-is', () => {
      const source = {
        target: 'module' as const,
        source: 'lua/test.risulua',
        content: 'function test() end',
      };
      expect(resolveDuplicateLuaSources([source])).toBe(source);
    });

    it('throws when no sources provided', () => {
      expect(() => resolveDuplicateLuaSources([])).toThrow(LuaAdapterError);
      expect(() => resolveDuplicateLuaSources([])).toThrow(/No Lua sources provided/);
    });

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
      expect(() => resolveDuplicateLuaSources([file1, file2])).toThrow(
        LuaAdapterError
      );
      expect(() => resolveDuplicateLuaSources([file1, file2])).toThrow(
        /Duplicate .risulua sources.*multiple files found/
      );
    });

    it('throws deterministically for multiple .risulua files (module)', () => {
      const file1 = {
        target: 'module' as const,
        source: 'lua/script1.risulua',
        content: 'function one() end',
      };
      const file2 = {
        target: 'module' as const,
        source: 'lua/script2.risulua',
        content: 'function two() end',
      };
      expect(() => resolveDuplicateLuaSources([file1, file2])).toThrow(
        LuaAdapterError
      );
      expect(() => resolveDuplicateLuaSources([file1, file2])).toThrow(
        /Duplicate .risulua sources.*multiple files found/
      );
    });

    it('throws for three or more duplicate sources', () => {
      const sources = [
        { target: 'module' as const, source: 'lua/a.risulua', content: 'a' },
        { target: 'module' as const, source: 'lua/b.risulua', content: 'b' },
        { target: 'module' as const, source: 'lua/c.risulua', content: 'c' },
      ];
      expect(() => resolveDuplicateLuaSources(sources)).toThrow(LuaAdapterError);
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

    it('preserves exact byte-for-byte content including all whitespace', () => {
      const original = `function test()
\tlocal x = 1\n\t\tlocal y = 2\n  \n  return x + y\nend\n`;
      const charx = { triggerscript: original };

      const extracted = extractLuaFromCharx(charx, 'charx');
      const newCharx: { triggerscript?: string } = {};
      injectLuaIntoCharx(newCharx, extracted, 'charx');

      expect(newCharx.triggerscript).toBe(original);
    });
  });

  describe('one-file-per-target enforcement', () => {
    it('enforces single file per charx target', () => {
      // Per spec: exactly one .risulua file per charx
      const sources = [
        { target: 'charx' as const, source: 'lua/char1.risulua', content: 'a' },
        { target: 'charx' as const, source: 'lua/char2.risulua', content: 'b' },
      ];
      expect(() => resolveDuplicateLuaSources(sources)).toThrow(
        /Only one .risulua file per target/
      );
    });

    it('enforces single file per module target', () => {
      // Per spec: exactly one .risulua file per module
      const sources = [
        { target: 'module' as const, source: 'lua/mod1.risulua', content: 'a' },
        { target: 'module' as const, source: 'lua/mod2.risulua', content: 'b' },
      ];
      expect(() => resolveDuplicateLuaSources(sources)).toThrow(
        /Only one .risulua file per target/
      );
    });

    it('allows single file for charx', () => {
      const sources = [
        { target: 'charx' as const, source: 'lua/MyChar.risulua', content: 'function() end' },
      ];
      expect(() => resolveDuplicateLuaSources(sources)).not.toThrow();
    });

    it('allows single file for module', () => {
      const sources = [
        { target: 'module' as const, source: 'lua/MyMod.risulua', content: 'function() end' },
      ];
      expect(() => resolveDuplicateLuaSources(sources)).not.toThrow();
    });
  });
});
