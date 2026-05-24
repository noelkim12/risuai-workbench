import { describe, expect, it } from 'vitest';
import { handleValidateCbsSyntax } from '../../src/tools/validate/validate-cbs-syntax';

describe('handleValidateCbsSyntax', () => {
  it('returns empty diagnostics for valid CBS text', async () => {
    const result = await handleValidateCbsSyntax({ sourceText: 'Hello, {{user}}!' });
    expect(result.data?.diagnostics).toEqual([]);
    expect(result.status).toBe('ok');
  });

  it('detects unknown tag CBS003', async () => {
    const result = await handleValidateCbsSyntax({ sourceText: '{{unknownTag::arg}}' });
    const codes = result.data?.diagnostics.map((d) => d.code) ?? [];
    expect(codes).toContain('CBS003');
  });

  it('detects deprecated #if as CBS100', async () => {
    const result = await handleValidateCbsSyntax({ sourceText: '{{#if::cond}}body{{/if}}' });
    const codes = result.data?.diagnostics.map((d) => d.code) ?? [];
    expect(codes).toContain('CBS100');
  });

  it('returns schema marker in envelope', async () => {
    const result = await handleValidateCbsSyntax({ sourceText: '{{user}}' });
    expect(result.schema).toBe('risuai-workbench-mcp.diagnostics');
  });
});
