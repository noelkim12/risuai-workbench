import { describe, expect, it } from 'vitest';

import { parseSimpleLuaString, unescapeSimpleLuaString } from '../src/domain/risulua-split/shared/lua-string';
import { normalizeSourcePath, inferTargetName } from '../src/domain/risulua-split/shared/source-path';
import { lineOnlyRange, wholeSourceRange } from '../src/domain/risulua-split/shared/source-range';
import { serializeStableJson } from '../src/domain/risulua-split/shared/stable-json';
import { collectPresent, escapeRegExp } from '../src/domain/risulua-split/shared/string-patterns';

describe('risulua-split shared planner helpers', () => {
  describe('source range helpers', () => {
    it('creates a whole-source range for empty and multiline sources', () => {
      expect(wholeSourceRange('')).toEqual({ startLine: 1, endLine: 1, startOffset: 0, endOffset: 0 });
      expect(wholeSourceRange('a\nb\n')).toEqual({ startLine: 1, endLine: 3, startOffset: 0, endOffset: 4 });
      expect(wholeSourceRange('a\nb')).toEqual({ startLine: 1, endLine: 2, startOffset: 0, endOffset: 3 });
    });

    it('creates a zero-width range for diagnostics that only know a line', () => {
      expect(lineOnlyRange(7)).toEqual({ startLine: 7, endLine: 7, startOffset: 0, endOffset: 0 });
    });
  });

  describe('source path helpers', () => {
    it('normalizes Windows separators without changing POSIX paths', () => {
      expect(normalizeSourcePath('C:\\bots\\main.risulua')).toBe('C:/bots/main.risulua');
      expect(normalizeSourcePath('lua/main.risulua')).toBe('lua/main.risulua');
    });

    it('infers target names from normalized source paths', () => {
      expect(inferTargetName('C:\\bots\\Example.RISULUA')).toBe('Example');
      expect(inferTargetName('lua/nested/story.risulua')).toBe('story');
      expect(inferTargetName('.risulua')).toBe('main');
    });
  });

  describe('string pattern helpers', () => {
    it('escapes RegExp metacharacters for literal matching', () => {
      const escaped = escapeRegExp('a+b*c?.lua');
      expect(new RegExp(escaped).test('a+b*c?.lua')).toBe(true);
      expect(new RegExp(escaped).test('aaabxcxlua')).toBe(false);
    });

    it('collects only whole-word present names', () => {
      const source = 'getChatVar() setChatVar() getChatVariable() request_now()';
      expect(collectPresent(source, ['getChatVar', 'setChatVar', 'getChat', 'request'])).toEqual([
        'getChatVar',
        'setChatVar',
      ]);
    });
  });

  describe('Lua string helpers', () => {
    it('parses single and double quoted short string literals', () => {
      expect(parseSimpleLuaString('"./module"')).toBe('./module');
      expect(parseSimpleLuaString("'./module'")).toBe('./module');
      expect(parseSimpleLuaString(' [[./module]] ')).toBeNull();
      expect(parseSimpleLuaString('moduleName')).toBeNull();
    });

    it('unescapes the shared simple Lua escape set', () => {
      expect(unescapeSimpleLuaString('a\\ab\\bc\\fd\\ne\\rf\\tg\\v')).toBe('a\x07b\bc\fd\ne\rf\tg\v');
      expect(parseSimpleLuaString('"quote: \\\" slash: \\\\"')).toBe('quote: " slash: \\');
      expect(parseSimpleLuaString(String.raw`'quote: \' slash: \\'`)).toBe("quote: ' slash: \\");
    });

    it('preserves unsupported escape spellings instead of widening into a full Lua lexer', () => {
      expect(parseSimpleLuaString('"numeric: \\123 unknown: \\z"')).toBe('numeric: \\123 unknown: \\z');
    });
  });

  describe('stable JSON helpers', () => {
    it('replaces cwd with <repo-root> placeholder', () => {
      const input = { sourceFile: '/home/user/project/main.risulua' };
      const json = serializeStableJson(input, { cwd: '/home/user/project' });
      expect(json).toContain('<repo-root>/main.risulua');
      expect(json).not.toContain('/home/user/project');
    });

    it('normalizes Windows backslash separators to forward slashes', () => {
      const input = { path: 'C:\\bots\\modules\\chat.lua' };
      const json = serializeStableJson(input, { cwd: 'C:/bots' });
      expect(json).toContain('<repo-root>/modules/chat.lua');
    });

    it('replaces exact cwd match with bare <repo-root>', () => {
      const input = { root: '/home/user/project' };
      const json = serializeStableJson(input, { cwd: '/home/user/project' });
      expect(json).toContain('"<repo-root>"');
    });

    it('appends trailing newline after JSON', () => {
      const json = serializeStableJson({ a: 1 });
      expect(json.endsWith('\n')).toBe(true);
      expect(json.endsWith('}\n')).toBe(true);
    });

    it('uses two-space indentation', () => {
      const json = serializeStableJson({ key: 'value' });
      expect(json).toContain('{\n  "key": "value"\n}');
    });

    it('does not mutate the input object', () => {
      const input = { path: '/home/user/project/main.risulua', nested: { child: '/home/user/project/sub.lua' } };
      const original = JSON.parse(JSON.stringify(input));
      serializeStableJson(input, { cwd: '/home/user/project' });
      expect(input).toEqual(original);
    });

    it('does not mutate the input array', () => {
      const input = ['/home/user/project/a.lua', '/home/user/project/b.lua'];
      const original = [...input];
      serializeStableJson(input, { cwd: '/home/user/project' });
      expect(input).toEqual(original);
    });

    it('normalizes strings recursively in nested objects and arrays', () => {
      const input = {
        files: [
          '/home/user/project/a.lua',
          '/home/user/project/b.lua',
        ],
        meta: {
          root: '/home/user/project',
          other: 'plain text',
        },
      };
      const json = serializeStableJson(input, { cwd: '/home/user/project' });
      expect(json).toContain('<repo-root>/a.lua');
      expect(json).toContain('<repo-root>/b.lua');
      expect(json).toContain('"<repo-root>"');
      expect(json).toContain('"plain text"');
    });
  });
});
