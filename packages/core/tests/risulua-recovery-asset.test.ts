import { Buffer } from 'node:buffer';

import { describe, expect, it } from 'vitest';

import {
  RISULUA_RECOVERY_ASSET_CHARX_METADATA,
  RISULUA_RECOVERY_ASSET_FILENAME,
  RISULUA_RECOVERY_ASSET_RISUM_TUPLE,
  RISULUA_RECOVERY_ASSET_TYPE,
  filterRisuLuaRecoveryAssetPairs,
  findFirstRisuLuaRecoveryCharxAssetIndex,
  findFirstRisuLuaRecoveryRisumAssetIndex,
  isRisuLuaRecoveryCharxAssetMetadata,
  isRisuLuaRecoveryRisumAssetTuple,
} from '../src/cli/shared/lua-bundler/risulua-recovery-asset';

describe('RisuLua recovery asset identity', () => {
  it('defines the normalized CharX and RISUM descriptors', () => {
    expect(RISULUA_RECOVERY_ASSET_TYPE).toBe('x-risu-recovery');
    expect(RISULUA_RECOVERY_ASSET_FILENAME).toBe('risulua-full-source-v1.rpack');
    expect(RISULUA_RECOVERY_ASSET_CHARX_METADATA).toEqual({
      type: 'x-risu-recovery',
      name: 'risulua-full-source-v1',
      ext: 'rpack',
    });
    expect(RISULUA_RECOVERY_ASSET_RISUM_TUPLE).toEqual([
      'risulua-full-source-v1.rpack',
      null,
      'x-risu-recovery',
    ]);
  });

  it('matches CharX metadata by type and normalized name plus extension only', () => {
    expect(
      isRisuLuaRecoveryCharxAssetMetadata({
        type: 'x-risu-recovery',
        name: 'risulua-full-source-v1',
        ext: 'rpack',
        uri: 'embeded://assets/x-risu-recovery/rpack/collision_2.rpack',
      }),
    ).toBe(true);

    for (const malformed of [
      null,
      [],
      { type: 'x-risu-recovery', name: 'risulua-full-source-v1' },
      { type: 'x-risu-recovery', name: 'risulua-full-source-v1.rpack', ext: 'rpack' },
      { type: 'x-risu-asset', name: 'risulua-full-source-v1', ext: 'rpack' },
      { type: 'x-risu-recovery', name: 'other', ext: 'rpack' },
      { type: 'x-risu-recovery', name: 'risulua-full-source-v1', ext: 'bin' },
    ]) {
      expect(isRisuLuaRecoveryCharxAssetMetadata(malformed)).toBe(false);
    }
  });

  it('matches RISUM tuples by filename and type while ignoring URI identity', () => {
    expect(isRisuLuaRecoveryRisumAssetTuple(['risulua-full-source-v1.rpack', 'asset://stale/path', 'x-risu-recovery'])).toBe(
      true,
    );
    expect(isRisuLuaRecoveryRisumAssetTuple(['risulua-full-source-v1.rpack', null, 'x-risu-recovery'])).toBe(true);

    for (const malformed of [
      null,
      [],
      ['risulua-full-source-v1.rpack', 'x-risu-recovery'],
      ['risulua-full-source-v1.rpack', 'uri', 'x-risu-recovery', 'extra'],
      [null, 'uri', 'x-risu-recovery'],
      ['risulua-full-source-v1.rpack', 1, 'x-risu-recovery'],
      ['risulua-full-source-v1.rpack', 'uri', 'x-risu-asset'],
      ['other.rpack', 'uri', 'x-risu-recovery'],
    ]) {
      expect(isRisuLuaRecoveryRisumAssetTuple(malformed)).toBe(false);
    }
  });
});

