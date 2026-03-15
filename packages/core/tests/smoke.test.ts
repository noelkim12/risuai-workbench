import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('packages/core smoke test', () => {
  it('package main entry can be imported from the built output', async () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'),
    );
    const mainEntryPath = path.join(process.cwd(), packageJson.main);

    const core = await import(mainEntryPath);

    // Root entry exports domain logic (pure, browser-safe)
    expect(core.extractCBSVarOps).toBeTypeOf('function');
    expect(core.analyzeLorebookStructure).toBeTypeOf('function');
    
    // Node.js I/O helpers are NOT in root entry (use './node' entry instead)
    expect(core.parseCardFile).toBeUndefined();
  });
});
