/**
 * Release pipeline contract tests.
 * @file packages/cbs-lsp/tests/standalone/release-pipeline.test.ts
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

interface RootManifest {
  devDependencies?: Record<string, string>;
  packageManager?: string;
  scripts?: Record<string, string>;
}

interface ReleaseManifest {
  dependencies?: Record<string, string>;
  packageManager?: string;
  private?: boolean;
  publishConfig?: {
    access?: string;
    provenance?: boolean;
  };
  version?: string;
}

const repoRoot = path.resolve(process.cwd(), '..', '..');

/**
 * readJson 함수.
 * 저장소 루트 기준 JSON 파일을 읽어 파싱함.
 *
 * @param relativePath - 저장소 루트 기준 상대 경로
 * @returns 파싱된 JSON 값
 */
function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(path.join(repoRoot, relativePath), 'utf8')) as T;
}

/**
 * readText 함수.
 * 저장소 루트 기준 텍스트 파일을 읽음.
 *
 * @param relativePath - 저장소 루트 기준 상대 경로
 * @returns 파일 원문
 */
function readText(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('cbs-lsp release pipeline contract', () => {
  it('defines root release scripts and changesets tooling', () => {
    const manifest = readJson<RootManifest>('package.json');

    expect(manifest.devDependencies?.['@changesets/cli']).toBeTruthy();
    expect(manifest.packageManager).toMatch(/^npm@/);
    expect(manifest.scripts?.changeset).toBe('changeset');
    expect(manifest.scripts?.['release:version']).toBe('changeset version');
    expect(manifest.scripts?.['release:publish:cbs-lsp']).toBe('changeset publish');
    expect(manifest.scripts?.['release:smoke:published:cbs-lsp']).toContain(
      'smoke-published-cbs-lsp.mjs',
    );
    expect(manifest.scripts?.['release:smoke:local']).toContain('smoke-local-release.mjs');
    expect(manifest.scripts?.['verify:cbs-lsp-release']).toContain('test:product-matrix');
  });

  it('pins public package dependency ranges and publish metadata', () => {
    const cbsLspManifest = readJson<ReleaseManifest>('packages/cbs-lsp/package.json');
    const coreManifest = readJson<ReleaseManifest>('packages/core/package.json');
    const mcpManifest = readJson<ReleaseManifest>('packages/risuai-workbench-mcp/package.json');
    const wasmManifest = readJson<ReleaseManifest>('packages/lua-analyzer-wasm/package.json');
    const vscodeManifest = readJson<ReleaseManifest>('packages/vscode/package.json');

    expect(wasmManifest.version).toBe('0.1.1');
    expect(coreManifest.version).toBe('0.1.1');
    expect(cbsLspManifest.version).toBe('0.1.1');
    expect(mcpManifest.version).toBe('0.1.1');
    expect(coreManifest.dependencies?.['@risuai-workbench/lua-analyzer-wasm']).toBe('^0.1.1');
    expect(cbsLspManifest.dependencies?.['@risuai-workbench/core']).toBe('^0.1.1');
    expect(mcpManifest.dependencies?.['@risuai-workbench/cbs-language-server']).toBe('^0.1.1');
    expect(mcpManifest.dependencies?.['@risuai-workbench/core']).toBe('^0.1.1');
    expect(cbsLspManifest.publishConfig).toEqual({ access: 'public', provenance: true });
    expect(coreManifest.packageManager).toMatch(/^npm@/);
    expect(coreManifest.publishConfig).toEqual({ access: 'public', provenance: true });
    expect(vscodeManifest.private).toBe(true);
    expect(vscodeManifest.dependencies?.['@risuai-workbench/core']).toBe('^0.1.1');
  });

  it('declares changesets policy for public and private packages', () => {
    const config = readJson<{
      access: string;
      baseBranch: string;
      ignore: string[];
      updateInternalDependencies: string;
    }>('.changeset/config.json');
    const readme = readText('.changeset/README.md');

    expect(config.access).toBe('public');
    expect(config.baseBranch).toBe('main');
    expect(config.updateInternalDependencies).toBe('patch');
    expect(config.ignore).toEqual(
      expect.arrayContaining(['risu-workbench-vscode', 'risu-workbench-webview']),
    );
    expect(readme).toContain('latest');
    expect(readme).toContain('next');
    expect(readme).toContain('canary');
    expect(readme).toContain('changeset');
  });

  it('wires CI and publish workflows with stable and snapshot channels', () => {
    const ciWorkflow = readText('.github/workflows/ci.yml');
    const publishWorkflow = readText('.github/workflows/cbs-lsp-publish.yml');
    const smokeScript = readText('scripts/release/smoke-published-cbs-lsp.mjs');

    expect(ciWorkflow).toContain('npm run verify:cbs-lsp-release');
    expect(ciWorkflow).toContain('npm run --workspace @risuai-workbench/mcp test');
    expect(publishWorkflow).toContain('changesets/action@v1');
    expect(publishWorkflow).toContain('workflow_dispatch');
    expect(publishWorkflow).toContain('- next');
    expect(publishWorkflow).toContain('- canary');
    expect(publishWorkflow).toContain('.changeset/snapshot-release.md');
    expect(publishWorkflow).toContain('release:smoke:published:cbs-lsp');
    expect(publishWorkflow).toContain('release:smoke:local');
    expect(publishWorkflow).toContain('NPM_CONFIG_PROVENANCE: true');
    expect(smokeScript).toContain('CBS_LSP_RELEASE_VERSION');
    expect(smokeScript).toContain('npm install');
    expect(smokeScript).toContain('cbs-language-server');
  });
});
