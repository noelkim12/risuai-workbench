import { describe, expect, it } from 'vitest';
import { simulateCbsText } from '../../../src/domain/cbs';

describe('CBS simulator chat history context', () => {
  it('preserves chat history macros when chatHistory is not explicitly injected', () => {
    const result = simulateCbsText('{{lastmessageid}}|{{previous_chat_log::0}}');

    expect(result.status).toBe('partial');
    expect(result.output).toBe('{{lastmessageid}}|{{previous_chat_log::0}}');
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'simulator', severity: 'warning', message: expect.stringContaining('lastmessageid') }),
        expect.objectContaining({ source: 'simulator', severity: 'warning', message: expect.stringContaining('previouschatlog') }),
      ]),
    );
  });

  it('keeps upstream parity for lastmessageid as the final zero-based index', () => {
    const result = simulateCbsText('{{lastmessageid}}', {
      chatHistory: ['hello', 'world'],
    });

    expect(result.status).toBe('ok');
    expect(result.output).toBe('1');
    expect(result.diagnostics).toEqual([]);
  });

  it('resolves previous_chat_log as an absolute zero-based history lookup', () => {
    const result = simulateCbsText('{{previous_chat_log::0}}|{{previouschatlog::1}}|{{previous_chat_log::9}}', {
      chatHistory: ['hello', 'world'],
    });

    expect(result.status).toBe('ok');
    expect(result.output).toBe('hello|world|Out of range');
    expect(result.diagnostics).toEqual([]);
  });

  it('keeps numeric #each iterator text as one item before range compatibility is introduced', () => {
    const result = simulateCbsText('{{#each {{? {{lastmessageid}}}} item}}[{{slot::item}}]{{/each}}', {
      chatHistory: ['hello', 'world', 'again'],
    });

    expect(result.status).toBe('ok');
    expect(result.output).toBe('[2]');
    expect(result.diagnostics).toEqual([]);
  });
});
