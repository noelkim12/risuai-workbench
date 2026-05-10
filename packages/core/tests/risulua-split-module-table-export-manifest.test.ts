import { describe, expect, it } from 'vitest';

import {
  buildRisuLuaModuleTableExportManifest,
  serializeRisuLuaModuleTableExportManifest,
} from '../src/domain/risulua-split';
import { lines, planFixture } from './helpers/module-table-refactor-map-helpers';

describe('risulua-split module-table export manifest', () => {
  it('records host ABI entries duplicate groups and listener roots in source order', async () => {
    const source = lines([
      'function duplicatedGlobal() return 1 end',
      'listenEdit("editDisplay", function(t, d)',
      '  return d',
      'end)',
      'function duplicatedGlobal() return 2 end',
      'function onOutput(triggerId)',
      '  return triggerId',
      'end',
    ]);
    const dryRun = await planFixture(source);

    const manifest = buildRisuLuaModuleTableExportManifest({
      sourceFile: 'legacy/original.risulua',
      refactorMap: dryRun.refactorMap,
      runtimeRoots: dryRun.runtimeRoots,
    });

    expect(manifest.version).toBe(1);
    expect(manifest.mode).toBe('module-table-export-manifest');
    expect(manifest.sourceFile).toBe('legacy/original.risulua');
    expect(manifest.hostVisibleGlobals.map((entry) => entry.name)).toEqual(['duplicatedGlobal', 'duplicatedGlobal']);
    expect(manifest.duplicateGroups).toEqual([
      expect.objectContaining({
        name: 'duplicatedGlobal',
        occurrences: [
          expect.objectContaining({ order: 0, line: 1 }),
          expect.objectContaining({ order: 1, line: 5 }),
        ],
        finalWinner: expect.objectContaining({ order: 1, line: 5 }),
      }),
    ]);
    expect(manifest.listenerRegistrations).toEqual([
      expect.objectContaining({ name: 'listenEdit', kind: 'listener-registration', line: 2 }),
    ]);

    const serialized = serializeRisuLuaModuleTableExportManifest(manifest);
    expect(JSON.parse(serialized)).toMatchObject({
      version: 1,
      mode: 'module-table-export-manifest',
    });
    expect(serialized.endsWith('\n')).toBe(true);
  });
});
