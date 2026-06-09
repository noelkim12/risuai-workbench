/**
 * Regex sample input helper tests.
 * @file packages/webview/tests/lib/components/editor/regex/regexSampleInput.test.ts
 */

import { describe, expect, it } from 'vitest';
import { generateRegexSampleInput } from '../../../../../src/lib/components/editor/regex/regexSampleInput';

describe('regexSampleInput', () => {
  it('derives the Crowd sample from an escaped literal and capture group', () => {
    expect(generateRegexSampleInput(String.raw`\[Crowd: (.*?)\]`)).toBe('[Crowd: list]');
  });

  it('derives the Chikan and Positioning sample from multiple capture groups', () => {
    expect(generateRegexSampleInput(String.raw`\[Chikan: (.*?) \| Positioning: (.*?)\]`)).toBe('[Chikan: name | Positioning: current]');
  });

  it('uses the nearest label for unknown captures', () => {
    expect(generateRegexSampleInput(String.raw`\[Mood: (.+?)\]`)).toBe('[Mood: mood]');
  });

  it('chooses a concrete branch for simple alternation and character classes', () => {
    expect(generateRegexSampleInput(String.raw`^(Hero|Villain)-[0-9]+$`)).toBe('Hero-1');
  });
});
