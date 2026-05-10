import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  detectRisuLuaSourceProfile,
  evaluateLuaRuntimeRiskPolicy,
  type RisuLuaSourceProfile,
} from '../src/domain/risulua-split';
import { RISULUA_FIXTURE_MANIFEST } from './fixtures/risulua/manifest';

const fixtureRoot = fileURLToPath(new URL('./fixtures/risulua/', import.meta.url));

const requiredFixtureIds = [
  'preload_simple',
  'section_three_markers',
  'plain_hooks_only',
  'mixed_preload_and_marker',
  'empty',
  'commented_fake_preload',
  'preload_dynamic_require',
] as const;

describe('risulua-split source profile detector', () => {
  it.each(requiredFixtureIds)('matches fixture manifest profile for %s', (fixtureId) => {
    const entry = fixtureEntry(fixtureId);
    const result = detectRisuLuaSourceProfile(readFixture(entry.relativePath));

    expect(result.profile).toBe(entry.expectedProfile);
    expect(result.reasons[result.reasons.length - 2]).toBe(`Selected profile: ${entry.expectedProfile}.`);
  });

  it('records preload modules, static requires, ranges, and no bundle markers for preload fixtures', () => {
    const result = detectRisuLuaSourceProfile(readFixture('synthetic/preload_simple.risulua'));

    expect(result.profile).toBe('preload-bundle');
    expect(result.preloadModules.map((module) => module.id)).toEqual(['./constants', './formatter']);
    expect(result.preloadModules).toEqual([
      expect.objectContaining({ id: './constants', startLine: 1, startOffset: 0, endLine: 3 }),
      expect.objectContaining({ id: './formatter', startLine: 5, endLine: 12 }),
    ]);
    expect(result.staticRequires.map((request) => request.id)).toEqual(['./constants', './formatter']);
    expect(result.staticRequires[0]).toEqual(expect.objectContaining({ line: 6, raw: '"./constants"' }));
    expect(result.sectionMarkers).toEqual([]);
  });

  it('records section bundle markers only from intentional comments', () => {
    const result = detectRisuLuaSourceProfile(readFixture('section-bundle/section_three_markers.risulua'));

    expect(result.profile).toBe('section-bundle');
    expect(result.sectionMarkers).toEqual([
      { label: '00_init.lua', line: 1, startOffset: 0 },
      expect.objectContaining({ label: '10_helpers.lua', line: 4 }),
      expect.objectContaining({ label: '90_runtime.lua', line: 10 }),
    ]);
    expect(result.preloadModules).toEqual([]);
  });

  it('distinguishes static and dynamic require expressions', () => {
    const result = detectRisuLuaSourceProfile(readFixture('preload-bundle/preload_dynamic_require.risulua'));

    expect(result.profile).toBe('preload-bundle');
    expect(result.staticRequires).toEqual([expect.objectContaining({ id: './feature', line: 10 })]);
    expect(result.dynamicRequires).toEqual([expect.objectContaining({ line: 5, expression: 'moduleName' })]);
  });

  it('ignores fake preload, require, load, package.path, and bundle markers in comments and strings', () => {
    const source = `${readFixture('synthetic/commented_fake_preload.risulua')}\n${[
      '-- loadfile("fake.lua") and dofile("fake.lua") and package.path = "./?.lua"',
      'local quoted = "package.preload[\\"./fake2\\"] = function() end require(\\"./fake\\") load(\\"fake\\") -- [BUNDLE] string.lua"',
      'local long = [[ package.path = "bad" require("long_fake") -- [BUNDLE] long.lua ]]',
    ].join('\n')}`;

    const result = detectRisuLuaSourceProfile(source);

    expect(result.profile).toBe('plain-single');
    expect(result.preloadModules).toEqual([]);
    expect(result.sectionMarkers).toEqual([]);
    expect(result.staticRequires).toEqual([]);
    expect(result.dynamicRequires).toEqual([]);
    expect(result.runtimeLoads).toEqual([]);
    expect(result.packagePathMutations).toEqual([]);
  });

  it('keeps line numbers correct after skipped multiline long-bracket comments and strings', () => {
    const source = [
      '--[[',
      'package.preload["./fake_comment"] = function() end',
      'require("./fake_comment")',
      'load("fake_comment")',
      'package.path = "./?.lua"',
      '-- [BUNDLE] fake_comment.lua',
      ']]',
      'local text = [[',
      'package.preload["./fake_string"] = function() end',
      'require("./fake_string")',
      'load("fake_string")',
      'package.path = "./?.lua"',
      '-- [BUNDLE] fake_string.lua',
      ']]',
      'local real = require("./real")',
      'loadfile("real.lua")',
    ].join('\n');

    const result = detectRisuLuaSourceProfile(source);

    expect(result.profile).toBe('plain-single');
    expect(result.preloadModules).toEqual([]);
    expect(result.sectionMarkers).toEqual([]);
    expect(result.staticRequires).toEqual([expect.objectContaining({ id: './real', line: 15 })]);
    expect(result.runtimeLoads).toEqual([expect.objectContaining({ kind: 'loadfile', line: 16 })]);
    expect(result.packagePathMutations).toEqual([]);
  });

  it('keeps a single marker ambiguous instead of inferring section-bundle', () => {
    const result = detectRisuLuaSourceProfile('-- [BUNDLE] lonely.lua\nfunction onStart() end\n');

    expect(result.profile satisfies RisuLuaSourceProfile).toBe('unknown');
    expect(result.confidence).toBe('very-low');
    expect(result.reasons).toContain('Only one [BUNDLE] marker was found, so section-bundle was not inferred.');
  });

  it('maps runtime load and package loader mutations through risk policy', () => {
    const result = detectRisuLuaSourceProfile([
      'loadfile("disk.lua")',
      'dofile("disk.lua")',
      'load("return 1")()',
      'load(source[1].content, "@prelude", "t")()',
      'load(userControlledString)',
      'package.path = package.path .. ";./?.lua"',
      'package.cpath = "./?.so"',
      'package.searchers[1] = nil',
      'package["loaders"] = {}',
    ].join('\n'));
    const findings = evaluateLuaRuntimeRiskPolicy(result);

    expect(result.profile).toBe('plain-single');
    expect(result.runtimeLoads.map((load) => load.risk)).toEqual([
      'runtime-loadfile',
      'runtime-dofile',
      'runtime-load-string',
      'runtime-prelude-load',
      'runtime-load-dynamic',
    ]);
    expect(result.packagePathMutations).toHaveLength(4);
    expect(findings.map((finding) => [finding.id, finding.severity])).toEqual([
      ['runtime-loadfile', 'error'],
      ['runtime-dofile', 'error'],
      ['runtime-load-string', 'strong-warning'],
      ['runtime-prelude-load', 'warning'],
      ['runtime-load-dynamic', 'warning'],
      ['package-loader-mutation', 'error'],
      ['package-loader-mutation', 'error'],
      ['package-loader-mutation', 'error'],
      ['package-loader-mutation', 'error'],
    ]);
  });
});

function fixtureEntry(id: string) {
  const entry = RISULUA_FIXTURE_MANIFEST.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`Missing fixture manifest entry: ${id}`);
  return entry;
}

function readFixture(relativePath: string): string {
  return fs.readFileSync(path.join(fixtureRoot, ...relativePath.split('/')), 'utf8').replace(/\r\n/g, '\n');
}
