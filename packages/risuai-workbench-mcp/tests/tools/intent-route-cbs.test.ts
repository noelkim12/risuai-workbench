/**
 * CBS domain awareness tests for the intent route classifier.
 * @file packages/risuai-workbench-mcp/tests/tools/intent-route-cbs.test.ts
 */

import { describe, expect, it } from 'vitest';

import { handleRouteIntent } from '../../src/tools/intent-route';
import { WORKBENCH_REGISTRY } from '../../src/registry';

const ALL_IMPLEMENTED_TOOL_NAMES = WORKBENCH_REGISTRY.tools
  .filter((t) => t.implementationStatus === 'implemented')
  .map((t) => t.name);

function isImplementedTool(name: string): boolean {
  return ALL_IMPLEMENTED_TOOL_NAMES.includes(name);
}

describe('handleRouteIntent CBS domain awareness', () => {
  describe('CBS keyword detection', () => {
    it('detects cbs domain from when/condition language', async () => {
      const result = await handleRouteIntent({
        request: 'Check the when condition in the CBS script',
      });

      const route = result.data!.route;
      expect(route.domainTags).toContain('cbs');
      expect(route.routingSignals).toContain('cbs_authoring');
    });

    it('detects cbs domain from Korean condition keyword', async () => {
      const result = await handleRouteIntent({
        request: '조건을 검증해주세요',
      });

      const route = result.data!.route;
      expect(route.domainTags).toContain('cbs');
      expect(route.routingSignals).toContain('cbs_authoring');
    });

    it('detects cbs domain from getvar/setvar/addvar/tempvar keywords', async () => {
      const result = await handleRouteIntent({
        request: 'Analyze getvar and setvar usage in the template',
      });

      const route = result.data!.route;
      expect(route.domainTags).toContain('cbs');
      expect(route.routingSignals).toContain('cbs_authoring');
    });

    it('detects cbs domain from pick/roll/random keywords', async () => {
      const result = await handleRouteIntent({
        request: 'Show me how pick and roll are used',
      });

      const route = result.data!.route;
      expect(route.domainTags).toContain('cbs');
      expect(route.routingSignals).toContain('cbs_authoring');
    });

    it('detects cbs domain from makearray/makedict keywords', async () => {
      const result = await handleRouteIntent({
        request: 'Validate makearray and makedict calls',
      });

      const route = result.data!.route;
      expect(route.domainTags).toContain('cbs');
      expect(route.routingSignals).toContain('cbs_authoring');
    });

    it('detects cbs domain from slot/pure_display keywords', async () => {
      const result = await handleRouteIntent({
        request: 'Inspect the slot and pure_display blocks',
      });

      const route = result.data!.route;
      expect(route.domainTags).toContain('cbs');
      expect(route.routingSignals).toContain('cbs_authoring');
    });

    it('detects cbs domain from #each/#func keywords', async () => {
      const result = await handleRouteIntent({
        request: 'Review #each and #func usage',
      });

      const route = result.data!.route;
      expect(route.domainTags).toContain('cbs');
      expect(route.routingSignals).toContain('cbs_authoring');
    });
  });

  describe('CBS path-based detection', () => {
    it('detects cbs domain from .risulorebook file suffix in target', async () => {
      const result = await handleRouteIntent({
        request: 'Inspect the file',
        target: 'characters/merry/lorebooks/intro.risulorebook',
      });

      const route = result.data!.route;
      expect(route.domainTags).toContain('cbs');
      expect(route.routingSignals).toContain('cbs_authoring');
    });

    it('detects cbs domain from .risuchar file suffix in target', async () => {
      const result = await handleRouteIntent({
        request: 'Validate the character',
        target: 'characters/merry/character.risuchar',
      });

      const route = result.data!.route;
      expect(route.domainTags).toContain('cbs');
      expect(route.routingSignals).toContain('cbs_authoring');
    });

    it('detects cbs domain from .risumodule file suffix in target', async () => {
      const result = await handleRouteIntent({
        request: 'Inspect the module',
        target: 'modules/demo/module.risumodule',
      });

      const route = result.data!.route;
      expect(route.domainTags).toContain('cbs');
      expect(route.routingSignals).toContain('cbs_authoring');
    });

    it('detects cbs domain from .risuprompt file suffix in target', async () => {
      const result = await handleRouteIntent({
        request: 'Review the prompt',
        target: 'modules/demo/prompts/main.risuprompt',
      });

      const route = result.data!.route;
      expect(route.domainTags).toContain('cbs');
      expect(route.routingSignals).toContain('cbs_authoring');
    });

    it('detects cbs domain from .risuregex file suffix in target', async () => {
      const result = await handleRouteIntent({
        request: 'Check the regex',
        target: 'modules/demo/regex/main.risuregex',
      });

      const route = result.data!.route;
      expect(route.domainTags).toContain('cbs');
      expect(route.routingSignals).toContain('cbs_authoring');
    });
  });

  describe('CBS content-based detection', () => {
    it('detects cbs domain from curly brace syntax {{...}} in request', async () => {
      const result = await handleRouteIntent({
        request: 'Validate the {{getvar::name}} syntax in the template',
      });

      const route = result.data!.route;
      expect(route.domainTags).toContain('cbs');
      expect(route.routingSignals).toContain('cbs_authoring');
    });

    it('detects cbs domain from curly brace syntax in context', async () => {
      const result = await handleRouteIntent({
        request: 'Inspect this',
        context: 'The template uses {{setvar::count::1}} and {{addvar::count::1}}',
      });

      const route = result.data!.route;
      expect(route.domainTags).toContain('cbs');
      expect(route.routingSignals).toContain('cbs_authoring');
    });

    it('does not detect cbs from plain text without curly braces', async () => {
      const result = await handleRouteIntent({
        request: 'Inspect the template syntax',
      });

      const route = result.data!.route;
      expect(route.domainTags).not.toContain('cbs');
    });
  });

  describe('CBS recommended tools', () => {
    it('recommends facade tools when cbs domain is detected via keywords', async () => {
      const result = await handleRouteIntent({
        request: 'Validate the CBS condition syntax',
      });

      const route = result.data!.route;
      expect(route.domainTags).toContain('cbs');
      expect(route.recommendedTools).toEqual(expect.arrayContaining([
        'workbench.catalog',
      ]));
      expect(route.recommendedTools).not.toContain('workbench.creative.brainstorm_scamper');
    });

    it('recommends facade tools when cbs domain is detected via file suffix', async () => {
      const result = await handleRouteIntent({
        request: 'Inspect the file',
        target: 'characters/merry/lorebooks/intro.risulorebook',
      });

      const route = result.data!.route;
      expect(route.domainTags).toContain('cbs');
      expect(route.capabilities).toContain('inspect');
      expect(route.recommendedActions).toEqual(expect.arrayContaining([
        'inspect.path',
        'inspect.artifact',
      ]));
      expect(route.recommendedTools).toEqual(expect.arrayContaining([
        'workbench.catalog',
        'workbench.prepare_action',
        'workbench.run_action',
      ]));
    });

    it('recommends facade tools when cbs domain is detected via curly brace syntax', async () => {
      const result = await handleRouteIntent({
        request: 'Check the {{getvar::name}} usage',
      });

      const route = result.data!.route;
      expect(route.domainTags).toContain('cbs');
      expect(route.recommendedTools).toEqual(expect.arrayContaining([
        'workbench.catalog',
      ]));
      expect(route.recommendedTools).not.toContain('workbench.creative.brainstorm_scamper');
    });
  });

  describe('CBS mutation mode', () => {
    it('routes CBS fix request to preview with stop conditions', async () => {
      const result = await handleRouteIntent({
        request: 'Fix the CBS condition in the lorebook',
        target: 'characters/merry/lorebooks/intro.risulorebook',
      });

      const route = result.data!.route;
      expect(route.domainTags).toContain('cbs');
      expect(route.mutationRequested).toBe(true);
      expect(route.commitAllowed).toBe(false);
      expect(route.stopConditions).toContain('preview_required');
      expect(route.stopConditions).toContain('confirmation_required');
    });

    it('keeps CBS inspect request read-only', async () => {
      const result = await handleRouteIntent({
        request: 'Inspect the CBS syntax but do not modify anything',
        target: 'characters/merry/lorebooks/intro.risulorebook',
      });

      const route = result.data!.route;
      expect(route.domainTags).toContain('cbs');
      expect(route.risk).toBe('read_only');
      expect(route.commitAllowed).toBe(false);
      expect(route.mutationMode).toBe('blocked');
      expect(route.stopConditions).toContain('mutation_tool_blocked');
    });
  });

  describe('CBS registry consistency', () => {
    it('only includes facade tools in recommendedTools for CBS routes', async () => {
      const result = await handleRouteIntent({
        request: 'Validate CBS syntax and query usage',
        target: 'characters/merry/lorebooks/intro.risulorebook',
      });

      const route = result.data!.route;
      const facadeTools = [
        'workbench.catalog',
        'workbench.prepare_action',
        'workbench.run_action',
        'workbench.context',
        'workbench.patch_preview',
        'workbench.patch_apply',
      ];
      for (const name of route.recommendedTools) {
        expect(facadeTools).toContain(name);
      }
    });

    it('keeps recommendedTools capped at seven entries for CBS routes', async () => {
      const result = await handleRouteIntent({
        request: 'Analyze risulua handler, prompt chain, CBS condition, lorebook frontmatter, and suggest a patch',
        target: 'modules/demo/lua/main.risulua',
      });

      expect(result.data!.route.recommendedTools.length).toBeLessThanOrEqual(7);
    });
  });
});
