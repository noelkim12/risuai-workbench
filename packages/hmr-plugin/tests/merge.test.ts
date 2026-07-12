import { describe, expect, it } from 'vitest';

import {
  applyAssetPlaceholders,
  findCharacterIndexByChaId,
  mergeCharacterDefinition,
  replaceModuleById,
} from '../src/hmr/merge';

describe('mergeCharacterDefinition', () => {
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
