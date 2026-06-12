import { describe, expect, it } from 'vitest';
import accordionSource from '../../../src/lib/components/sidebar/WorkbenchAccordions.svelte?raw';
import readOnlyTreeSource from '../../../src/lib/components/sidebar/WorkbenchReadOnlyTree.svelte?raw';

describe('WorkbenchAccordions Lua tree source contract', () => {
  it('renders lua sections through the normal accordion tree branch instead of direct flat mode', () => {
    expect(accordionSource).not.toContain("class:accordion__section--direct={section.kind === 'lua'}");
    expect(accordionSource).toContain("section.kind === 'lua' && section.tree?.length");
    expect(accordionSource).toContain('aria-label="Lua tree"');
  });

  it('renders helper metadata without wiring lua drag and drop handlers', () => {
    expect(readOnlyTreeSource).toContain('tree-help');
    expect(readOnlyTreeSource).toContain('node.detailDescription');
    expect(readOnlyTreeSource).toContain('event.stopPropagation()');
    expect(readOnlyTreeSource).not.toContain('dragLua');
    expect(readOnlyTreeSource).not.toContain('dropLua');
  });
});
