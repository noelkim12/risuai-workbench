import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { WorkspaceRootStatus } from '../../src/project/resolve-root';
import { handleInspectArtifact } from '../../src/tools/inspect/inspect-artifact';
import { handleValidateArtifact } from '../../src/tools/validate/validate-artifact';

describe('artifact root resolution', () => {
  it('accepts a module workspace containing generated archives', async () => {
    const root = await createModuleWorkspaceWithArchives();
    const workspace = makeOkWorkspace(root);

    const inspected = await handleInspectArtifact({ artifactRoot: '.' }, workspace);
    const validated = await handleValidateArtifact({ artifactRoot: '.' }, workspace);

    expect(inspected.status).toBe('ok');
    expect(inspected.data).toMatchObject({ artifactKind: 'module', resolvedPath: root });
    expect(validated.status).toBe('ok');
    expect(validated.data).toMatchObject({ artifactKind: 'module', canonicalFileCount: 1, resolvedPath: root });
  });

  it.each(['risum', 'risup', 'charx'])('classifies a .%s file as an archive input', async (extension) => {
    const root = await createModuleWorkspaceWithArchives();
    const workspace = makeOkWorkspace(root);
    const artifactRoot = `out/module.${extension}`;

    const inspected = await handleInspectArtifact({ artifactRoot }, workspace);
    const validated = await handleValidateArtifact({ artifactRoot }, workspace);

    for (const result of [inspected, validated]) {
      expect(result.status).toBe('domain_error');
      expect(result.data).toMatchObject({
        artifactKind: 'archive',
        inputKind: 'archive',
        resolutionStage: 'artifact-root-kind',
        resolvedPath: path.join(root, artifactRoot),
      });
    }
  });
});

function makeOkWorkspace(root: string): WorkspaceRootStatus {
  return { ok: true, path: root, reason: null };
}

async function createModuleWorkspaceWithArchives(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'risuai-workbench-mcp-module-root-'));
  await mkdir(path.join(root, 'lua'), { recursive: true });
  await mkdir(path.join(root, 'out'), { recursive: true });
  await writeFile(path.join(root, '.risumodule'), JSON.stringify({
    $schema: 'https://risuai-workbench.dev/schemas/risumodule.schema.json',
    kind: 'risu.module',
    schemaVersion: 1,
    id: 'module',
    name: 'Module',
    description: '',
    createdAt: null,
    modifiedAt: null,
    sourceFormat: 'json',
  }), 'utf8');
  await writeFile(path.join(root, 'lua', 'main.risulua'), 'return {}\n', 'utf8');
  for (const extension of ['risum', 'risup', 'charx']) {
    await writeFile(path.join(root, 'out', `module.${extension}`), 'archive-placeholder', 'utf8');
  }
  return root;
}
