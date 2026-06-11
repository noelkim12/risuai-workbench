import { describe, expect, it } from 'vitest';
import { createRisuRegexPreflight } from '../../../src/simulator/regex/preflight';

describe('createRisuRegexPreflight', () => {
  it('keeps worker execution required for disabled runtime entries', () => {
    const result = createRisuRegexPreflight({
      rawDocument: [
        '---',
        'comment: disabled runtime entry',
        'type: editdisplay',
        'ableFlag: false',
        '---',
        '@@@ IN',
        'foo',
        '@@@ OUT',
        'bar',
        '',
      ].join('\n'),
    });

    expect(result.status).toBe('ok');
    expect(result.executionRequired).toBe(true);
    expect(result.nativeExecution).toBe('webview-worker-required');
  });

  it('returns effective CBS-applied pattern and replacement without executing native regex', () => {
    const result = createRisuRegexPreflight({
      rawDocument: [
        '---',
        'comment: demo',
        'type: editprocess',
        'flag: g<cbs>',
        '---',
        '@@@ IN',
        '{{getvar::target}}:(.*)',
        '@@@ OUT',
        'Hello {{user}}, $1',
        '',
      ].join('\n'),
      context: {
        chatVariables: { target: 'name' },
        userLabel: 'Noel',
      },
    });

    expect(result.status).toBe('ok');
    expect(result.risks.map((risk) => risk.code)).toContain('REPEATED_WILDCARD');
    expect(result.pattern.raw).toBe('{{getvar::target}}:(.*)');
    expect(result.pattern.effective).toBe('name:(.*)');
    expect(result.replacement.raw).toBe('Hello {{user}}, $1');
    expect(result.replacement.effective).toBe('Hello Noel, $1');
    expect(result.executionRequired).toBe(true);
    expect(result.nativeExecution).toBe('webview-worker-required');
  });
});
