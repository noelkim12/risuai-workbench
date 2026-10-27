import { describe, expect, it } from 'vitest';

import {
  applyAssetPlaceholders,
  calculateEffectiveDefinition,
  convertCharacterToModuleDefinition,
  findCharacterIndexByChaId,
  mergeCharacterDefinition,
  replaceModuleById,
} from '../src/hmr/merge';

describe('mergeCharacterDefinition', () => {
  it('updates same-named lore in place and preserves user entries', () => {
    const user = { comment: 'User', content: 'saved profile' };
    const copy = { comment: 'Base copy', content: 'user copy' };
    const existing = { globalLore: [user, { comment: 'Base', content: 'old' }, copy] };
    const updated = { comment: 'Base', content: 'new', key: 'changed' };
    const added = { comment: 'New', content: 'added' };
    const definition = { globalLore: [updated, added] };

    const merged = mergeCharacterDefinition(existing, definition);

    expect(merged['globalLore']).toEqual([user, updated, copy, added]);
    expect(existing.globalLore[1]).toEqual({ comment: 'Base', content: 'old' });
    expect(definition.globalLore).toEqual([updated, added]);
    expect(mergeCharacterDefinition(merged, definition)['globalLore']).toEqual(merged['globalLore']);
  });

  it('keeps installed lore when incoming lore is empty or omitted', () => {
    const existing = { globalLore: [{ comment: 'User', content: 'keep' }] };

    expect(mergeCharacterDefinition(existing, { globalLore: [] })['globalLore']).toEqual(existing.globalLore);
    expect(mergeCharacterDefinition(existing, { name: 'Updated' })['globalLore']).toEqual(existing.globalLore);
  });

  it('uses incoming lore when the installed value is not an array', () => {
    const globalLore = [{ comment: 'Base', content: 'new' }];

    expect(mergeCharacterDefinition({}, { globalLore })['globalLore']).toEqual(globalLore);
    expect(mergeCharacterDefinition({ globalLore: null }, { globalLore })['globalLore']).toEqual(globalLore);
  });

  it('clears custom lore settings when the incoming definition requests global mode', () => {
    const existing = { loreSettings: { scanDepth: 5, tokenBudget: 800 }, chats: [{ message: [] }] };

    const merged = mergeCharacterDefinition(existing, JSON.parse('{"loreSettings":null}'));

    expect(merged).not.toHaveProperty('loreSettings');
    expect(merged['chats']).toEqual(existing.chats);
  });

  it('overwrites definition keys and preserves user state', () => {
    const existing = {
      name: 'Old',
      desc: 'old-desc',
      chats: [{ message: ['hi'] }],
      chatPage: 3,
      chaId: 'stable-id',
      viewScreen: 'emotion',
    };

    const merged = mergeCharacterDefinition(existing, {
      name: 'New',
      desc: 'new-desc',
      chats: [],
      chatPage: 0,
      chaId: 'evil-overwrite',
    });

    expect(merged).toMatchObject({
      name: 'New',
      desc: 'new-desc',
      chats: [{ message: ['hi'] }],
      chatPage: 3,
      chaId: 'stable-id',
      viewScreen: 'emotion',
    });
  });
});

describe('applyAssetPlaceholders', () => {
  it('replaces placeholders deeply in strings, arrays, objects', () => {
    const resolve = (hash: string): string => `assets/${hash}.png`;
    const input = {
      image: 'hmr-asset://aaa',
      emotionImages: [['joy', 'hmr-asset://bbb']],
      nested: { keep: 'plain-string' },
    };

    expect(applyAssetPlaceholders(input, resolve)).toEqual({
      image: 'assets/aaa.png',
      emotionImages: [['joy', 'assets/bbb.png']],
      nested: { keep: 'plain-string' },
    });
  });

  it('throws on unresolved hash', () => {
    expect(() =>
      applyAssetPlaceholders({ image: 'hmr-asset://missing' }, () => {
        throw new Error('unresolved asset: missing');
      }),
    ).toThrow(/missing/);
  });
});

describe('findCharacterIndexByChaId', () => {
  it('finds by chaId, skipping group chats', () => {
    const characters = [
      { chaId: 'g1', type: 'group' },
      { chaId: 'c1', type: 'character' },
      null,
    ];

    expect(findCharacterIndexByChaId(characters, 'c1')).toBe(1);
    expect(findCharacterIndexByChaId(characters, 'g1')).toBe(-1);
    expect(findCharacterIndexByChaId(characters, 'zzz')).toBe(-1);
  });
});

describe('replaceModuleById', () => {
  it('merges module lore by name while replacing other definition fields', () => {
    const user = { comment: 'User', content: 'keep' };
    const copy = { comment: 'Base copy', content: 'copy' };
    const modules = [{ id: 'm1', obsolete: true, lorebook: [user, { comment: 'Base', content: 'old' }, copy] }];
    const updated = { comment: 'Base', content: 'new' };
    const added = { comment: 'New', content: 'added' };

    expect(replaceModuleById(modules, 'm1', { name: 'Updated', lorebook: [updated, added] })).toEqual([
      { id: 'm1', name: 'Updated', lorebook: [user, updated, copy, added] },
    ]);
    expect(replaceModuleById(modules, 'm1', { lorebook: [] })).toEqual([
      { id: 'm1', lorebook: modules[0]?.lorebook },
    ]);
  });

  it('replaces the matching module, forcing id, preserving order', () => {
    const modules = [
      { id: 'm1', name: 'A' },
      { id: 'm2', name: 'B' },
    ];

    const result = replaceModuleById(modules, 'm2', { id: 'ignored', name: 'B2', lorebook: [] });

    expect(result).toEqual([
      { id: 'm1', name: 'A' },
      { id: 'm2', name: 'B2', lorebook: [] },
    ]);
    expect(replaceModuleById(modules, 'nope', { name: 'X' })).toBeNull();
  });
});