describe('RisuLua recovery asset selection and filtering', () => {
  it('returns null when no CharX or RISUM recovery descriptor exists', () => {
    const charxAssets = [
      { type: 'x-risu-asset', name: 'normal', ext: 'bin' },
      { type: 'x-risu-recovery', name: 'wrong', ext: 'rpack' },
    ];
    const risumAssets = [
      ['normal.bin', 'embeded://assets/normal.bin', 'x-risu-asset'],
      ['risulua-full-source-v1.rpack', 'embeded://assets/recovery.rpack', 'x-risu-asset'],
    ];

    expect(findFirstRisuLuaRecoveryCharxAssetIndex(charxAssets)).toBeNull();
    expect(findFirstRisuLuaRecoveryRisumAssetIndex(risumAssets)).toBeNull();
  });

  it('returns the first matching index in normal/recovery/normal/recovery order', () => {
    const charxAssets = [
      { type: 'x-risu-asset', name: 'first', ext: 'bin' },
      { type: 'x-risu-recovery', name: 'risulua-full-source-v1', ext: 'rpack' },
      { type: 'x-risu-asset', name: 'second', ext: 'bin' },
      { type: 'x-risu-recovery', name: 'risulua-full-source-v1', ext: 'rpack' },
    ];
    const risumAssets = [
      ['first.bin', 'uri://first', 'x-risu-asset'],
      ['risulua-full-source-v1.rpack', 'uri://first-recovery', 'x-risu-recovery'],
      ['second.bin', 'uri://second', 'x-risu-asset'],
      ['risulua-full-source-v1.rpack', 'uri://second-recovery', 'x-risu-recovery'],
    ];

    expect(findFirstRisuLuaRecoveryCharxAssetIndex(charxAssets)).toBe(1);
    expect(findFirstRisuLuaRecoveryRisumAssetIndex(risumAssets)).toBe(1);
  });

  it('filters all recovery pairs without mutating descriptors or drifting associated buffers', () => {
    const firstNormal = { type: 'x-risu-asset', name: 'first', ext: 'bin' };
    const firstRecovery = { type: 'x-risu-recovery', name: 'risulua-full-source-v1', ext: 'rpack' };
    const secondNormal = { type: 'x-risu-asset', name: 'second', ext: 'bin' };
    const secondRecovery = { type: 'x-risu-recovery', name: 'risulua-full-source-v1', ext: 'rpack' };
    const metadata = [firstNormal, firstRecovery, secondNormal, secondRecovery];
    const firstBuffer = Buffer.from('first');
    const firstRecoveryBuffer = Buffer.from('first-recovery');
    const secondBuffer = Buffer.from('second');
    const secondRecoveryBuffer = Buffer.from('second-recovery');
    const buffers = [firstBuffer, firstRecoveryBuffer, secondBuffer, secondRecoveryBuffer];

    const filtered = filterRisuLuaRecoveryAssetPairs(metadata, buffers, isRisuLuaRecoveryCharxAssetMetadata);

    expect(filtered.status).toBe('matched');
    expect(filtered.firstMatchIndex).toBe(1);
    expect(filtered.firstMatchBufferStatus).toBe('present');
    expect(filtered.metadata).toEqual([firstNormal, secondNormal]);
    expect(filtered.buffers).toEqual([firstBuffer, secondBuffer]);
    expect(filtered.metadata).not.toBe(metadata);
    expect(filtered.buffers).not.toBe(buffers);
    expect(filtered.buffers[0]).toBe(firstBuffer);
    expect(filtered.buffers[1]).toBe(secondBuffer);
    expect(filtered.removedPairs.map((pair) => pair.index)).toEqual([1, 3]);
    expect(filtered.removedPairs.map((pair) => pair.buffer)).toEqual([firstRecoveryBuffer, secondRecoveryBuffer]);
  });

  it('distinguishes no match from a matching descriptor with a missing or null buffer', () => {
    const normal = { type: 'x-risu-asset', name: 'normal', ext: 'bin' };
    const recovery = { type: 'x-risu-recovery', name: 'risulua-full-source-v1', ext: 'rpack' };
    const noMatch = filterRisuLuaRecoveryAssetPairs([normal], [null], isRisuLuaRecoveryCharxAssetMetadata);
    const missingBuffer = filterRisuLuaRecoveryAssetPairs([normal, recovery], [Buffer.from('normal')], isRisuLuaRecoveryCharxAssetMetadata);
    const nullBuffer = filterRisuLuaRecoveryAssetPairs([recovery], [null], isRisuLuaRecoveryCharxAssetMetadata);

    expect(noMatch.status).toBe('no-match');
    expect(noMatch.firstMatchIndex).toBeNull();
    expect(noMatch.firstMatchBufferStatus).toBe('not-applicable');
    expect(missingBuffer.status).toBe('matched-missing-buffer');
    expect(missingBuffer.firstMatchIndex).toBe(1);
    expect(missingBuffer.firstMatchBufferStatus).toBe('missing');
    expect(nullBuffer.status).toBe('matched-missing-buffer');
    expect(nullBuffer.firstMatchIndex).toBe(0);
    expect(nullBuffer.firstMatchBufferStatus).toBe('missing');
  });

  it('preserves stable non-recovery RISUM tuple and buffer alignment', () => {
    const firstTuple = ['first.bin', 'uri://first', 'x-risu-asset'];
    const recoveryTuple = ['risulua-full-source-v1.rpack', 'uri://recovery', 'x-risu-recovery'];
    const secondTuple = ['second.bin', 'uri://second', 'x-risu-asset'];
    const firstBuffer = Buffer.from('first');
    const recoveryBuffer = Buffer.from('recovery');
    const secondBuffer = Buffer.from('second');

    const filtered = filterRisuLuaRecoveryAssetPairs(
      [firstTuple, recoveryTuple, secondTuple],
      [firstBuffer, recoveryBuffer, secondBuffer],
      isRisuLuaRecoveryRisumAssetTuple,
    );

    expect(filtered.status).toBe('matched');
    expect(filtered.metadata).toEqual([firstTuple, secondTuple]);
    expect(filtered.buffers).toEqual([firstBuffer, secondBuffer]);
    expect(filtered.buffers[0]).toBe(firstBuffer);
    expect(filtered.buffers[1]).toBe(secondBuffer);
    expect(filtered.removedPairs).toEqual([
      {
        index: 1,
        metadata: recoveryTuple,
        buffer: recoveryBuffer,
        bufferStatus: 'present',
      },
    ]);
  });
});
