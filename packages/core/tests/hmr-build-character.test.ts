import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { buildHmrCharacterPayload } from '../src/node/hmr-build';
import { sha256Hex } from '../src/node/hmr-asset-hash';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function writeRisuchar(root: string, image: string | null): void {
  writeFileSync(
    path.join(root, '.risuchar'),
    `${JSON.stringify({
      kind: 'risu.character',
      schemaVersion: 1,
      id: 'hmr-character-id',
      name: 'HMR Character',
      creator: 'noel',
      characterVersion: '1.0',
      createdAt: '2026-07-09T00:00:00.000Z',
      modifiedAt: '2026-07-09T00:00:00.000Z',
      sourceFormat: 'charx',
      image,
      flags: { utilityBot: false, lowLevelAccess: false },
    })}\n`,
    'utf-8',
  );
}

function makeCharacterRoot(): { root: string; iconBytes: Buffer; emotionBytes: Buffer } {
  const root = mkdtempSync(path.join(os.tmpdir(), 'risu-core-hmr-char-'));
  tempDirs.push(root);
  const iconBytes = Buffer.from('fake-png-icon');
  const emotionBytes = Buffer.from('fake-webp-emotion');
  writeRisuchar(root, 'assets/icons/main.png');
  mkdirSync(path.join(root, 'assets', 'icons'), { recursive: true });
  mkdirSync(path.join(root, 'assets', 'emotions'), { recursive: true });
  writeFileSync(path.join(root, 'assets', 'icons', 'main.png'), iconBytes);
  writeFileSync(path.join(root, 'assets', 'emotions', 'joy.webp'), emotionBytes);
  writeFileSync(
    path.join(root, 'assets', 'manifest.json'),
    JSON.stringify({
      assets: [
        {
          index: 1,
          original_uri: 'embeded://assets/icons/main.png',
          extracted_path: 'icons/main.png',
          status: 'extracted',
          type: 'icon',
          name: 'main',
          ext: 'png',
          subdir: 'icons',
          size_bytes: iconBytes.byteLength,
        },
        {
          index: 3,
          original_uri: 'embeded://assets/emotion/image/joy.webp',
          extracted_path: 'emotions/joy.webp',
          status: 'extracted',
          type: 'emotion',
          name: 'joy',
          ext: 'webp',
          subdir: 'emotions',
          size_bytes: emotionBytes.byteLength,
        },
      ],
    }),
  );
  return { root, iconBytes, emotionBytes };
}

describe('buildHmrCharacterPayload', () => {
  it('builds definition with sparse-index placeholders, manifest entries, and byte sources', () => {
    const { root, iconBytes, emotionBytes } = makeCharacterRoot();
    const result = buildHmrCharacterPayload(root);
    const iconHash = sha256Hex(iconBytes);
    const emotionHash = sha256Hex(emotionBytes);

    expect(result.kind).toBe('character');
    expect(result.data.name).toBe('HMR Character');
    expect(result.data.image).toBe(`hmr-asset://${iconHash}`);
    expect(result.data.emotionImages).toEqual([['joy', `hmr-asset://${emotionHash}`]]);
    expect(result.data).not.toHaveProperty('chats');
    expect(result.data).not.toHaveProperty('chaId');
    expect(result.assets).toEqual([
      { hash: iconHash, ext: 'png', role: 'icon:main', size: iconBytes.byteLength },
      { hash: emotionHash, ext: 'webp', role: 'emotion:joy', size: emotionBytes.byteLength },
    ]);
    expect(result.assetSources.get(iconHash)).toEqual({
      kind: 'file',
      path: path.join(root, 'assets', 'icons', 'main.png'),
    });
    expect(existsSync(path.join(root, 'lua', 'dist'))).toBe(false);
  });

  it('ignores manifest asset paths that resolve outside the assets directory', () => {
    const { root, iconBytes, emotionBytes } = makeCharacterRoot();
    const secretBytes = Buffer.from('hmr-secret-outside-assets');
    writeFileSync(path.join(root, 'secret.txt'), secretBytes);
    writeFileSync(
      path.join(root, 'assets', 'manifest.json'),
      JSON.stringify({
        assets: [
          {
            index: 1,
            original_uri: 'embeded://assets/icons/main.png',
            extracted_path: 'icons/main.png',
            status: 'extracted',
            type: 'icon',
            name: 'main',
            ext: 'png',
            subdir: 'icons',
            size_bytes: iconBytes.byteLength,
          },
          {
            index: 3,
            original_uri: 'embeded://assets/emotion/image/joy.webp',
            extracted_path: 'emotions/joy.webp',
            status: 'extracted',
            type: 'emotion',
            name: 'joy',
            ext: 'webp',
            subdir: 'emotions',
            size_bytes: emotionBytes.byteLength,
          },
          {
            index: 5,
            original_uri: 'embeded://assets/other/text/secret.txt',
            extracted_path: '../secret.txt',
            status: 'extracted',
            type: 'asset',
            name: 'secret',
            ext: 'txt',
            subdir: 'other',
            size_bytes: secretBytes.byteLength,
          },
        ],
      }),
    );

    const result = buildHmrCharacterPayload(root);
    const iconHash = sha256Hex(iconBytes);
    const secretHash = sha256Hex(secretBytes);

    expect(result.data.image).toBe(`hmr-asset://${iconHash}`);
    expect(JSON.stringify(result.data)).not.toContain(`hmr-asset://${secretHash}`);
    expect(result.assets.map((asset) => asset.hash)).not.toContain(secretHash);
    expect(result.assetSources.has(secretHash)).toBe(false);
  });

  it('builds an empty-asset payload for a root without assets dir', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'risu-core-hmr-empty-'));
    tempDirs.push(root);
    writeRisuchar(root, null);

    const result = buildHmrCharacterPayload(root);

    expect(result.assets).toEqual([]);
    expect(result.data).not.toHaveProperty('image');
    expect(result.data.name).toBe('HMR Character');
  });

  it('bundles modular lua without writing dist files', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'risu-core-hmr-char-lua-'));
    tempDirs.push(root);
    writeRisuchar(root, null);
    mkdirSync(path.join(root, 'lua', 'common'), { recursive: true });
    writeFileSync(
      path.join(root, 'lua', 'main.risulua'),
      'local helper = require("common.helper")\nfunction onStart() return helper.ok end\n',
    );
    writeFileSync(path.join(root, 'lua', 'common', 'helper.risulua'), 'return { ok = true }\n');

    const result = buildHmrCharacterPayload(root);

    expect(JSON.stringify(result.data.triggerscript)).toContain('local helper = __risulua_loaders');
    expect(existsSync(path.join(root, 'dist'))).toBe(false);
  });
});
