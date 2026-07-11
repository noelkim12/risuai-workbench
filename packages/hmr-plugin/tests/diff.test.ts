import { describe, expect, it } from 'vitest';

import {
  ASSET_MASK,
  buildDefinitionDiff,
  buildLineDiff,
  deepEqual,
  diffRecordArray,
  isRecordArrayPair,
  maskAssetPair,
  toDiffText,
} from '../src/hmr/diff';

describe('buildLineDiff', () => {
  it('classifies added, removed, and same lines', () => {
    const result = buildLineDiff('a\nb\nc', 'a\nx\nc');

    expect(result.truncated).toBe(false);
    expect(result.addedLines).toBe(1);
    expect(result.removedLines).toBe(1);
    const kinds = result.segments.map((segment) => segment.kind);
    expect(kinds).toContain('same');
    expect(kinds).toContain('added');
    expect(kinds).toContain('removed');
  });

  it('reports identical inputs as a single same segment with zero counts', () => {
    const result = buildLineDiff('hello\nworld', 'hello\nworld');

    expect(result.addedLines).toBe(0);
    expect(result.removedLines).toBe(0);
    expect(result.segments.every((segment) => segment.kind === 'same')).toBe(true);
  });

  it('truncates when either side exceeds the line limit', () => {
    const big = Array.from({ length: 401 }, (_, index) => `line ${index}`).join('\n');
    const result = buildLineDiff(big, 'short');

    expect(result.truncated).toBe(true);
    expect(result.segments).toEqual([]);
    expect(result.beforeLineCount).toBe(401);
    expect(result.afterLineCount).toBe(1);
    expect(result.addedLines).toBe(0);
    expect(result.removedLines).toBe(0);
  });

  it('truncates when either side exceeds the char limit', () => {
    const big = 'x'.repeat(50_001);
    const result = buildLineDiff('short', big);

    expect(result.truncated).toBe(true);
    expect(result.segments).toEqual([]);
    expect(result.addedLines).toBe(0);
    expect(result.removedLines).toBe(0);
    expect(result.beforeLineCount).toBe(1);
    expect(result.afterLineCount).toBe(1);
  });
});

