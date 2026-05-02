/**
 * Product documentation set contract tests.
 * @file packages/cbs-lsp/tests/standalone/documentation-set.test.ts
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const packageRoot = process.cwd();
const repoRoot = path.resolve(packageRoot, '..', '..');

function readRepoText(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('cbs-language-server product documentation set', () => {
  const docs = {
    readme: 'packages/cbs-lsp/README.md',
    standaloneUsage: 'packages/cbs-lsp/docs/STANDALONE_USAGE.md',
    agentIntegration: 'packages/cbs-lsp/docs/AGENT_INTEGRATION.md',
    lualsCompanion: 'packages/cbs-lsp/docs/LUALS_COMPANION.md',
    troubleshooting: 'packages/cbs-lsp/docs/TROUBLESHOOTING.md',
    compatibility: 'packages/cbs-lsp/docs/COMPATIBILITY.md',
    vscodeClient: 'packages/vscode/README.md',
  } as const;

  it('ships the split product docs and keeps README as the entry point', () => {
    const readme = readRepoText(docs.readme);

    expect(readme).toContain(docs.standaloneUsage);
    expect(readme).toContain(docs.agentIntegration);
    expect(readme).toContain(docs.lualsCompanion);
    expect(readme).toContain(docs.troubleshooting);
    expect(readme).toContain(docs.vscodeClient);
    expect(readme).toContain('## 제품 문서 세트');
    expect(readme).toContain('## 빠른 시작');
  });

  it('keeps cross-links between the standalone, companion, agent, troubleshooting, and vscode guides', () => {
    const standalone = readRepoText(docs.standaloneUsage);
    const agentIntegration = readRepoText(docs.agentIntegration);
    const lualsCompanion = readRepoText(docs.lualsCompanion);
    const troubleshooting = readRepoText(docs.troubleshooting);
    const vscodeClient = readRepoText(docs.vscodeClient);
    const compatibility = readRepoText(docs.compatibility);

    expect(standalone).toContain(docs.vscodeClient);
    expect(standalone).toContain(docs.lualsCompanion);
    expect(standalone).toContain(docs.agentIntegration);
    expect(agentIntegration).toContain(docs.standaloneUsage);
    expect(agentIntegration).toContain(docs.troubleshooting);
    expect(agentIntegration).toContain('`schema` field: `cbs-lsp-agent-contract`');
    expect(lualsCompanion).toContain(docs.standaloneUsage);
    expect(lualsCompanion).toContain(docs.troubleshooting);
    expect(troubleshooting).toContain(docs.lualsCompanion);
    expect(troubleshooting).toContain(docs.vscodeClient);
    expect(vscodeClient).toContain(docs.standaloneUsage);
    expect(vscodeClient).toContain(docs.compatibility);
    expect(compatibility).toContain(docs.lualsCompanion);
    expect(compatibility).toContain(docs.vscodeClient);
  });
});
