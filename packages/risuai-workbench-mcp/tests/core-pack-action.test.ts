import { mkdtemp, mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';

import { createWorkbenchActionRegistry } from '../src/actions/create-registry';
import type { ActionExecutionContext } from '../src/actions/types';
import { createMcpServer } from '../src/server';
import { handleCatalog, handlePrepareAction, handleRunAction } from '../src/tools/facade';

async function createModuleFixture(): Promise<{ context: ActionExecutionContext; outputPath: string }> {
  const root = await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-pack-'));
  const moduleRoot = path.join(root, 'module');
  await mkdir(path.join(moduleRoot, 'lua'), { recursive: true });
  await writeFile(path.join(moduleRoot, '.risumodule'), `${JSON.stringify({
    $schema: 'https://risuai-workbench.dev/schemas/risumodule.schema.json',
    kind: 'risu.module',
    schemaVersion: 1,
    id: 'pack-fixture',
    name: 'Pack Fixture',
    description: '',
    createdAt: null,
    modifiedAt: null,
    sourceFormat: 'json',
  }, null, 2)}\n`, 'utf8');
  await writeFile(path.join(moduleRoot, 'lua', 'main.risulua'), 'return { value = true }\n', 'utf8');
  return {
    context: {
      workspace: { ok: true, path: root, reason: null },
      mutationMode: 'enabled',
      patchStore: {
        findByIdeaId: () => null,
        getPatchPlan: () => null,
        savePatchPlan: () => {},
      },
    },
    outputPath: path.join(root, 'packed.risum'),
  };
}

describe('core.run_pack action', () => {
  it('completes route, catalog, prepare, and pack over the MCP transport', async () => {
    const fixture = await createModuleFixture();
    const server = createMcpServer(fixture.context);
    const client = new Client({ name: 'core-pack-smoke', version: '0.1.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

      const routed = await client.callTool({
        name: 'workbench.route_intent',
        arguments: {
          request: 'Pack this .risumodule workspace from canonical lua sources after validation.',
          target: 'module',
        },
      });
      expect(routed.structuredContent).toMatchObject({
        data: { route: { intent: 'pack.module', recommendedActions: expect.arrayContaining(['core.run_pack']) } },
      });

      const catalog = await client.callTool({
        name: 'workbench.catalog',
        arguments: {
          capability: 'pack',
          query: 'pack current .risumodule workspace using modular RisuLua and write generated dist',
        },
      });
      expect(catalog.structuredContent).toMatchObject({
        actions: expect.arrayContaining([expect.objectContaining({ id: 'core.run_pack' })]),
      });

      const prepared = await client.callTool({
        name: 'workbench.prepare_action',
        arguments: { actionId: 'core.run_pack' },
      });
      expect(prepared.structuredContent).toMatchObject({
        actionId: 'core.run_pack',
        fields: {
          outputPolicy: { enumValues: ['create-new', 'replace-atomic'], defaultValue: 'create-new' },
          risuluaMode: { enumValues: ['classic', 'modular'], defaultValue: 'modular' },
        },
      });

      const packed = await client.callTool({
        name: 'workbench.run_action',
        arguments: {
          actionId: 'core.run_pack',
          args: { inputRoot: 'module', outputPath: 'packed.risum', risuluaMode: 'modular' },
        },
      });
      expect(packed.structuredContent).toMatchObject({
        status: 'ok',
        data: {
          outputPath: 'packed.risum',
          generatedFiles: [expect.stringMatching(/^dist\/.+\.risulua$/u)],
          validation: { errorCount: 0, warningCount: 0 },
        },
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('is discoverable and prepares a valid modular pack call', async () => {
    const fixture = await createModuleFixture();
    const registry = createWorkbenchActionRegistry(fixture.context);

    const catalog = handleCatalog({
      capability: 'pack',
      query: 'pack current .risumodule workspace using modular RisuLua and write generated dist',
    }, registry);
    expect(catalog.actions.map((action) => action.id)).toContain('core.run_pack');

    const prepared = handlePrepareAction({ actionId: 'core.run_pack' }, registry);
    expect(prepared).not.toBeNull();
    if (!prepared) throw new Error('Expected core.run_pack prepare result.');
    expect(prepared.fields.risuluaMode).toMatchObject({
      type: 'enum',
      enumValues: ['classic', 'modular'],
      defaultValue: 'modular',
    });
    expect(prepared.fields.outputPolicy).toMatchObject({
      type: 'enum',
      enumValues: ['create-new', 'replace-atomic'],
      defaultValue: 'create-new',
    });
    expect(prepared.runActionInput).toEqual({
      actionId: 'core.run_pack',
      args: {
        inputRoot: 'module',
        outputPath: 'packed.risum',
        outputPolicy: 'create-new',
        risuluaMode: 'modular',
      },
    });
  });

  it('creates a modular .risum through run_action without embedding binary output', async () => {
    const fixture = await createModuleFixture();
    const registry = createWorkbenchActionRegistry(fixture.context);

    const result = await handleRunAction({
      actionId: 'core.run_pack',
      args: {
        inputRoot: 'module',
        outputPath: 'packed.risum',
        risuluaMode: 'modular',
      },
    }, registry, fixture.context);

    expect(result).toMatchObject({
      status: 'ok',
      data: {
        artifactKind: 'module',
        outputPath: 'packed.risum',
        risuluaMode: 'modular',
        bytesWritten: expect.any(Number),
        generatedFiles: [expect.stringMatching(/^dist\/.+\.risulua$/u)],
        validation: { errorCount: 0, warningCount: 0 },
      },
    });
    const packed = await readFile(fixture.outputPath);
    const distRoot = path.join(fixture.context.workspace.path, 'module', 'dist');
    const generatedFiles = await readdir(distRoot);
    expect(generatedFiles).toHaveLength(1);
    expect(await readFile(path.join(distRoot, generatedFiles[0] ?? ''), 'utf8'))
      .toContain('return { value = true }');
    expect([...packed.subarray(0, 2)]).toEqual([111, 0]);
    expect(JSON.stringify(result)).not.toContain(packed.toString('base64'));
  });

  it('rejects pack writes while mutation mode is preview-only', async () => {
    const fixture = await createModuleFixture();
    const context: ActionExecutionContext = { ...fixture.context, mutationMode: 'preview-only' };
    const registry = createWorkbenchActionRegistry(context);

    const result = await handleRunAction({
      actionId: 'core.run_pack',
      args: { inputRoot: 'module', outputPath: 'packed.risum', risuluaMode: 'modular' },
    }, registry, context);

    expect(result).toMatchObject({ status: 'domain_error' });
    await expect(readFile(fixture.outputPath)).rejects.toThrow();
  });

  it('rejects symlinked input roots and output parents that escape the workspace', async () => {
    const fixture = await createModuleFixture();
    const workspaceRoot = fixture.context.workspace.path;
    const externalInput = await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-pack-external-input-'));
    const externalOutput = await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-pack-external-output-'));
    await symlink(externalInput, path.join(workspaceRoot, 'linked-input'));
    await symlink(externalOutput, path.join(workspaceRoot, 'linked-output'));
    const registry = createWorkbenchActionRegistry(fixture.context);

    const inputEscape = await handleRunAction({
      actionId: 'core.run_pack',
      args: { inputRoot: 'linked-input', outputPath: 'packed.risum', risuluaMode: 'modular' },
    }, registry, fixture.context);
    const outputEscape = await handleRunAction({
      actionId: 'core.run_pack',
      args: { inputRoot: 'module', outputPath: 'linked-output/packed.risum', risuluaMode: 'modular' },
    }, registry, fixture.context);

    expect(inputEscape).toMatchObject({
      status: 'domain_error',
      diagnostics: expect.arrayContaining([expect.objectContaining({ id: 'RUN_PACK_PATH_OUTSIDE_WORKSPACE' })]),
    });
    expect(outputEscape).toMatchObject({
      status: 'domain_error',
      diagnostics: expect.arrayContaining([expect.objectContaining({ id: 'RUN_PACK_PATH_OUTSIDE_WORKSPACE' })]),
    });
    await expect(readFile(path.join(externalOutput, 'packed.risum'))).rejects.toThrow();
  });

  it('returns a structured output_exists reason under the default policy', async () => {
    const fixture = await createModuleFixture();
    const registry = createWorkbenchActionRegistry(fixture.context);
    const args = { inputRoot: 'module', outputPath: 'packed.risum', risuluaMode: 'modular' as const };
    await handleRunAction({ actionId: 'core.run_pack', args }, registry, fixture.context);

    const result = await handleRunAction({ actionId: 'core.run_pack', args }, registry, fixture.context);

    expect(result).toMatchObject({
      status: 'domain_error',
      data: { outputPath: 'packed.risum', reason: 'output_exists' },
      diagnostics: expect.arrayContaining([expect.objectContaining({ id: 'RUN_PACK_OUTPUT_EXISTS' })]),
    });
  });

  it('atomically replaces an existing archive when requested', async () => {
    const fixture = await createModuleFixture();
    const registry = createWorkbenchActionRegistry(fixture.context);
    const initialArgs = { inputRoot: 'module', outputPath: 'packed.risum', risuluaMode: 'modular' as const };
    await handleRunAction({ actionId: 'core.run_pack', args: initialArgs }, registry, fixture.context);
    const before = await readFile(fixture.outputPath);
    await writeFile(path.join(fixture.context.workspace.path, 'module/lua/main.risulua'), 'return { value = false }\n', 'utf8');

    const result = await handleRunAction({
      actionId: 'core.run_pack',
      args: { ...initialArgs, outputPolicy: 'replace-atomic' },
    }, registry, fixture.context);
    const after = await readFile(fixture.outputPath);

    expect(result).toMatchObject({ status: 'ok', data: { outputPath: 'packed.risum' } });
    expect(after.equals(before)).toBe(false);
    expect((await readdir(fixture.context.workspace.path)).some((entry) => entry.includes('.pack-tmp-'))).toBe(false);
  });
});
