import { describe, expect, it } from 'vitest';
import { generateSchemaMd, GENERATOR_VERSION } from '@/cli/analyze/shared/wiki/schema/schema';

describe('wiki/schema', () => {
  it('includes the required top-level sections', () => {
    const md = generateSchemaMd();
    expect(md).toContain('# Wiki Schema');
    expect(md).toContain('## When to read this file');
    expect(md).toContain('## Reading order');
    expect(md).toContain('## File layout contract');
    expect(md).toContain('## Artifact type discrimination');
    expect(md).toContain('## Page classes');
    expect(md).toContain('## Traversal rules (cycle-safe)');
    expect(md).toContain('## Hard rules');
    expect(md).toContain('## Frontmatter schemas');
    expect(md).toContain('## Recipes');
    expect(md).toContain('## Glossary');
  });

  it('embeds the generator version in the frontmatter', () => {
    const md = generateSchemaMd();
    expect(md).toContain(`generator: risu-workbench/analyze/wiki@${GENERATOR_VERSION}`);
  });

  it('does NOT contain a generated-at field (kept idempotent)', () => {
    const md = generateSchemaMd();
    expect(md).not.toContain('generated-at:');
  });

  it('lists all seven recipe files', () => {
    const md = generateSchemaMd();
    expect(md).toContain('_schema/recipes/edit-entity.md');
    expect(md).toContain('_schema/recipes/how-does-x-work.md');
    expect(md).toContain('_schema/recipes/add-new-entry.md');
    expect(md).toContain('_schema/recipes/explain-artifact.md');
    expect(md).toContain('_schema/recipes/review-unknown-artifact.md');
    expect(md).toContain('_schema/recipes/write-narrative.md');
    expect(md).toContain('_schema/recipes/manage-companions.md');
  });

  it('contains the definitive-form traversal rules (no "ONE" caps, no "HINTS")', () => {
    const md = generateSchemaMd();
    expect(md).toContain('exactly 1 chain file');
    expect(md).toContain('at most 2 neighbors');
    expect(md).toContain('only required read');
    expect(md).toContain('Link depth: 1 hop');
    expect(md).toContain('File read budget per turn: each file at most 1 time');
    expect(md).toContain('Entity Relations sections list one-hop neighbors');
  });

  it('is idempotent — two calls return identical output', () => {
    expect(generateSchemaMd()).toBe(generateSchemaMd());
  });
});
