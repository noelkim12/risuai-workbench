import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { importLuaAnalysis, loadLuaArtifacts } from '../src/cli/analyze/charx/collectors';

let tempDir: string;

function writeFile(root: string, relativePath: string, text: string): void {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
}

describe('charx Lua collectors', () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risu-charx-lua-collectors-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('loads nested split .risulua files with relative path and split role metadata', () => {
    writeFile(tempDir, 'lua/main.risulua', 'function onOutput()\n  return helper()\nend');
    writeFile(tempDir, 'lua/domain/core.risulua', 'function helper()\n  return getChatVar("score")\nend');
    writeFile(tempDir, 'lua/features/core.risulua', 'function featureCore()\n  setChatVar("score", "1")\nend');
    writeFile(tempDir, 'dist/generated.risulua', 'function generated() return false end');

    const artifacts = loadLuaArtifacts(tempDir, null);

    expect(artifacts.map((artifact) => artifact.relativePath)).toEqual([
      'lua/main.risulua',
      'lua/domain/core.risulua',
      'lua/features/core.risulua',
    ]);
    expect(artifacts.map((artifact) => artifact.splitRole)).toEqual(['main', 'domain', 'features']);
    expect(artifacts.map((artifact) => artifact.baseName)).toEqual(['main', 'core', 'core']);
    expect(artifacts.flatMap((artifact) => artifact.elementCbs.map((cbs) => cbs.elementName))).toEqual([
      'lua/main',
      'lua/domain/core',
      'lua/features/core',
    ]);
  });

  it('imports nested analysis JSON as relative Lua element names', () => {
    writeFile(tempDir, 'lua/domain/core.analysis.json', JSON.stringify({ stateVars: { score: { readBy: ['helper'], writtenBy: [] } } }));
    writeFile(tempDir, 'lua/runtime/output.analysis.json', JSON.stringify({ stateVars: { score: { readBy: [], writtenBy: ['onOutput'] } } }));
    writeFile(tempDir, 'dist/generated.analysis.json', JSON.stringify({ stateVars: { generated: { readBy: ['generated'], writtenBy: [] } } }));

    const cbs = importLuaAnalysis(tempDir);

    expect(cbs.map((entry) => entry.elementName)).toEqual([
      'lua/domain/core',
      'lua/runtime/output',
    ]);
    expect(cbs[0].reads.has('score')).toBe(true);
    expect(cbs[1].writes.has('score')).toBe(true);
  });
});
