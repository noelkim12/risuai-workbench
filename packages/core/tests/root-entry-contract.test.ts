import { describe, expect, it } from 'vitest';
import type { CardData, CharxData, RegexScript, LorebookEntry } from 'risu-workbench-core';

describe('root entry contract (1-7)', () => {
  it('should export only types and domain, not shared', async () => {
    // Import the built root entry as Record to avoid TS2339 on missing properties
    const core = (await import('risu-workbench-core')) as Record<string, unknown>;
    
    // Verify domain exports exist (pure logic, no Node.js I/O)
    expect(core.extractCBSVarOps).toBeTypeOf('function');
    expect(core.buildRisuFolderMap).toBeTypeOf('function');
    expect(core.analyzeLorebookStructure).toBeTypeOf('function');
    expect(core.collectRegexCBSFromCharx).toBeTypeOf('function');
    expect(core.collectRegexCBSFromCard).toBeTypeOf('function');
    expect(core.getCharxName).toBeTypeOf('function');
    expect(core.resolveAssetUri).toBeTypeOf('function');
    
    // Verify shared-only exports are NOT present (Node.js I/O helpers)
    // These are browser-unsafe and should only be available via './node' entry
    expect('parseCardFile' in core).toBe(false);
    expect('ensureDir' in core).toBe(false);
    expect('writeJson' in core).toBe(false);
    expect('writeBinary' in core).toBe(false);
    expect('parsePngTextChunks' in core).toBe(false);
    expect('stripPngTextChunks' in core).toBe(false);
    expect('decodeCharacterJsonFromChunks' in core).toBe(false);
  });

  it('should have TypeScript types available for types and domain', () => {
    // Verify all imported types are used and available at compile time
    const cardData: CardData = {
      name: 'test',
      creator: 'test',
      createdAt: '2026-03-15',
      specVersion: '1.0',
      regexScripts: [],
      triggerScripts: '',
      backgroundHTML: '',
      lorebook: [],
      defaultVariables: [],
      hasLua: false,
      hasHTML: false,
      hasLorebook: false,
      isNew: false,
    };

    const charxData: CharxData = cardData;
    
    const regexScript: RegexScript = {
      id: 'test',
      comment: 'test',
      type: 'editprocess',
      findRegex: 'test',
      replaceString: 'test',
    };
    
    const lorebookEntry: LorebookEntry = {
      id: 'test',
      keys: ['test'],
      content: 'test',
      comment: 'test',
      constant: false,
      selective: false,
      caseSensitive: false,
      useRegex: false,
      insertionOrder: 0,
      enabled: true,
    };
    
    expect(cardData).toBeDefined();
    expect(charxData).toBeDefined();
    expect(regexScript).toBeDefined();
    expect(lorebookEntry).toBeDefined();
  });
});
