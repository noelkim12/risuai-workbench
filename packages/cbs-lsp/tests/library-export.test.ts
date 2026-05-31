import { describe, expect, it } from 'vitest';

describe('diagnostics library export', () => {
  it('exports DiagnosticsEngine from the analyzer/diagnostics subpath', async () => {
    const { DiagnosticsEngine } = await import('cbs-language-server/analyzer/diagnostics');
    expect(DiagnosticsEngine).toBeDefined();
    expect(typeof DiagnosticsEngine).toBe('function');
  });

  it('exports createDiagnosticInfo and DiagnosticCode from the subpath', async () => {
    const { createDiagnosticInfo, DiagnosticCode } = await import('cbs-language-server/analyzer/diagnostics');
    expect(createDiagnosticInfo).toBeDefined();
    expect(DiagnosticCode).toBeDefined();
    expect(DiagnosticCode.UnknownFunction).toBe('CBS003');
  });
});
