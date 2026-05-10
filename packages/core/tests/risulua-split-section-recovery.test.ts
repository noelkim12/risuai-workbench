import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  RISULUA_SPLIT_PLAN_PATH,
  RISULUA_SPLIT_REPORT_PATH,
  createRisuLuaSectionRecoveryArtifacts,
  extractRisuLuaSections,
  writeRisuLuaSectionRecoveryWorkspace,
} from '../src/domain/risulua-split';
import type { RisuLuaSplitPlan } from '../src/domain/risulua-split';

const fixtureRoot = fileURLToPath(new URL('./fixtures/risulua/', import.meta.url));

describe('risulua-split section recovery writer', () => {
  it('recovers marker sections in source order without wrappers or synthesized requires', () => {
    withTempDir((outputRoot) => {
      const source = readFixture('section-bundle/section_three_markers.risulua');
      const sourcePath = fixturePath('section-bundle/section_three_markers.risulua');
      const artifacts = createRisuLuaSectionRecoveryArtifacts({ source, sourcePath, targetName: 'section_three_markers' });

      writeRisuLuaSectionRecoveryWorkspace(artifacts, { outputRoot, cwd: process.cwd() });

      const plan = readPlan(outputRoot);
      const sectionFiles = plan.files.filter((file) => file.kind === 'chunk-fragment');
      const orderedSectionPaths = sectionFiles
        .sort((a, b) => a.preserveOrderIndex - b.preserveOrderIndex)
        .map((file) => file.path);
      const concatenated = orderedSectionPaths.map((relativePath) => readOutput(outputRoot, relativePath)).join('');
      const main = readOutput(outputRoot, 'lua/main.risulua');

      expect(fs.existsSync(path.join(outputRoot, 'lua', 'main.risulua'))).toBe(true);
      expect(fs.existsSync(path.join(outputRoot, 'legacy', 'original.risulua'))).toBe(true);
      expect(fs.existsSync(path.join(outputRoot, ...RISULUA_SPLIT_PLAN_PATH.split('/')))).toBe(true);
      expect(fs.existsSync(path.join(outputRoot, ...RISULUA_SPLIT_REPORT_PATH.split('/')))).toBe(true);
      expect(plan).toEqual(expect.objectContaining({
        mode: 'coarse',
        sourceProfile: 'section-bundle',
        buildStrategy: 'section-order-concat',
        packable: true,
        entryPath: 'lua/main.risulua',
      }));
      expect(sectionFiles).toEqual([
        expect.objectContaining({ path: 'lua/sections/00_init.risulua', sectionLabel: '00_init.lua', preserveOrderIndex: 0 }),
        expect.objectContaining({ path: 'lua/sections/10_helpers.risulua', sectionLabel: '10_helpers.lua', preserveOrderIndex: 1 }),
        expect.objectContaining({ path: 'lua/sections/90_runtime.risulua', sectionLabel: '90_runtime.lua', preserveOrderIndex: 2 }),
      ]);
      expect(concatenated).toBe(source);
      expect(readOutput(outputRoot, 'legacy/original.risulua')).toBe(source);
      expect(main).toContain('These files are chunk fragments, not independent Lua modules.');
      expect(main).toContain('include-order is stored in docs/risulua-split-plan.json');
      expect(main).not.toMatch(/require\s*\(/);
      for (const relativePath of orderedSectionPaths) {
        const sectionText = readOutput(outputRoot, relativePath);
        expect(sectionText).not.toMatch(/function\s*\(\)\s*\n/);
        expect(sectionText).not.toContain('require("sections.');
      }
    });
  });

  it('stores exact section ranges and safe generated paths in the plan', () => {
    const source = readFixture('section-bundle/section_three_markers.risulua');
    const sections = extractRisuLuaSections(source).sections;
    const artifacts = createRisuLuaSectionRecoveryArtifacts({
      source,
      sourcePath: fixturePath('section-bundle/section_three_markers.risulua'),
    });

    const sectionFiles = artifacts.plan.files.filter((file) => file.kind === 'chunk-fragment');

    expect(sectionFiles).toHaveLength(sections.length);
    for (const [index, file] of sectionFiles.entries()) {
      const section = sections[index];
      expect(file.path).toBe(section.path);
      expect(file.path).toMatch(/^lua\/sections\/[A-Za-z0-9._-]+\.risulua$/);
      expect(file.path).not.toContain('..');
      expect(file.sectionLabel).toBe(section.sectionLabel);
      expect(file.preserveOrderIndex).toBe(index);
      expect(file.sourceRanges).toEqual([section.sourceRange]);
      expect(source.slice(section.sourceRange.startOffset, section.sourceRange.endOffset)).toBe(section.content);
    }
  });

  it('preserves section scope leaks by keeping raw chunk fragments in marker order', () => {
    withTempDir((outputRoot) => {
      const source = readFixture('section-bundle/section_scope_leak.risulua');
      const artifacts = createRisuLuaSectionRecoveryArtifacts({
        source,
        sourcePath: fixturePath('section-bundle/section_scope_leak.risulua'),
        targetName: 'section_scope_leak',
      });

      writeRisuLuaSectionRecoveryWorkspace(artifacts, { outputRoot, cwd: process.cwd() });

      const plan = readPlan(outputRoot);
      const sectionFiles = plan.files
        .filter((file) => file.kind === 'chunk-fragment')
        .sort((a, b) => a.preserveOrderIndex - b.preserveOrderIndex);
      const concatenated = sectionFiles.map((file) => readOutput(outputRoot, file.path)).join('');

      expect(concatenated).toBe(source);
      expect(concatenated).toContain('local shared = "visible across concatenated sections"');
      expect(concatenated).toContain('return shared');
      expect(sectionFiles.map((file) => file.sectionLabel)).toEqual(['00_state.lua', '20_feature.lua', '80_runtime.lua']);
      expect(plan.risks).toEqual([expect.objectContaining({
        id: 'section-chunk-fragment-semantics',
        riskFlags: ['chunk-fragment', 'section-order-concat'],
      })]);
      expect(readOutput(outputRoot, 'lua/main.risulua')).not.toMatch(/require\s*\(/);
    });
  });
});

function readFixture(relativePath: string): string {
  return fs.readFileSync(fixturePath(relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function fixturePath(relativePath: string): string {
  return path.join(fixtureRoot, ...relativePath.split('/'));
}

function withTempDir(run: (outputRoot: string) => void): void {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'risulua-section-recovery-'));
  try {
    run(outputRoot);
  } finally {
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
}

function readOutput(outputRoot: string, relativePath: string): string {
  return fs.readFileSync(path.join(outputRoot, ...relativePath.split('/')), 'utf8');
}

function readPlan(outputRoot: string): RisuLuaSplitPlan {
  return JSON.parse(readOutput(outputRoot, RISULUA_SPLIT_PLAN_PATH)) as RisuLuaSplitPlan;
}
