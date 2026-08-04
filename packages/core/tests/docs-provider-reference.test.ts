import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { installDocsProviderBundle } from '../src/cli/shared/docs-provider';

const REFERENCE_FILENAMES = ['CBS_FOR_LLM.md', 'LUA_FOR_LLM.md'] as const;
const REFERENCE_SOURCE_ROOT = path.resolve(__dirname, '..', '..', '..', 'docs', 'reference');

describe('docs-provider LLM references', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-provider-reference-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('installs both canonical reference documents', () => {
    installDocsProviderBundle({ outputRoot: tmpDir });

    for (const filename of REFERENCE_FILENAMES) {
      const expected = fs.readFileSync(path.join(REFERENCE_SOURCE_ROOT, filename), 'utf-8');
      const actual = fs.readFileSync(path.join(tmpDir, 'docs', 'reference', filename), 'utf-8');
      expect(actual).toBe(expected);
    }

    const agentGuidance = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8');
    expect(agentGuidance).toContain('(docs/reference/CBS_FOR_LLM.md)');
    expect(agentGuidance).toContain('(docs/reference/LUA_FOR_LLM.md)');
  });

  it('preserves an existing reference document by default', () => {
    const referencePath = path.join(tmpDir, 'docs', 'reference', 'CBS_FOR_LLM.md');
    fs.mkdirSync(path.dirname(referencePath), { recursive: true });
    fs.writeFileSync(referencePath, 'custom CBS guidance', 'utf-8');

    installDocsProviderBundle({ outputRoot: tmpDir });

    expect(fs.readFileSync(referencePath, 'utf-8')).toBe('custom CBS guidance');
    expect(fs.existsSync(path.join(tmpDir, 'docs', 'reference', 'LUA_FOR_LLM.md'))).toBe(true);
  });
});
