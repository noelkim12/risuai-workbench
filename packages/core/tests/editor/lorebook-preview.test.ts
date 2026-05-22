import { describe, expect, it } from 'vitest';
import { createLorebookContentPreview } from '../../src/domain/editor';

describe('lorebook CONTENT quick preview', () => {
  it('runs CBS dry-run output for CONTENT text', () => {
    const preview = createLorebookContentPreview('Hello {{user}}', {
      userLabel: 'Tester',
    });

    expect(preview.status).toBe('ok');
    expect(preview.output).toContain('Tester');
    expect(preview.coverageSummary).toMatch(/macros/i);
  });

  it('surfaces parser diagnostics without mutating source', () => {
    const preview = createLorebookContentPreview('{{#if 1}}open', {});

    expect(preview.status === 'partial' || preview.status === 'error').toBe(true);
    expect(preview.output).toContain('open');
    expect(preview.diagnostics.length).toBeGreaterThan(0);
  });
});
