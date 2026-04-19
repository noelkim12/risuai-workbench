import { describe, expect, it } from 'vitest';
import {
  serializeFrontmatter,
  buildTable,
  buildLink,
  escapeMarkdown,
} from '@/cli/analyze/shared/wiki/markdown';

describe('wiki/markdown', () => {
  describe('serializeFrontmatter', () => {
    it('produces yaml between triple-dash fences', () => {
      const out = serializeFrontmatter({ source: 'generated', 'page-class': 'entity' });
      expect(out).toBe('---\nsource: generated\npage-class: entity\n---\n');
    });

    it('serializes list values as flow arrays', () => {
      const out = serializeFrontmatter({ keywords: ['강유라', '유라'] });
      expect(out).toContain('keywords: [강유라, 유라]');
    });

    it('quotes strings containing colons or special chars', () => {
      const out = serializeFrontmatter({ label: 'Shop: DLC' });
      expect(out).toContain('label: "Shop: DLC"');
    });

    it('serializes numbers and booleans without quotes', () => {
      const out = serializeFrontmatter({ hops: 3, 'has-cycles': true });
      expect(out).toContain('hops: 3');
      expect(out).toContain('has-cycles: true');
    });

    it('omits undefined fields', () => {
      const out = serializeFrontmatter({ a: 1, b: undefined, c: 'x' });
      expect(out).toContain('a: 1');
      expect(out).not.toContain('b:');
      expect(out).toContain('c: x');
    });
  });

  describe('buildTable', () => {
    it('renders headers and rows with pipe separators', () => {
      const out = buildTable(['Name', 'Count'], [
        ['alpha', '1'],
        ['beta', '2'],
      ]);
      expect(out).toBe(
        '| Name | Count |\n|---|---|\n| alpha | 1 |\n| beta | 2 |',
      );
    });

    it('escapes pipe characters in cells', () => {
      const out = buildTable(['A'], [['a|b']]);
      expect(out).toContain('a\\|b');
    });
  });

  describe('buildLink', () => {
    it('builds a markdown link with label and url', () => {
      expect(buildLink('이하은', '이하은.md')).toBe('[이하은](이하은.md)');
    });

    it('escapes brackets in label', () => {
      expect(buildLink('[draft]', 'x.md')).toBe('[\\[draft\\]](x.md)');
    });
  });

  describe('escapeMarkdown', () => {
    it('escapes backticks and brackets', () => {
      expect(escapeMarkdown('a`b[c]')).toBe('a\\`b\\[c\\]');
    });
  });
});
