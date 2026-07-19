import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { ContextStore } from '../src/context/context-store';
import { runtimeSourceSchema } from '../src/actions/schemas/runtime-schemas';
import { resolveRuntimeSource } from '../src/tools/runtime/source-resolver';

function workspace(): { root: string; status: { ok: true; path: string; reason: null } } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'risulua-runtime-source-'));
  return { root, status: { ok: true, path: root, reason: null } };
}

describe('MCP RisuLua runtime source resolver', () => {
  it('loads canonical modules from the workspace lua directory', async () => {
    const { root, status } = workspace();
    fs.mkdirSync(path.join(root, 'lua', 'domain'), { recursive: true });
    fs.writeFileSync(path.join(root, 'lua', 'main.risulua'), 'return require("domain.phase")');
    fs.writeFileSync(path.join(root, 'lua', 'domain', 'phase.risulua'), 'return { phase = 2 }');

    await expect(resolveRuntimeSource(
      { kind: 'workspace', form: 'canonical' },
      { workspace: status },
    )).resolves.toEqual({
      entryModuleId: 'main',
      modules: {
        main: 'return require("domain.phase")',
        'domain.phase': 'return { phase = 2 }',
      },
    });
  });

  it('maps the single generated dist artifact to __dist', async () => {
    const { root, status } = workspace();
    fs.mkdirSync(path.join(root, 'dist'));
    fs.writeFileSync(path.join(root, 'dist', 'character.risulua'), 'return { built = true }');

    await expect(resolveRuntimeSource(
      { kind: 'workspace', form: 'dist' },
      { workspace: status },
    )).resolves.toEqual({
      entryModuleId: '__dist',
      modules: { __dist: 'return { built = true }' },
    });
  });

  it('loads a validated module bundle from ContextStore', async () => {
    const store = new ContextStore();
    const context = store.create('risulua-runtime-source', 'large source', {
      entry: 'domain.phase',
      modules: { 'domain.phase': 'return { phase = 3 }' },
    });

    await expect(resolveRuntimeSource(
      { kind: 'context', contextId: context.id },
      { workspace: workspace().status, contextStore: store },
    )).resolves.toEqual({
      entryModuleId: 'domain.phase',
      modules: { 'domain.phase': 'return { phase = 3 }' },
    });
  });

  it('rejects unrelated or missing context payloads', async () => {
    const store = new ContextStore();
    const context = store.create('manual', 'wrong shape', { text: 'not a module bundle' });
    const status = workspace().status;

    await expect(resolveRuntimeSource(
      { kind: 'context', contextId: context.id },
      { workspace: status, contextStore: store },
    )).rejects.toThrow(/context payload/i);
    await expect(resolveRuntimeSource(
      { kind: 'context', contextId: 'ctx_missing' },
      { workspace: status, contextStore: store },
    )).rejects.toThrow(/not found/i);
  });

  it('accepts exactly 128 KiB inline and rejects one byte more', async () => {
    const status = workspace().status;
    const exact = 'x'.repeat(128 * 1024);

    await expect(resolveRuntimeSource(
      { kind: 'inline', moduleId: 'main', source: exact },
      { workspace: status },
    )).resolves.toEqual({ entryModuleId: 'main', modules: { main: exact } });
    await expect(resolveRuntimeSource(
      { kind: 'inline', moduleId: 'main', source: `${exact}x` },
      { workspace: status },
    )).rejects.toThrow(/128 KiB/i);
  });

  it('does not follow symlinked canonical modules outside the workspace', async () => {
    const { root, status } = workspace();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'risulua-runtime-outside-'));
    fs.mkdirSync(path.join(root, 'lua'));
    fs.writeFileSync(path.join(root, 'lua', 'main.risulua'), 'return true');
    fs.writeFileSync(path.join(outside, 'secret.risulua'), 'return "secret"');
    fs.symlinkSync(path.join(outside, 'secret.risulua'), path.join(root, 'lua', 'secret.risulua'));

    const result = await resolveRuntimeSource(
      { kind: 'workspace', form: 'canonical' },
      { workspace: status },
    );
    expect(result.modules).toEqual({ main: 'return true' });
  });

  it('returns a clear error when dist output is missing or ambiguous', async () => {
    const missing = workspace();
    await expect(resolveRuntimeSource(
      { kind: 'workspace', form: 'dist' },
      { workspace: missing.status },
    )).rejects.toThrow(/dist.*missing/i);

    const ambiguous = workspace();
    fs.mkdirSync(path.join(ambiguous.root, 'dist'));
    fs.writeFileSync(path.join(ambiguous.root, 'dist', 'a.risulua'), 'return 1');
    fs.writeFileSync(path.join(ambiguous.root, 'dist', 'b.risulua'), 'return 2');
    await expect(resolveRuntimeSource(
      { kind: 'workspace', form: 'dist' },
      { workspace: ambiguous.status },
    )).rejects.toThrow(/multiple.*dist/i);
  });

  it('uses strict tagged schemas and rejects arbitrary path fields', () => {
    expect(runtimeSourceSchema.safeParse({
      kind: 'workspace',
      form: 'canonical',
      path: '/tmp/untrusted.risulua',
    }).success).toBe(false);
    expect(runtimeSourceSchema.safeParse({
      kind: 'inline',
      moduleId: 'main',
      source: 'return true',
      callback: 'function() end',
    }).success).toBe(false);
  });
});
