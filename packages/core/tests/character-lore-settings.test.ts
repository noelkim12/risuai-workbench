import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { phase8_extractCharacterFields } from '../src/cli/extract/character/phases/character-fields';
import { phase2_extractLorebooks } from '../src/cli/extract/character/phases/lorebooks';
import { buildCharxFromCanonical } from '../src/cli/pack/character/workflow';
import { buildHmrCharacterPayload } from '../src/node/hmr-build';
import { runAnalyzeCharxWorkflow } from '../src/cli/analyze/charx/workflow';
import {
  parseCharacterLoreSettings,
  readCharbookLoreSettings,
  toCharbookLoreSettings,
  type CharacterLoreSettings,
} from '../src/domain/lorebook/settings';

function makeWorkspace(settings: CharacterLoreSettings | null): string {
  const root = mkdtempSync(path.join(tmpdir(), 'risu-lore-settings-'));
  phase8_extractCharacterFields({ data: {
    name: 'Lore Settings',
    character_book: { ...toCharbookLoreSettings(settings), entries: [] },
  } }, root);
  return root;
}

function readMarker(root: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(root, '.risuchar'), 'utf8'));
}

describe('character lore settings', () => {
  it.each([
    { scanDepth: 0, tokenBudget: 0, recursiveScanning: false, fullWordMatching: false },
    { scanDepth: 100, tokenBudget: 100000, recursiveScanning: true, fullWordMatching: true },
    { scanDepth: -1.5, tokenBudget: -2.5, recursiveScanning: false, fullWordMatching: true },
  ])('preserves numeric values without range constraints: %j', (settings) => {
    const root = makeWorkspace(settings);

    const packed = buildCharxFromCanonical(root, null, 'none');

    expect(readMarker(root).loreSettings).toEqual(settings);
    expect(readCharbookLoreSettings(packed.data.character_book)).toEqual(settings);
  });

  it.each([null, undefined])('uses global settings when marker settings are %s', (settings) => {
    const root = makeWorkspace(null);
    const marker = readMarker(root);
    marker.loreSettings = settings;
    writeFileSync(path.join(root, '.risuchar'), JSON.stringify(marker));

    const packed = buildCharxFromCanonical(root, null, 'none');

    expect(readCharbookLoreSettings(packed.data.character_book)).toBeNull();
    expect(packed.data.character_book).not.toHaveProperty('scan_depth');
    expect(packed.data.character_book).not.toHaveProperty('token_budget');
    expect(packed.data.character_book).not.toHaveProperty('recursive_scanning');
  });

  it('packs settings into the actual card archive even without lorebook entries', () => {
    const settings = { scanDepth: 42, tokenBudget: 9000, recursiveScanning: true, fullWordMatching: true };
    const root = makeWorkspace(settings);
    const outPath = path.join(root, 'packed.charx');

    const result = spawnSync('node', [path.join(process.cwd(), 'dist/cli/main.js'),
      'pack', '--in', root, '--format', 'charx', '--out', outPath], { encoding: 'utf8' });

    expect(result.status, result.stderr + result.stdout).toBe(0);
    const archive = unzipSync(readFileSync(outPath));
    const card = JSON.parse(strFromU8(archive['card.json']));
    expect(card.data.character_book.entries).toEqual([]);
    expect(readCharbookLoreSettings(card.data.character_book)).toEqual(settings);
    const extracted = mkdtempSync(path.join(tmpdir(), 'risu-lore-settings-roundtrip-'));
    phase8_extractCharacterFields(card, extracted);
    expect(readMarker(extracted).loreSettings).toEqual(settings);
  });

  it('sends an explicit global reset through the serialized HMR payload', () => {
    const root = makeWorkspace(null);

    const payload = JSON.parse(JSON.stringify(buildHmrCharacterPayload(root)));

    expect(payload.data).toHaveProperty('loreSettings', null);
  });

  it.each([true, false])('uses recursive scanning %s in canonical workspace analysis', (recursiveScanning) => {
    const root = makeWorkspace({ scanDepth: 5, tokenBudget: 800, recursiveScanning, fullWordMatching: false });

    const status = runAnalyzeCharxWorkflow([root, '--no-html', '--locale', 'en']);

    expect(status).toBe(0);
    const report = readFileSync(path.join(root, 'analysis', 'charx-analysis.md'), 'utf8');
    expect(report).toMatch(new RegExp(`\\| Recursive scanning \\| ${recursiveScanning} \\|`));
  });

  it('preserves lorebook entries when changing custom settings back to global mode', () => {
    const root = makeWorkspace({ scanDepth: 5, tokenBudget: 800, recursiveScanning: true, fullWordMatching: true });
    phase2_extractLorebooks({ data: { character_book: { entries: [{
      keys: ['castle'], content: 'Castle lore', name: 'Castle', comment: 'Castle', enabled: true,
      insertion_order: 0, extensions: {},
    }] } } }, root);
    const marker = readMarker(root);
    marker.loreSettings = null;
    writeFileSync(path.join(root, '.risuchar'), JSON.stringify(marker));

    const packed = buildCharxFromCanonical(root, null, 'none');

    expect(readCharbookLoreSettings(packed.data.character_book)).toBeNull();
    expect(packed.data.character_book.entries).toHaveLength(1);
    expect(packed.data.character_book.entries[0].content).toBe('Castle lore');
  });

  it('sends all custom settings through the HMR payload', () => {
    const settings = { scanDepth: 0, tokenBudget: 12000, recursiveScanning: false, fullWordMatching: true };
    const root = makeWorkspace(settings);

    const payload = buildHmrCharacterPayload(root);

    expect(payload.data.loreSettings).toEqual(settings);
  });

  it('uses global mode for incomplete upstream settings', () => {
    const book = { scan_depth: 10, recursive_scanning: true };

    const settings = readCharbookLoreSettings(book);

    expect(settings).toBeNull();
  });

  it('defaults missing upstream full-word matching to false', () => {
    const book = { scan_depth: 0, token_budget: 0, recursive_scanning: false };

    const settings = readCharbookLoreSettings(book);

    expect(settings?.fullWordMatching).toBe(false);
  });

  it('rejects incomplete custom marker settings instead of silently dropping them', () => {
    const settings = { scanDepth: 5, tokenBudget: 800 };

    expect(() => parseCharacterLoreSettings(settings)).toThrow();
  });
});
