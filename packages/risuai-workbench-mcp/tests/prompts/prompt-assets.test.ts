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
    expect(text).toContain('call `workbench.route_intent`');
    expect(text).toContain('advisory workflow guidance, not authorization');
    expect(text).toContain('allowedTools');
    expect(text).toContain('blockedTools');
    expect(text).toContain('commitAllowed');
    expect(text).toContain('Never bypass confirmation');
    expect(text).toContain('must still require preview, confirmation, safety policy, and post-validation');
  });

  it('includes route-first guidance in workbench.review_artifact_change', () => {
    const text = renderPromptAsset('workbench.review_artifact_change', {
      context: 'review proposed change',
      target: 'characters/merry/lorebooks/intro.risulorebook',
    });

    expect(text).toContain('call `workbench.route_intent`');
    expect(text).toContain('advisory workflow guidance, not authorization');
    expect(text).toContain('allowedTools');
    expect(text).toContain('blockedTools');
    expect(text).toContain('commitAllowed');
    expect(text).toContain('Existing mutation safety gates, confirmation, hash, and workspace checks remain mandatory');
  });

  it('includes route-first guidance in workbench.creative.apply_selected_idea', () => {
    const text = renderPromptAsset('workbench.creative.apply_selected_idea', {
      context: 'apply selected idea',
      target: 'modules/mymod/lua/script.risulua',
    });

    expect(text).toContain('call `workbench.route_intent`');
    expect(text).toContain('advisory workflow guidance, not authorization');
    expect(text).toContain('allowedTools');
    expect(text).toContain('blockedTools');
    expect(text).toContain('commitAllowed');
    expect(text).toContain('Existing mutation safety gates, confirmation, hash, and workspace checks remain mandatory');
  });

  it('requires exactly three MVP prompts to include route-first guidance', () => {
    const manifest = loadPromptAssetManifest();
    const routeFirstPrompts = manifest.filter((entry) => {
      const text = renderPromptAsset(entry.name, {});
      return (
        text.includes('call `workbench.route_intent`') &&
        text.includes('advisory workflow guidance, not authorization') &&
        text.includes('allowedTools') &&
        text.includes('blockedTools') &&
        text.includes('commitAllowed')
      );
    });

    expect(routeFirstPrompts).toHaveLength(3);
    expect(routeFirstPrompts.map((p) => p.name)).toEqual([
      'workbench.review_artifact_change',
      'workbench.apply_artifact_change',
      'workbench.creative.apply_selected_idea',
    ]);
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
