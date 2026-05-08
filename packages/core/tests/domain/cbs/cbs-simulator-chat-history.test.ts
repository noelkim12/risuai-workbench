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

  it('reads content from role-bearing chat history entries', () => {
    const result = simulateCbsText('{{lastmessageid}}|{{previous_chat_log::0}}|{{previouschatlog::1}}', {
      chatHistory: [
        { role: 'user', content: 'hello' },
        { role: 'char', content: 'world' },
      ],
    });

    expect(result.status).toBe('ok');
    expect(result.output).toBe('1|hello|world');
    expect(result.diagnostics).toEqual([]);
  });

  it('does not mutate caller-provided chat history entries', () => {
    const context = {
      chatHistory: [
        { role: 'user', content: 'hello', id: 'u1', createdAt: '2026-05-08T00:00:00.000Z' },
        { role: 'char', content: 'world', id: 'c1', createdAt: '2026-05-08T00:00:05.000Z' },
      ],
    } as const;
    const before = JSON.stringify(context);

    const result = simulateCbsText('{{previous_chat_log::1}}', context);

    expect(result.output).toBe('world');
    expect(JSON.stringify(context)).toBe(before);
  });

  it('resolves previouscharchat by searching backward from the explicit cursor', () => {
    const result = simulateCbsText('{{previouscharchat}}', {
      chatHistory: [
        { role: 'user', content: 'first user' },
        { role: 'char', content: 'first char' },
        { role: 'user', content: 'second user' },
      ],
      chatHistoryCursor: 2,
    });

    expect(result.status).toBe('ok');
    expect(result.output).toBe('first char');
    expect(result.diagnostics).toEqual([]);
  });

  it('resolves previoususerchat by searching backward from the explicit cursor', () => {
    const result = simulateCbsText('{{previoususerchat}}', {
      chatHistory: [
        { role: 'user', content: 'first user' },
        { role: 'char', content: 'first char' },
        { role: 'user', content: 'second user' },
      ],
      chatHistoryCursor: 2,
    });

    expect(result.status).toBe('ok');
    expect(result.output).toBe('first user');
    expect(result.diagnostics).toEqual([]);
  });

  it('preserves previoususerchat when chatHistoryCursor is absent to match upstream no-chatID behavior safely', () => {
    const result = simulateCbsText('{{previoususerchat}}', {
      chatHistory: [{ role: 'user', content: 'first user' }],
    });

    expect(result.status).toBe('partial');
    expect(result.output).toBe('{{previoususerchat}}');
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'simulator', severity: 'warning', message: expect.stringContaining('previoususerchat') }),
      ]),
    );
  });

  it('resolves idle_duration from the final chat history timestamp and deterministic clock', () => {
    const result = simulateCbsText('{{idle_duration}}', {
      chatHistory: [{ role: 'user', content: 'hello', createdAt: '2026-05-08T00:00:00.000Z' }],
      providers: {
        clock: () => new Date('2026-05-08T01:02:03.000Z'),
      },
    });

    expect(result.status).toBe('ok');
    expect(result.output).toBe('1:02:03');
    expect(result.diagnostics).toEqual([]);
  });

  it('resolves message_idle_duration between the latest two user messages at the cursor', () => {
    const result = simulateCbsText('{{message_idle_duration}}', {
      chatHistory: [
        { role: 'user', content: 'first', createdAt: '2026-05-08T00:00:00.000Z' },
        { role: 'char', content: 'reply', createdAt: '2026-05-08T00:00:10.000Z' },
        { role: 'user', content: 'second', createdAt: '2026-05-08T00:02:05.000Z' },
      ],
      chatHistoryCursor: 2,
    });

    expect(result.status).toBe('ok');
    expect(result.output).toBe('0:02:05');
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
