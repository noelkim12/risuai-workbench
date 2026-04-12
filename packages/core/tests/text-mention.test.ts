import { describe, expect, it } from 'vitest';
import { analyzeTextMentions } from '@/domain/analyze/text-mention';

describe('analyzeTextMentions lorebook mentions', () => {
  it('detects unique lorebook mentions and keeps scoped target ids', () => {
    const entries = [
      { id: 'Alpha', name: 'Alpha', content: 'Beta appears before myVar in this entry.' },
      { id: 'Lore/Folder/Beta', name: 'Beta', content: 'Secondary entry' },
    ];

    const result = analyzeTextMentions(entries, new Set(['myVar']), new Set(), entries);

    expect(result).toEqual(expect.arrayContaining([
      { sourceEntry: 'Alpha', target: 'myVar', type: 'variable-mention' },
      { sourceEntry: 'Alpha', target: 'Lore/Folder/Beta', type: 'lorebook-mention' },
    ]));
  });

  it('skips ambiguous lorebook mentions when multiple entries share the same name', () => {
    const entries = [
      { id: 'Source', name: 'Source', content: 'Shared Entry is referenced here.' },
      { id: 'Folder A/Shared Entry', name: 'Shared Entry', content: 'A' },
      { id: 'Folder B/Shared Entry', name: 'Shared Entry', content: 'B' },
    ];

    const result = analyzeTextMentions(entries, new Set(), new Set(), entries);

    expect(result).toEqual([]);
  });
});
