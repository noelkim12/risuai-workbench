/**
 * Prompt asset loader tests.
 * @file packages/risuai-workbench-mcp/tests/prompts/prompt-assets.test.ts
 */

import { describe, expect, it } from 'vitest';

import { WORKBENCH_REGISTRY } from '../../src/registry';
import { loadPromptAssetManifest, renderPromptAsset } from '../../src/prompts/prompt-assets';

describe('prompt asset loader', () => {
  it('covers every registry prompt exactly once', () => {
    const manifestNames = loadPromptAssetManifest().map((entry) => entry.name);
    const registryNames = WORKBENCH_REGISTRY.prompts.map((entry) => entry.name);

    expect(manifestNames).toEqual(registryNames);
    expect(new Set(manifestNames).size).toBe(manifestNames.length);
  });

  it('renders target and context placeholders without mutating safety text', () => {
    const text = renderPromptAsset('workbench.apply_artifact_change', {
      context: 'rename lorebook entry',
      target: 'characters/merry/lorebooks/intro.risulorebook',
    });

    expect(text).toContain('Target: characters/merry/lorebooks/intro.risulorebook');
    expect(text).toContain('Context: rename lorebook entry');
    expect(text).toContain('Workflow');
    expect(text).toContain('Safety contract');
    expect(text).toContain('Never bypass confirmation');
    expect(text).toContain('must still require preview, confirmation, safety policy, and post-validation');
  });

  it('renders missing optional args as not provided', () => {
    const text = renderPromptAsset('workbench.review_artifact_change', {});

    expect(text).toContain('Target: not provided');
    expect(text).toContain('Context: not provided');
  });

  it('uses only local markdown filenames in the manifest', () => {
    for (const entry of loadPromptAssetManifest()) {
      expect(entry.file).toMatch(/^[A-Za-z0-9_.-]+\.md$/);
      expect(entry.file).not.toContain('..');
      expect(entry.file.startsWith('/')).toBe(false);
    }
  });
});
