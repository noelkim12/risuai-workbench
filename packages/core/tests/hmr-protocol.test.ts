import { describe, expect, it } from 'vitest';

import {
  HMR_ASSET_PLACEHOLDER_PREFIX,
  HMR_PORT_RANGE,
  HMR_PROTOCOL_VERSION,
  buildHmrConnectionString,
  hmrAssetPlaceholder,
} from '../src/domain/hmr/protocol';

describe('hmr protocol', () => {
  it('builds connection string in risu-hmr scheme', () => {
    expect(buildHmrConnectionString(41520, 'abc123')).toBe('risu-hmr://127.0.0.1:41520#k=abc123');
  });

  it('builds asset placeholder with fixed prefix', () => {
    expect(hmrAssetPlaceholder('deadbeef')).toBe('hmr-asset://deadbeef');
    expect(HMR_ASSET_PLACEHOLDER_PREFIX).toBe('hmr-asset://');
  });

  it('exposes protocol constants', () => {
    expect(HMR_PROTOCOL_VERSION).toBe(2);
    expect(HMR_PORT_RANGE).toEqual({ start: 41520, end: 41529 });
  });
});