describe('calculateEffectiveDefinition', () => {
  it.each([
    ['character', 'globalLore'], ['character', 'customscript'], ['character', 'triggerscript'],
    ['module', 'lorebook'], ['module', 'regex'], ['module', 'trigger'],
  ] as const)('merges %s %s by exact comment and replaces each complete entry', (kind, key) => {
    const local = { comment: 'Local', content: 'keep' };
    const existing = { [key]: [local, { comment: 'A', content: 'old', obsolete: true }] };
    const incoming = { [key]: [{ comment: 'A', content: 'new' }, { comment: 'a', content: 'case' }, { comment: ' A ', content: 'space' }] };
    const before = structuredClone({ existing, incoming });

    const result = calculateEffectiveDefinition({ kind, existing, incoming });

    expect(result.status).toBe('ready');
    expect(result.after[key]).toEqual([local, ...(incoming[key] ?? [])]);
    expect(result.preserved).toEqual([{ key, labels: ['Local'] }]);
    expect({ existing, incoming }).toEqual(before);
  });

  it('pairs unnamed entries in order instead of blocking', () => {
    const existing = { triggerscript: [{ comment: '', code: 'old' }, { comment: 'A' }, { comment: '', code: 'extra' }] };
    const incoming = { triggerscript: [{ comment: '', code: 'new' }] };

    const result = calculateEffectiveDefinition({ kind: 'character', existing, incoming });

    expect(result.status).toBe('ready');
    expect(result.after['triggerscript']).toEqual([{ comment: '', code: 'new' }, { comment: 'A' }, { comment: '', code: 'extra' }]);
    expect(result.preserved).toEqual([{ key: 'triggerscript', labels: ['A', '(이름 없음)'] }]);
  });

  it.each(['existing', 'incoming'] as const)('blocks duplicate names in %s', (side) => {
    const single = { regex: [{ comment: 'A' }] };
    const duplicate = { regex: [{ comment: 'A' }, { comment: 'A' }] };

    const result = calculateEffectiveDefinition({ kind: 'module', existing: side === 'existing' ? duplicate : single, incoming: side === 'incoming' ? duplicate : single });

    expect(result.status).toBe('conflict');
    expect(result.conflicts).toEqual([expect.objectContaining({ side, reason: 'duplicate-name', name: 'A' })]);
  });

  it('allows explicit replacement to clear lists and bypass malformed installed names', () => {
    const existing = { id: 'kept', regex: [{ comment: '' }], trigger: [{ comment: 'A' }] };

    const result = calculateEffectiveDefinition({ kind: 'module', mode: 'replace', existing, incoming: { id: 'ignored', regex: [], trigger: [{ comment: '' }] } });

    expect(result.status).toBe('ready');
    expect(result.after).toEqual({ id: 'kept', regex: [], trigger: [{ comment: '' }] });
    expect(result.conflicts).toEqual([]);
  });

  it('replaces legacy script fields as whole values and does not name-merge assets', () => {
    const result = calculateEffectiveDefinition({ kind: 'character', existing: { customscript: 'legacy', additionalAssets: [['local', 'path']] }, incoming: { customscript: [{ comment: 'New' }], additionalAssets: [] } });

    expect(result.after).toEqual({ customscript: [{ comment: 'New' }], additionalAssets: [] });
    expect(result.legacyFields).toEqual(['customscript']);
  });

  it('throws for conflicts through the legacy writer wrapper', () => {
    expect(() => mergeCharacterDefinition({ globalLore: [{ comment: 'A' }, { comment: 'A' }] }, { globalLore: [] })).toThrow();
  });
});

describe('convertCharacterToModuleDefinition', () => {
  it('maps a charx character definition to the current RisuAI module shape', () => {
    const converted = convertCharacterToModuleDefinition({
      name: 'Aria',
      creatorNotes: 'Creator note',
      globalLore: [{ content: 'Base lore' }],
      customscript: [{ comment: 'Regex' }],
      triggerscript: [{ comment: 'Trigger' }],
      lowLevelAccess: true,
      hideChatIcon: true,
      backgroundHTML: '<div />',
      additionalAssets: [['asset', 'assets/a.png', 'image']],
      moduleNamespace: 'aria',
      customModuleToggle: 'toggle',
      image: 'assets/icon.png',
      desc: 'Character description',
      firstMessage: 'Hello',
      alternateGreetings: ['Welcome'],
      replaceGlobalNote: 'Global note',
    });

    expect(converted).toMatchObject({
      name: 'Aria',
      description: 'Creator note',
      regex: [{ comment: 'Regex' }],
      trigger: [{ comment: 'Trigger' }],
      lowLevelAccess: true,
      hideIcon: true,
      backgroundEmbedding: '<div />',
      assets: [['asset', 'assets/a.png', 'image']],
      namespace: 'aria',
      customModuleToggle: 'toggle',
      icon: 'assets/icon.png',
    });
    expect(converted['id']).toBeUndefined();
    expect(converted['lorebook']).toEqual([
      { content: 'Base lore' },
      expect.objectContaining({ content: expect.stringContaining('@@indicator character_desc') }),
      expect.objectContaining({
        content:
          '@@indicator character_first_message\n\n<FM>\nHello\n</FM>\n<FM_alt>\nWelcome\n</FM_alt>',
      }),
      expect.objectContaining({ content: expect.stringContaining('@@indicator replace_global_note') }),
    ]);
  });
});
