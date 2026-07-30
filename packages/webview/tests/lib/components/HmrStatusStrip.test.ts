import { describe, expect, it } from 'vitest';
import { compile, parse } from 'svelte/compiler';
import StripSource from '../../../src/lib/components/HmrStatusStrip.svelte?raw';

const stripAst = parse(StripSource, { filename: 'HmrStatusStrip.svelte' });

/** Slice original source for a positioned AST node. */
function srcOf(node: { start: number; end: number }): string {
  return StripSource.slice(node.start, node.end);
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

/** Button snapshot: full element source + extracted on:click handler expression. */
interface ButtonSnapshot {
  source: string;
  clickHandler: string | null;
}

/** Collect all <button> elements with their on:click handler. */
function collectButtons(): ButtonSnapshot[] {
  const buttons: ButtonSnapshot[] = [];
  walkAst(stripAst.html, (node) => {
    if (node.type === 'Element' && node.name === 'button') {
      const source = srcOf(node);
      let clickHandler: string | null = null;
      walkAst(node, (child) => {
        if (child.type === 'EventHandler' && child.name === 'click' && !clickHandler && child.expression) {
          clickHandler = srcOf(child.expression);
        }
      });
      buttons.push({ source, clickHandler });
    }
  });
  return buttons;
}

describe('HmrStatusStrip', () => {
  it('compiles without throwing', () => {
    expect(() =>
      compile(StripSource, { name: 'HmrStatusStrip', filename: 'HmrStatusStrip.svelte' }),
    ).not.toThrow();
  });

  it('renders broadcasting-here branch gated on isHere && hmrStatus', () => {
    const conditions: string[] = [];
    walkAst(stripAst.html, (node) => {
      if (node.type === 'IfBlock' && node.expression) {
        conditions.push(srcOf(node.expression));
      }
    });
    expect(conditions).toContain('isHere && hmrStatus');
  });

  it('renders elsewhere branch gated on isRunning && hmrStatus via else-if', () => {
    let elseIfCondition: string | null = null;
    walkAst(stripAst.html, (node) => {
      if (
        node.type === 'IfBlock' &&
        node.expression &&
        srcOf(node.expression) === 'isHere && hmrStatus' &&
        node.else &&
        !elseIfCondition
      ) {
        walkAst(node.else, (child) => {
          if (child.type === 'IfBlock' && child.expression && !elseIfCondition) {
            elseIfCondition = srcOf(child.expression);
          }
        });
      }
    });
    expect(elseIfCondition).toBe('isRunning && hmrStatus');
  });

  it('produces no output in idle state (no terminal else clause)', () => {
    let terminalElse: unknown = undefined;
    walkAst(stripAst.html, (node) => {
      if (
        node.type === 'IfBlock' &&
        node.expression &&
        srcOf(node.expression) === 'isRunning && hmrStatus'
      ) {
        terminalElse = node.else;
      }
    });
    expect(terminalElse).toBeFalsy();
  });

  it('wires Copy connection string button to copyConnectionString handler', () => {
    const buttons = collectButtons();
    const copyBtn = buttons.find((b) => b.source.includes('Copied') || b.source.includes('Copy connection'));
    expect(copyBtn).toBeDefined();
    expect(copyBtn!.clickHandler).toBe('copyConnectionString');
  });

  it('wires Stop button to onStop callback', () => {
    const buttons = collectButtons();
    const stopBtn = buttons.find((b) => b.clickHandler === 'onStop');
    expect(stopBtn).toBeDefined();
    expect(stopBtn!.source).toContain('>Stop<');
  });

  it('wires Save plugin button to onSavePlugin callback', () => {
    const buttons = collectButtons();
    const savePluginBtn = buttons.find((b) => b.clickHandler === 'onSavePlugin');
    expect(savePluginBtn).toBeDefined();
    expect(savePluginBtn!.source).toContain('Save plugin');
  });

  it('wires Open in Explorer button to onOpenSavedPlugin callback', () => {
    const buttons = collectButtons();
    const openPluginBtn = buttons.find((b) => b.clickHandler === 'onOpenSavedPlugin');
    expect(openPluginBtn).toBeDefined();
    expect(openPluginBtn!.source).toContain('Open in Explorer');
  });

  it('shows an explicit saving state on the plugin action', () => {
    expect(StripSource).toContain("pluginSaveState === 'saving'");
    expect(StripSource).toContain('Saving…');
    expect(StripSource).toContain('aria-busy');
  });

  it('wires Broadcast this instead button to onBroadcastHere callback', () => {
    const buttons = collectButtons();
    const broadcastBtn = buttons.find((b) => b.source.includes('Broadcast this instead'));
    expect(broadcastBtn).toBeDefined();
    expect(broadcastBtn!.clickHandler).toBe('onBroadcastHere');
  });

  it('derives receiver freshness from lastPollAtMs with 35s window', () => {
    expect(StripSource).toContain('RECEIVER_FRESH_WINDOW_MS');
    expect(StripSource).toMatch(/35[_]?000/);
    expect(StripSource).toContain('lastPollAtMs');
    expect(StripSource).toContain('receiverConnected');
  });

  it('clears both ticker interval and copy feedback timeout in onDestroy', () => {
    const match = StripSource.match(/onDestroy\([\s\S]*?\}\)/);
    expect(match).not.toBeNull();
    const body = match![0];
    expect(body).toContain('clearInterval');
    expect(body).toContain('clearTimeout');
  });
});
