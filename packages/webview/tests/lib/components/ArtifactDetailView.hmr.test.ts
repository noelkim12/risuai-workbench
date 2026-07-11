import { describe, expect, it } from 'vitest';
import { compile, parse } from 'svelte/compiler';
import DetailViewSource from '../../../src/lib/components/ArtifactDetailView.svelte?raw';

const detailAst = parse(DetailViewSource, { filename: 'ArtifactDetailView.svelte' });

/** Slice original source for a positioned AST node. */
function srcOf(node: { start: number; end: number }): string {
  return DetailViewSource.slice(node.start, node.end);
}

/** Recursively traverse an AST, calling enter for every node with a `type` string. */
function walkAst(root: unknown, enter: (node: any) => void): void {
  function visit(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    const node = value as Record<string, unknown>;
    if (typeof node.type === 'string') enter(node);
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) {
        for (const item of child) visit(item);
      } else {
        visit(child);
      }
    }
  }
  visit(root);
}

/** Check whether a subtree contains a node matching the predicate. */
function subtreeHas(root: unknown, predicate: (node: any) => boolean): boolean {
  let found = false;
  walkAst(root, (node) => {
    if (predicate(node)) found = true;
  });
  return found;
}

describe('ArtifactDetailView hmr affordances', () => {
  it('compiles without throwing', () => {
    expect(() =>
      compile(DetailViewSource, { name: 'ArtifactDetailView', filename: 'ArtifactDetailView.svelte' }),
    ).not.toThrow();
  });

  it('guards HmrStatusStrip with a non-plugin if-block', () => {
    let guardFound = false;
    walkAst(detailAst.html, (node) => {
      if (node.type === 'IfBlock' && node.expression) {
        const condition = srcOf(node.expression);
        if (
          condition.includes("artifactKind !== 'plugin'") &&
          subtreeHas(node, (n) => n.type === 'InlineComponent' && n.name === 'HmrStatusStrip')
        ) {
          guardFound = true;
        }
      }
    });
    expect(guardFound).toBe(true);
  });

  it('forwards hmr state, stableId, stop and broadcast-here callbacks to HmrStatusStrip', () => {
    let hmrComponentSource: string | null = null;
    walkAst(detailAst.html, (node) => {
      if (node.type === 'InlineComponent' && node.name === 'HmrStatusStrip') {
        hmrComponentSource = srcOf(node);
      }
    });
    expect(hmrComponentSource).not.toBeNull();
    const source = hmrComponentSource!;
    expect(source).toContain('hmrStatus={$hmrState}');
    expect(source).toContain('currentStableId={artifact.stableId}');
    expect(source).toContain('onStop={onHmrStopBroadcast}');
    expect(source).toContain('onBroadcastHere');
  });

  it('renders Broadcast button in the non-plugin (else) branch only', () => {
    let broadcastInElse = false;
    walkAst(detailAst.html, (node) => {
      if (node.type === 'IfBlock' && node.expression) {
        const condition = srcOf(node.expression);
        if (condition.includes("artifactKind === 'plugin'") && node.else) {
          broadcastInElse = subtreeHas(node.else, (n) =>
            n.type === 'Element' &&
            n.name === 'button' &&
            srcOf(n).includes('Broadcast') &&
            srcOf(n).includes('onHmrStartBroadcast'),
          );
        }
      }
    });
    expect(broadcastInElse).toBe(true);
  });
});
