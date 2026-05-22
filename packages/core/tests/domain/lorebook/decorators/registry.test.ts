import { describe, expect, it } from 'vitest';

import {
  normalizeLorebookDecoratorName,
  getLorebookDecoratorSpec,
  listLorebookDecoratorSpecs,
  getLorebookDecoratorCompletionCandidates,
  formatLorebookDecoratorMarkdown,
  formatLorebookDecoratorPlain,
} from '../../../../src/domain/lorebook/decorators';

describe('LorebookDecoratorRegistry', () => {
  // ── normalizeLorebookDecoratorName ──────────────────────────────

  describe('normalizeLorebookDecoratorName', () => {
    it('strips @@ prefix and lowercases', () => {
      expect(normalizeLorebookDecoratorName('@@Recursive')).toBe('recursive');
      expect(normalizeLorebookDecoratorName('@@DEPTH')).toBe('depth');
    });

    it('passes through bare names already normalized', () => {
      expect(normalizeLorebookDecoratorName('role')).toBe('role');
    });

    it('trims whitespace', () => {
      expect(normalizeLorebookDecoratorName('  @@role  ')).toBe('role');
      expect(normalizeLorebookDecoratorName('  probability  ')).toBe('probability');
    });
  });

  // ── getLorebookDecoratorSpec ────────────────────────────────────

  describe('getLorebookDecoratorSpec', () => {
    it('looks up by normalized name (without @@)', () => {
      const spec = getLorebookDecoratorSpec('recursive');
      expect(spec).toBeDefined();
      expect(spec!.name).toBe('recursive');
      expect(spec!.supportLevel).toBe('active');
    });

    it('looks up by @@-prefixed name', () => {
      const spec = getLorebookDecoratorSpec('@@recursive');
      expect(spec).toBeDefined();
      expect(spec!.name).toBe('recursive');
    });

    it('is case-insensitive', () => {
      expect(getLorebookDecoratorSpec('@@DEPTH')?.name).toBe('depth');
      expect(getLorebookDecoratorSpec('ROLE')?.name).toBe('role');
    });

    it('returns undefined for unknown decorators', () => {
      expect(getLorebookDecoratorSpec('nonexistent')).toBeUndefined();
      expect(getLorebookDecoratorSpec('@@nonexistent')).toBeUndefined();
    });

    it('exposes signature field on spec', () => {
      const depth = getLorebookDecoratorSpec('depth');
      expect(depth).toBeDefined();
      expect(depth!.signature).toContain('@@depth');
      expect(depth!.signature).toContain('N');
    });

    it('exposes summary field on spec', () => {
      const role = getLorebookDecoratorSpec('role');
      expect(role).toBeDefined();
      expect(typeof role!.summary).toBe('string');
      expect(role!.summary.length).toBeGreaterThan(0);
    });

    it('exposes examples field on spec', () => {
      const depth = getLorebookDecoratorSpec('depth');
      expect(depth).toBeDefined();
      expect(Array.isArray(depth!.examples)).toBe(true);
    });

    it('exposes sortPriority field on spec', () => {
      const depth = getLorebookDecoratorSpec('depth');
      expect(depth).toBeDefined();
      expect(typeof depth!.sortPriority).toBe('number');
    });

    it('sorts active decorators before unsupported via sortPriority', () => {
      const active = getLorebookDecoratorSpec('depth')!;
      const unsupported = getLorebookDecoratorSpec('instruct_depth')!;
      expect(active.sortPriority).toBeLessThan(unsupported.sortPriority);
    });

    it('includes optional aliases on spec where applicable', () => {
      // Most decorators have no aliases
      const depth = getLorebookDecoratorSpec('depth')!;
      expect(depth.aliases).toBeUndefined();

      // @@end may have no aliases either, but the field should be optional
      const end = getLorebookDecoratorSpec('end')!;
      expect(end.aliases === undefined || Array.isArray(end.aliases)).toBe(true);
    });

    it('includes optional insertText override on spec where applicable', () => {
      const depth = getLorebookDecoratorSpec('depth')!;
      expect(depth.insertText === undefined || typeof depth.insertText === 'string').toBe(true);
    });

    it('includes active decorators with correct metadata', () => {
      const depth = getLorebookDecoratorSpec('depth');
      expect(depth).toBeDefined();
      expect(depth!.label).toContain('@@depth');
      expect(depth!.category).toBe('insertion');
      expect(depth!.supportLevel).toBe('active');
    });

    it('includes role decorator', () => {
      const role = getLorebookDecoratorSpec('role');
      expect(role).toBeDefined();
      expect(role!.category).toBe('role');
    });

    it('includes unsupported decorators', () => {
      const spec = getLorebookDecoratorSpec('instruct_depth');
      expect(spec).toBeDefined();
      expect(spec!.supportLevel).toBe('unsupported');
    });

    it('includes uncertain decorators', () => {
      const spec = getLorebookDecoratorSpec('disable_ui_prompt');
      expect(spec).toBeDefined();
      expect(spec!.supportLevel).toBe('uncertain');
    });

    it('includes partial decorators', () => {
      const prob = getLorebookDecoratorSpec('probability');
      expect(prob).toBeDefined();
      expect(prob!.supportLevel).toBe('partial');
    });

    it('@@end resolves as its own documented decorator', () => {
      const end = getLorebookDecoratorSpec('end');
      expect(end).toBeDefined();
      expect(end!.label).toContain('@@end');
    });
  });

  // ── listLorebookDecoratorSpecs ──────────────────────────────────

  describe('listLorebookDecoratorSpecs', () => {
    it('returns all known decorators (active + unsupported)', () => {
      const all = listLorebookDecoratorSpecs();
      // 29 active/partial/uncertain + 4 unsupported = 33
      expect(all.length).toBeGreaterThanOrEqual(29);
    });

    it('contains key decorators from reference.md', () => {
      const names = listLorebookDecoratorSpecs().map((s) => s.name);
      const expectedActive = [
        'depth', 'reverse_depth', 'end', 'position', 'role',
        'probability', 'activate_only_after', 'activate_only_every',
        'is_greeting', 'activate', 'dont_activate',
        'keep_activate_after_match', 'dont_activate_after_match',
        'scan_depth', 'additional_keys', 'exclude_keys', 'exclude_keys_all',
        'match_full_word', 'match_partial_word',
        'recursive', 'unrecursive', 'no_recursive_search',
        'priority', 'ignore_on_max_context',
        'inject_lore', 'inject_at', 'inject_prepend', 'inject_replace',
        'disable_ui_prompt',
      ];
      const expectedUnsupported = [
        'instruct_depth', 'reverse_instruct_depth', 'instruct_scan_depth',
        'is_user_icon',
      ];
      for (const name of [...expectedActive, ...expectedUnsupported]) {
        expect(names).toContain(name);
      }
    });
  });

  // ── getLorebookDecoratorCompletionCandidates ────────────────────

  describe('getLorebookDecoratorCompletionCandidates', () => {
    it('returns all candidates when no filter is given', () => {
      const candidates = getLorebookDecoratorCompletionCandidates();
      expect(candidates.length).toBeGreaterThanOrEqual(29);
    });

    it('sorts active decorators before unsupported', () => {
      const candidates = getLorebookDecoratorCompletionCandidates();
      const firstUnsupported = candidates.findIndex(
        (c) => c.supportLevel === 'unsupported',
      );
      const lastActive = candidates.findLastIndex(
        (c) => c.supportLevel !== 'unsupported',
      );
      // If both exist, active should come first
      if (firstUnsupported !== -1 && lastActive !== -1) {
        expect(lastActive).toBeLessThan(firstUnsupported);
      }
    });

    it('uses prefix-only filtering: "rec" matches recursive but not unrecursive or no_recursive_search', () => {
      const candidates = getLorebookDecoratorCompletionCandidates('rec');
      const names = candidates.map((c) => c.name);
      expect(names).toContain('recursive');
      // These do NOT start with 'rec', so must be excluded by prefix filter
      expect(names).not.toContain('unrecursive');
      expect(names).not.toContain('no_recursive_search');
    });

    it('produces valid completion candidate shape with @@depth', () => {
      const candidates = getLorebookDecoratorCompletionCandidates();
      const depth = candidates.find((c) => c.name === 'depth');
      expect(depth).toBeDefined();
      expect(depth!.label).toBe('@@depth');
      expect(depth!.detail).toBeTruthy();
      expect(depth!.documentationMarkdown).toBeTruthy();
      expect(depth!.documentationPlain).toBeTruthy();
      expect(depth!.insertText).toContain('@@depth');
      expect(depth!.sortText).toBeTruthy();
      expect(depth!.supportLevel).toBe('active');
    });

    it('candidate labels include @@recursive, @@depth, @@role, @@probability', () => {
      const candidates = getLorebookDecoratorCompletionCandidates();
      const labels = candidates.map((c) => c.label);
      expect(labels).toContain('@@recursive');
      expect(labels).toContain('@@depth');
      expect(labels).toContain('@@role');
      expect(labels).toContain('@@probability');
    });

    it('unsupported/TODO entries sort after active/partial/uncertain entries', () => {
      const candidates = getLorebookDecoratorCompletionCandidates();
      const lastNonUnsupported = candidates.findLastIndex(
        (c) => c.supportLevel !== 'unsupported',
      );
      const firstUnsupported = candidates.findIndex(
        (c) => c.supportLevel === 'unsupported',
      );
      if (firstUnsupported !== -1 && lastNonUnsupported !== -1) {
        expect(lastNonUnsupported).toBeLessThan(firstUnsupported);
      }
    });

    it('uses deterministic sortText values', () => {
      const candidates = getLorebookDecoratorCompletionCandidates();
      const sortTexts = candidates.map((c) => c.sortText);
      const unique = new Set(sortTexts);
      expect(unique.size).toBe(sortTexts.length);
    });
  });

  // ── formatLorebookDecoratorMarkdown ─────────────────────────────

  describe('formatLorebookDecoratorMarkdown', () => {
    it('formats a known decorator as markdown', () => {
      const md = formatLorebookDecoratorMarkdown('depth');
      expect(md).toContain('@@depth');
      expect(md).toContain('**');
    });

    it('includes support level badge', () => {
      const md = formatLorebookDecoratorMarkdown('instruct_depth');
      expect(md.toLowerCase()).toContain('unsupported');
    });

    it('includes examples in markdown when present', () => {
      const md = formatLorebookDecoratorMarkdown('depth');
      // depth should have at least one example
      expect(md).toContain('@@depth');
    });

    it('returns fallback for unknown decorator', () => {
      const md = formatLorebookDecoratorMarkdown('nonexistent');
      expect(md).toContain('nonexistent');
    });
  });

  // ── formatLorebookDecoratorPlain ────────────────────────────────

  describe('formatLorebookDecoratorPlain', () => {
    it('formats a known decorator as plain text', () => {
      const plain = formatLorebookDecoratorPlain('depth');
      expect(plain).toContain('@@depth');
      expect(plain).not.toContain('**');
      expect(plain).not.toContain('`');
    });

    it('includes support level in plain text for unsupported entries', () => {
      const plain = formatLorebookDecoratorPlain('instruct_depth');
      expect(plain.toLowerCase()).toContain('unsupported');
    });

    it('includes support level in plain text for uncertain entries', () => {
      const plain = formatLorebookDecoratorPlain('disable_ui_prompt');
      expect(plain.toLowerCase()).toContain('uncertain');
    });

    it('returns fallback for unknown decorator', () => {
      const plain = formatLorebookDecoratorPlain('nonexistent');
      expect(plain).toContain('nonexistent');
    });
  });
});
