import { describe, expect, it } from 'vitest';
import {
  assetExtension,
  classifyDroppedFile,
  fileToBase64,
  isSupportedAssetFile,
  mimeForAssetExtension,
  parseNameWithRules,
  stripAssetExtension,
  validateEditedAssetFilename,
  validateStagedTargetPaths,
} from '../../../src/lib/asset-manager/staging';
import type { AssetManagerAssetEntry } from '../../../src/lib/types/assetManager';

function entry(path: string, fileStem: string): AssetManagerAssetEntry {
  return {
    path,
    subdir: 'additional',
    ext: assetExtension(path),
    sizeBytes: 1,
    mtimeMs: 0,
    fileStem,
    assignment: null,
    generatedName: null,
    flags: { unassigned: true, duplicate: false },
  };
}

describe('staging file helpers', () => {
  it('strips known asset extensions and detects support', () => {
    expect(stripAssetExtension('rin_happy.png')).toBe('rin_happy');
    expect(stripAssetExtension('rin_happy.png.png')).toBe('rin_happy');
    expect(isSupportedAssetFile('rin_happy.webp')).toBe(true);
    expect(isSupportedAssetFile('notes.txt')).toBe(false);
    expect(mimeForAssetExtension('png')).toBe('image/png');
    expect(mimeForAssetExtension('mp3')).toBe('audio/mpeg');
  });

  it('encodes files to base64 with File.arrayBuffer', async () => {
    const file = new File(['hello'], 'hello.txt');

    await expect(fileToBase64(file)).resolves.toBe('aGVsbG8=');
  });
});

describe('classifyDroppedFile', () => {
  const entries = [entry('additional/rin_happy.png', 'rin_happy'), entry('emotions/mel_sad.webp', 'mel_sad')];

  it('classifies unknown basenames as add under additional/', () => {
    expect(classifyDroppedFile('luna_smile.png', entries)).toEqual({ kind: 'add', targetPath: 'additional/luna_smile.png' });
  });

  it('classifies same basename + same extension as in-place replace', () => {
    const result = classifyDroppedFile('rin_happy.png', entries);
    expect(result.kind).toBe('replace');
    expect(result.targetPath).toBe('additional/rin_happy.png');
    expect(result.deletePath).toBeUndefined();
    expect(result.extChange).toBeUndefined();
  });

  it('classifies same basename + different extension as replace with delete + ext change', () => {
    const result = classifyDroppedFile('mel_sad.png', entries);
    expect(result.kind).toBe('replace');
    expect(result.targetPath).toBe('emotions/mel_sad.png');
    expect(result.deletePath).toBe('emotions/mel_sad.webp');
    expect(result.extChange).toEqual({ from: 'webp', to: 'png' });
  });
});

describe('parseNameWithRules', () => {
  const twoSlot = { separator: '_', slotTokenCounts: { s1: 1 } };

  it('parses clean names with configured counts', () => {
    expect(parseNameWithRules('rin_excited', twoSlot, ['s1', 's2'])).toEqual({ s1: 'rin', s2: 'excited' });
  });

  it('applies group overrides by first token', () => {
    const config = { separator: '_', slotTokenCounts: { s1: 1 }, groupOverrides: [{ firstToken: 'mel', slotTokenCounts: { s1: 2 } }] };
    expect(parseNameWithRules('mel_flower_smile', config, ['s1', 's2'])).toEqual({ s1: 'mel_flower', s2: 'smile' });
  });

  it('returns single-token names as s1 only', () => {
    expect(parseNameWithRules('solo', twoSlot, ['s1', 's2'])).toEqual({ s1: 'solo' });
  });

  it('returns null when non-last counts cannot be satisfied', () => {
    const config = { separator: '_', slotTokenCounts: { s1: 2, s2: 1 } };
    expect(parseNameWithRules('mel_smile', config, ['s1', 's2', 's3'])).toBeNull();
  });

  it('joins multi-token last slots with the separator', () => {
    expect(parseNameWithRules('rin_very_happy', twoSlot, ['s1', 's2'])).toEqual({ s1: 'rin', s2: 'very_happy' });
  });
});

describe('validateEditedAssetFilename', () => {
  it('accepts safe supported filenames', () => {
    expect(validateEditedAssetFilename('rin_happy.png')).toEqual({ valid: true });
  });

  it('rejects unsupported, unsafe, dot segment, and reserved filenames', () => {
    expect(validateEditedAssetFilename('rin_happy.txt')).toEqual({ valid: false, reason: 'unsupported-extension' });
    expect(validateEditedAssetFilename('folder/rin_happy.png')).toEqual({ valid: false, reason: 'unsafe-path' });
    expect(validateEditedAssetFilename('..')).toEqual({ valid: false, reason: 'dot-segment' });
    expect(validateEditedAssetFilename('asset-catalog.json')).toEqual({ valid: false, reason: 'reserved-basename' });
  });
});

describe('validateStagedTargetPaths', () => {
  it('rejects duplicate target paths after classification', () => {
    expect(validateStagedTargetPaths([{ kind: 'add', targetPath: 'additional/rin.png' }, { kind: 'add', targetPath: 'additional/rin.png' }])).toEqual({
      valid: false,
      duplicatePaths: ['additional/rin.png'],
    });
  });
});