describe('deepEqual', () => {
  it('ignores object key order', () => {
    expect(deepEqual({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toBe(true);
  });

  it('detects nested differences', () => {
    expect(deepEqual({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
    expect(deepEqual(null, undefined)).toBe(false);
  });
});

describe('maskAssetPair', () => {
  it('masks both sides where incoming holds an asset placeholder', () => {
    const pair = maskAssetPair(
      { image: 'hmr-asset://abc', name: 'Aria' },
      { image: 'assets/real-path.png', name: 'Aria' },
    );

    expect(pair.incoming).toEqual({ image: ASSET_MASK, name: 'Aria' });
    expect(pair.existing).toEqual({ image: ASSET_MASK, name: 'Aria' });
  });

  it('keeps non-string existing values unmasked', () => {
    const pair = maskAssetPair({ image: 'hmr-asset://abc' }, { image: 42 });

    expect(pair.incoming).toEqual({ image: ASSET_MASK });
    expect(pair.existing).toEqual({ image: 42 });
  });

  it('masks placeholders nested in arrays walked by index', () => {
    const pair = maskAssetPair(
      { emotions: [['smile', 'hmr-asset://e1']] },
      { emotions: [['smile', 'assets/e1.png']] },
    );

    expect(pair.incoming).toEqual({ emotions: [['smile', ASSET_MASK]] });
    expect(pair.existing).toEqual({ emotions: [['smile', ASSET_MASK]] });
  });

  it('masks incoming-only placeholders even without a counterpart', () => {
    const pair = maskAssetPair({ extra: ['hmr-asset://new'] }, {});

    expect(pair.incoming).toEqual({ extra: [ASSET_MASK] });
    expect(pair.existing).toEqual({});
  });
});

describe('toDiffText', () => {
  it('returns strings as-is and pretty-prints everything else', () => {
    expect(toDiffText('hello')).toBe('hello');
    expect(toDiffText({ a: 1 })).toBe('{\n  "a": 1\n}');
    expect(toDiffText(3)).toBe('3');
    expect(toDiffText(undefined)).toBe('');
  });
});

describe('diffRecordArray', () => {
  const lore = (key: string, comment: string, content: string) => ({ key, comment, content, mode: 'normal' });

  it('matches entries by key and reports added, modified, and removed', () => {
    const existing = [lore('k1', '주인공 과거', 'old text'), lore('k2', '임시 메모', 'temp')];
    const incoming = [lore('k1', '주인공 과거', 'new text'), lore('k3', '마법 체계', 'magic')];

    const { entries, summary } = diffRecordArray(existing, incoming);

    expect(summary).toEqual({ added: 1, modified: 1, removed: 1 });
    const modified = entries.find((entry) => entry.kind === 'modified');
    expect(modified?.label).toBe('주인공 과거');
    expect(modified?.fields.map((field) => field.key)).toEqual(['content']);
    expect(entries.find((entry) => entry.kind === 'added')?.label).toBe('마법 체계');
    expect(entries.find((entry) => entry.kind === 'removed')?.label).toBe('임시 메모');
  });

  it('skips identical entries entirely', () => {
    const same = [lore('k1', 'a', 'x')];

    const { entries, summary } = diffRecordArray(same, [lore('k1', 'a', 'x')]);

    expect(entries).toEqual([]);
    expect(summary).toEqual({ added: 0, modified: 0, removed: 0 });
  });

  it('falls back to index matching when no candidate key is unique on both sides', () => {
    const existing = [{ v: 1 }, { v: 2 }];
    const incoming = [{ v: 1 }, { v: 99 }, { v: 3 }];

    const { entries, summary } = diffRecordArray(existing, incoming);

    expect(summary).toEqual({ added: 1, modified: 1, removed: 0 });
    expect(entries.find((entry) => entry.kind === 'modified')?.label).toBe('#2');
    expect(entries.find((entry) => entry.kind === 'added')?.label).toBe('#3');
  });

  it('ignores a candidate key with duplicate values', () => {
    const existing = [{ id: 'dup', v: 1 }, { id: 'dup', v: 2 }];
    const incoming = [{ id: 'dup', v: 1 }, { id: 'dup', v: 2 }];

    const { summary } = diffRecordArray(existing, incoming);

    expect(summary).toEqual({ added: 0, modified: 0, removed: 0 });
  });

  it('masks asset placeholders inside matched entries', () => {
    const existing = [{ id: 'e1', icon: 'assets/x.png' }];
    const incoming = [{ id: 'e1', icon: 'hmr-asset://h1' }];

    const { summary } = diffRecordArray(existing, incoming);

    expect(summary).toEqual({ added: 0, modified: 0, removed: 0 });
  });
});

describe('isRecordArrayPair', () => {
  it('accepts record arrays, allowing one empty side', () => {
    expect(isRecordArrayPair([{ a: 1 }], [])).toBe(true);
    expect(isRecordArrayPair([], [{ a: 1 }])).toBe(true);
  });

  it('rejects scalar arrays, mixed arrays, and both-empty pairs', () => {
    expect(isRecordArrayPair(['a'], ['b'])).toBe(false);
    expect(isRecordArrayPair([], [])).toBe(false);
    expect(isRecordArrayPair([{ a: 1 }], ['x'])).toBe(false);
  });
});

describe('buildDefinitionDiff', () => {
  it('classifies added, modified, removed, and unchanged fields', () => {
    const diff = buildDefinitionDiff({
      kind: 'character',
      incoming: { name: 'Aria', desc: 'new desc', newField: 'x' },
      existing: { name: 'Aria', desc: 'old desc', legacy: 'y' },
      assets: [],
    });

    expect(diff.status).toBe('different');
    expect(diff.unchangedKeys).toEqual(['name']);
    const byKey = new Map(diff.fields.map((field) => [field.key, field]));
    expect(byKey.get('desc')?.kind).toBe('modified');
    expect(byKey.get('desc')?.lines?.segments.length).toBeGreaterThan(0);
    expect(byKey.get('newField')?.kind).toBe('added');
    expect(byKey.get('legacy')?.kind).toBe('removed');
    expect(byKey.get('legacy')?.preservedByMerge).toBe(true);
  });

  it('excludes merge-preserved keys from character diffs', () => {
    const diff = buildDefinitionDiff({
      kind: 'character',
      incoming: { name: 'Aria', chats: [], chaId: 'from-workbench', chatPage: 0 },
      existing: { name: 'Aria', chats: [{ m: 1 }], chaId: 'real', chatPage: 3 },
      assets: [],
    });

    expect(diff.status).toBe('identical');
    expect(diff.fields).toEqual([]);
  });

  it('excludes id for modules and marks removed fields as truly removed', () => {
    const diff = buildDefinitionDiff({
      kind: 'module',
      incoming: { id: 'ignored', name: 'Mod' },
      existing: { id: 'real', name: 'Mod', extra: 'gone' },
      assets: [],
    });

    const removed = diff.fields.find((field) => field.key === 'extra');
    expect(removed?.kind).toBe('removed');
    expect(removed?.preservedByMerge).toBe(false);
  });

  it('produces entry diffs for record-array fields', () => {
    const diff = buildDefinitionDiff({
      kind: 'character',
      incoming: { lorebook: [{ key: 'k1', comment: 'a', content: 'new' }] },
      existing: { lorebook: [{ key: 'k1', comment: 'a', content: 'old' }] },
      assets: [],
    });

    const lorebook = diff.fields.find((field) => field.key === 'lorebook');
    expect(lorebook?.entrySummary).toEqual({ added: 0, modified: 1, removed: 0 });
    expect(lorebook?.entries?.[0]?.kind).toBe('modified');
    expect(lorebook?.lines).toBeUndefined();
  });

  it('treats asset placeholder differences as unchanged and summarizes assets', () => {
    const diff = buildDefinitionDiff({
      kind: 'character',
      incoming: { image: 'hmr-asset://h1' },
      existing: { image: 'assets/real.png' },
      assets: [
        { hash: 'h1', ext: 'png', role: 'icon', size: 1_000 },
        { hash: 'h2', ext: 'png', role: 'emotion', size: 2_500 },
      ],
    });

    expect(diff.status).toBe('identical');
    expect(diff.assetSummary).toEqual({ count: 2, totalBytes: 3_500 });
  });

  it('keeps incoming key order first, then existing-only keys', () => {
    const diff = buildDefinitionDiff({
      kind: 'module',
      incoming: { b: 1, a: 2 },
      existing: { zOnly: true, b: 9, a: 2 },
      assets: [],
    });

    expect(diff.fields.map((field) => field.key)).toEqual(['b', 'zOnly']);
  });
});
