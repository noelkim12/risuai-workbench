import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  collectLorebookEntryInfosFromDir,
  collectRegexScriptInfosFromDir,
  collectLorebookTokenComponentsFromDir,
  collectRegexTokenComponentsFromDir,
  collectLuaTokenComponents,
} from '../src/cli/analyze/shared/cross-cutting';

describe('cross-cutting canonical-first collectors', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cross-cutting-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('collectLorebookEntryInfosFromDir', () => {
    it('prefers .risulorebook files over JSON when both exist', () => {
      const lorebooksDir = path.join(tempDir, 'lorebooks');
      fs.mkdirSync(lorebooksDir, { recursive: true });

      // Create canonical file
      fs.writeFileSync(
        path.join(lorebooksDir, 'entry1.risulorebook'),
        `---
name: Canonical Entry
comment: Canonical Entry Comment
mode: normal
constant: true
selective: false
insertion_order: 100
case_sensitive: false
use_regex: false
---
@@@ KEYS
keyword1
keyword2
@@@ CONTENT
Canonical content here.
`
      );

      // Create legacy JSON file (should be ignored)
      fs.writeFileSync(
        path.join(lorebooksDir, 'entry1.json'),
        JSON.stringify({
          name: 'Legacy Entry',
          keys: ['legacy-key'],
          content: 'Legacy content.',
          constant: false,
        })
      );

      const result = collectLorebookEntryInfosFromDir(lorebooksDir);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Canonical Entry');
      expect(result[0].keywords).toEqual(['keyword1', 'keyword2']);
      expect(result[0].constant).toBe(true);
    });

    it('falls back to JSON files when no .risulorebook exists', () => {
      const lorebooksDir = path.join(tempDir, 'lorebooks');
      fs.mkdirSync(lorebooksDir, { recursive: true });

      fs.writeFileSync(
        path.join(lorebooksDir, 'legacy.json'),
        JSON.stringify({
          name: 'Legacy Entry',
          keys: ['legacy-key'],
          content: 'Legacy content.',
          constant: false,
          enabled: true,
        })
      );

      const result = collectLorebookEntryInfosFromDir(lorebooksDir);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Legacy Entry');
      expect(result[0].keywords).toEqual(['legacy-key']);
    });

    it('respects _order.json for canonical files', () => {
      const lorebooksDir = path.join(tempDir, 'lorebooks');
      fs.mkdirSync(lorebooksDir, { recursive: true });

      fs.writeFileSync(
        path.join(lorebooksDir, 'zeta.risulorebook'),
        `---
name: Zeta Entry
comment: Zeta Comment
mode: normal
constant: false
selective: false
insertion_order: 1
case_sensitive: false
use_regex: false
---
@@@ KEYS
zeta
@@@ CONTENT
Zeta content.
`
      );

      fs.writeFileSync(
        path.join(lorebooksDir, 'alpha.risulorebook'),
        `---
name: Alpha Entry
comment: Alpha Comment
mode: normal
constant: false
selective: false
insertion_order: 2
case_sensitive: false
use_regex: false
---
@@@ KEYS
alpha
@@@ CONTENT
Alpha content.
`
      );

      // Create order file reversing the order
      fs.writeFileSync(
        path.join(lorebooksDir, '_order.json'),
        JSON.stringify(['zeta.risulorebook', 'alpha.risulorebook'])
      );

      const result = collectLorebookEntryInfosFromDir(lorebooksDir);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Zeta Entry');
      expect(result[1].name).toBe('Alpha Entry');
    });

    it('skips folder-mode entries in canonical files', () => {
      const lorebooksDir = path.join(tempDir, 'lorebooks');
      fs.mkdirSync(lorebooksDir, { recursive: true });

      fs.writeFileSync(
        path.join(lorebooksDir, 'folder.risulorebook'),
        `---
name: Folder Entry
comment: Folder Comment
mode: folder
constant: false
selective: false
insertion_order: 100
case_sensitive: false
use_regex: false
---
@@@ KEYS
folder-key
@@@ CONTENT
`
      );

      fs.writeFileSync(
        path.join(lorebooksDir, 'normal.risulorebook'),
        `---
name: Normal Entry
comment: Normal Comment
mode: normal
constant: false
selective: false
insertion_order: 101
case_sensitive: false
use_regex: false
---
@@@ KEYS
normal-key
@@@ CONTENT
Normal content.
`
      );

      const result = collectLorebookEntryInfosFromDir(lorebooksDir);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Normal Entry');
    });
  });

  describe('collectRegexScriptInfosFromDir', () => {
    it('prefers .risuregex files over JSON when both exist', () => {
      const regexDir = path.join(tempDir, 'regex');
      fs.mkdirSync(regexDir, { recursive: true });

      // Create canonical file
      fs.writeFileSync(
        path.join(regexDir, 'script1.risuregex'),
        `---
comment: Canonical Regex
type: editinput
---
@@@ IN
canonical-in
@@@ OUT
canonical-out
`
      );

      // Create legacy JSON file (should be ignored)
      fs.writeFileSync(
        path.join(regexDir, 'script1.json'),
        JSON.stringify({
          comment: 'Legacy Regex',
          in: 'legacy-in',
          out: 'legacy-out',
        })
      );

      const result = collectRegexScriptInfosFromDir(regexDir);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Canonical Regex');
      expect(result[0].in).toBe('canonical-in');
      expect(result[0].out).toBe('canonical-out');
    });

    it('falls back to JSON files when no .risuregex exists', () => {
      const regexDir = path.join(tempDir, 'regex');
      fs.mkdirSync(regexDir, { recursive: true });

      fs.writeFileSync(
        path.join(regexDir, 'legacy.json'),
        JSON.stringify({
          comment: 'Legacy Regex',
          in: 'legacy-in',
          out: 'legacy-out',
        })
      );

      const result = collectRegexScriptInfosFromDir(regexDir);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Legacy Regex');
      expect(result[0].in).toBe('legacy-in');
    });

    it('respects _order.json for canonical .risuregex files', () => {
      const regexDir = path.join(tempDir, 'regex');
      fs.mkdirSync(regexDir, { recursive: true });

      fs.writeFileSync(
        path.join(regexDir, 'zeta.risuregex'),
        `---
comment: Zeta Regex
type: editinput
---
@@@ IN
zeta-in
@@@ OUT
zeta-out
`
      );

      fs.writeFileSync(
        path.join(regexDir, 'alpha.risuregex'),
        `---
comment: Alpha Regex
type: editinput
---
@@@ IN
alpha-in
@@@ OUT
alpha-out
`
      );

      fs.writeFileSync(
        path.join(regexDir, '_order.json'),
        JSON.stringify(['zeta.risuregex', 'alpha.risuregex'])
      );

      const result = collectRegexScriptInfosFromDir(regexDir);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Zeta Regex');
      expect(result[1].name).toBe('Alpha Regex');
    });
  });

  describe('collectLorebookTokenComponentsFromDir', () => {
    it('prefers .risulorebook files over JSON for token budget', () => {
      const lorebooksDir = path.join(tempDir, 'lorebooks');
      fs.mkdirSync(lorebooksDir, { recursive: true });

      // Create canonical file
      fs.writeFileSync(
        path.join(lorebooksDir, 'entry.risulorebook'),
        `---
name: Token Entry
comment: Token Comment
mode: normal
constant: true
selective: false
insertion_order: 100
case_sensitive: false
use_regex: false
---
@@@ KEYS
test-key
@@@ CONTENT
Canonical token content.
`
      );

      // Create legacy JSON file (should be ignored)
      fs.writeFileSync(
        path.join(lorebooksDir, 'entry.json'),
        JSON.stringify({
          name: 'Legacy Entry',
          keys: ['legacy'],
          content: 'Legacy token content.',
          constant: false,
        })
      );

      const result = collectLorebookTokenComponentsFromDir(lorebooksDir, 'lorebook');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('entry');
      expect(result[0].text).toBe('Canonical token content.');
      expect(result[0].alwaysActive).toBe(true);
    });

    it('falls back to JSON for token budget when no canonical exists', () => {
      const lorebooksDir = path.join(tempDir, 'lorebooks');
      fs.mkdirSync(lorebooksDir, { recursive: true });

      fs.writeFileSync(
        path.join(lorebooksDir, 'legacy.json'),
        JSON.stringify({
          name: 'Legacy Entry',
          keys: ['legacy'],
          content: 'Legacy content.',
          constant: false,
        })
      );

      const result = collectLorebookTokenComponentsFromDir(lorebooksDir, 'lorebook');

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('Legacy content.');
      expect(result[0].alwaysActive).toBe(false);
    });

    it('skips folder-mode entries for token budget', () => {
      const lorebooksDir = path.join(tempDir, 'lorebooks');
      fs.mkdirSync(lorebooksDir, { recursive: true });

      fs.writeFileSync(
        path.join(lorebooksDir, 'folder.risulorebook'),
        `---
name: Folder
comment: Folder Comment
mode: folder
constant: false
selective: false
insertion_order: 100
case_sensitive: false
use_regex: false
---
@@@ KEYS
folder-key
@@@ CONTENT
`
      );

      const result = collectLorebookTokenComponentsFromDir(lorebooksDir, 'lorebook');

      expect(result).toHaveLength(0);
    });
  });

  describe('collectRegexTokenComponentsFromDir', () => {
    it('prefers .risuregex files over JSON for token budget', () => {
      const regexDir = path.join(tempDir, 'regex');
      fs.mkdirSync(regexDir, { recursive: true });

      // Create canonical file
      fs.writeFileSync(
        path.join(regexDir, 'script.risuregex'),
        `---
comment: Token Regex
type: editinput
flag: g
---
@@@ IN
canonical-pattern
@@@ OUT
canonical-replacement
`
      );

      // Create legacy JSON file (should be ignored)
      fs.writeFileSync(
        path.join(regexDir, 'script.json'),
        JSON.stringify({
          comment: 'Legacy Regex',
          in: 'legacy-pattern',
          out: 'legacy-replacement',
          flag: '',
        })
      );

      const result = collectRegexTokenComponentsFromDir(regexDir, 'regex');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Token Regex');
      expect(result[0].text).toContain('canonical-pattern');
      expect(result[0].text).toContain('canonical-replacement');
      expect(result[0].text).toContain('g');
    });

    it('falls back to JSON for token budget when no canonical exists', () => {
      const regexDir = path.join(tempDir, 'regex');
      fs.mkdirSync(regexDir, { recursive: true });

      fs.writeFileSync(
        path.join(regexDir, 'legacy.json'),
        JSON.stringify({
          comment: 'Legacy Regex',
          in: 'legacy-in',
          out: 'legacy-out',
          flag: 'i',
        })
      );

      const result = collectRegexTokenComponentsFromDir(regexDir, 'regex');

      expect(result).toHaveLength(1);
      expect(result[0].text).toContain('legacy-in');
      expect(result[0].text).toContain('legacy-out');
      expect(result[0].text).toContain('i');
    });
  });

  describe('collectLuaTokenComponents', () => {
    it('prefers .risulua files over .lua when both exist', () => {
      const outputDir = path.join(tempDir, 'output');
      const luaDir = path.join(outputDir, 'lua');
      fs.mkdirSync(luaDir, { recursive: true });

      // Create canonical file
      fs.writeFileSync(
        path.join(luaDir, 'script.risulua'),
        'function canonical() return true end'
      );

      // Create legacy file (should be ignored)
      fs.writeFileSync(
        path.join(luaDir, 'script.lua'),
        'function legacy() return false end'
      );

      const result = collectLuaTokenComponents(outputDir, 'lua');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('script.risulua');
      expect(result[0].text).toBe('function canonical() return true end');
    });

    it('falls back to .lua files when no .risulua exists', () => {
      const outputDir = path.join(tempDir, 'output');
      const luaDir = path.join(outputDir, 'lua');
      fs.mkdirSync(luaDir, { recursive: true });

      fs.writeFileSync(
        path.join(luaDir, 'legacy.lua'),
        'function legacy() return false end'
      );

      const result = collectLuaTokenComponents(outputDir, 'lua');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('legacy.lua');
      expect(result[0].text).toBe('function legacy() return false end');
    });
  });
});
