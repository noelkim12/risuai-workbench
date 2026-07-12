import { describe, expect, it } from 'vitest';
import { buildRequestUrl, parseConnectionString } from '../src/hmr/protocol';

describe('parseConnectionString', () => {
  it('parses a valid connection string', () => {
    expect(parseConnectionString('risu-hmr://127.0.0.1:41520#k=8f3a92aa')).toEqual({
      baseUrl: 'http://127.0.0.1:41520',
      token: '8f3a92aa',
      raw: 'risu-hmr://127.0.0.1:41520#k=8f3a92aa',
    });
  });

  it('trims whitespace and accepts localhost', () => {
    expect(parseConnectionString('  risu-hmr://localhost:41529#k=abc  ')?.baseUrl).toBe('http://127.0.0.1:41529');
  });

  it('rejects malformed input', () => {
    expect(parseConnectionString('http://127.0.0.1:41520')).toBeNull();
    expect(parseConnectionString('risu-hmr://10.0.0.5:41520#k=abc')).toBeNull();
    expect(parseConnectionString('risu-hmr://127.0.0.1:41520')).toBeNull();
  });
});

describe('buildRequestUrl', () => {
  it('appends path params and token', () => {
    const connection = parseConnectionString('risu-hmr://127.0.0.1:41520#k=tok');

    expect(connection).not.toBeNull();
    if (connection === null) {
      return;
    }

    expect(buildRequestUrl(connection, '/watch', { since: '3' })).toBe(
      'http://127.0.0.1:41520/watch?since=3&k=tok',
    );
    expect(buildRequestUrl(connection, '/health')).toBe('http://127.0.0.1:41520/health?k=tok');
  });
});
