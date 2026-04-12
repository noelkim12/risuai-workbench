import { describe, expect, it } from 'vitest';

import { CBSTokenizer, TokenType, type Position, type Token } from '../../../src/domain/cbs';

type TokenSnapshot = {
  type: string;
  value: string;
  raw: string;
};

type DiagnosticSnapshot = {
  code: string;
  message: string;
  range: {
    start: Position;
    end: Position;
  };
};

function snapshotTokens(tokens: Token[]): TokenSnapshot[] {
  return tokens.map((token) => ({
    type: TokenType[token.type],
    value: token.value,
    raw: token.raw,
  }));
}

function getDiagnostics(tokenizer: CBSTokenizer): DiagnosticSnapshot[] {
  const accessor = tokenizer as CBSTokenizer & {
    getDiagnostics?: () => DiagnosticSnapshot[];
  };

  expect(typeof accessor.getDiagnostics).toBe('function');

  return accessor.getDiagnostics ? accessor.getDiagnostics() : [];
}

describe('CBSTokenizer', () => {
  it('tokenizes plain text and appends EOF', () => {
    const tokenizer = new CBSTokenizer();

    const tokens = tokenizer.tokenize('hello');

    expect(snapshotTokens(tokens)).toEqual([
      { type: 'PlainText', value: 'hello', raw: 'hello' },
      { type: 'EOF', value: '', raw: '' },
    ]);
  });

  it('tokenizes a simple macro and normalizes function names', () => {
    const tokenizer = new CBSTokenizer();

    const tokens = tokenizer.tokenize('{{Get_Var}}');

    expect(snapshotTokens(tokens)).toEqual([
      { type: 'OpenBrace', value: '{{', raw: '{{' },
      { type: 'FunctionName', value: 'getvar', raw: 'Get_Var' },
      { type: 'CloseBrace', value: '}}', raw: '}}' },
      { type: 'EOF', value: '', raw: '' },
    ]);
  });

  it('splits double-colon arguments at depth zero', () => {
    const tokenizer = new CBSTokenizer();

    const tokens = tokenizer.tokenize('{{setvar::x::1}}');

    expect(snapshotTokens(tokens)).toEqual([
      { type: 'OpenBrace', value: '{{', raw: '{{' },
      { type: 'FunctionName', value: 'setvar', raw: 'setvar' },
      { type: 'ArgumentSeparator', value: '::', raw: '::' },
      { type: 'Argument', value: 'x', raw: 'x' },
      { type: 'ArgumentSeparator', value: '::', raw: '::' },
      { type: 'Argument', value: '1', raw: '1' },
      { type: 'CloseBrace', value: '}}', raw: '}}' },
      { type: 'EOF', value: '', raw: '' },
    ]);
  });

  it('falls back to legacy single-colon separators when the first separator is single colon', () => {
    const tokenizer = new CBSTokenizer();

    const tokens = tokenizer.tokenize('{{Set-Var:foo:bar}}');

    expect(snapshotTokens(tokens)).toEqual([
      { type: 'OpenBrace', value: '{{', raw: '{{' },
      { type: 'FunctionName', value: 'setvar', raw: 'Set-Var' },
      { type: 'ArgumentSeparator', value: ':', raw: ':' },
      { type: 'Argument', value: 'foo', raw: 'foo' },
      { type: 'ArgumentSeparator', value: ':', raw: ':' },
      { type: 'Argument', value: 'bar', raw: 'bar' },
      { type: 'CloseBrace', value: '}}', raw: '}}' },
      { type: 'EOF', value: '', raw: '' },
    ]);
  });

  it('tokenizes block start, else, and block end headers', () => {
    const tokenizer = new CBSTokenizer();

    const tokens = tokenizer.tokenize('{{#When::1}}body{{:else}}{{/When}}');

    expect(snapshotTokens(tokens)).toEqual([
      { type: 'OpenBrace', value: '{{', raw: '{{' },
      { type: 'BlockStart', value: '#when', raw: '#When' },
      { type: 'ArgumentSeparator', value: '::', raw: '::' },
      { type: 'Argument', value: '1', raw: '1' },
      { type: 'CloseBrace', value: '}}', raw: '}}' },
      { type: 'PlainText', value: 'body', raw: 'body' },
      { type: 'OpenBrace', value: '{{', raw: '{{' },
      { type: 'ElseKeyword', value: ':else', raw: ':else' },
      { type: 'CloseBrace', value: '}}', raw: '}}' },
      { type: 'OpenBrace', value: '{{', raw: '{{' },
      { type: 'BlockEnd', value: '/when', raw: '/When' },
      { type: 'CloseBrace', value: '}}', raw: '}}' },
      { type: 'EOF', value: '', raw: '' },
    ]);
  });

  it('keeps nested macro separators scoped to nested macros', () => {
    const tokenizer = new CBSTokenizer();

    const tokens = tokenizer.tokenize('{{random::{{setvar::x::1}}::done}}');

    expect(snapshotTokens(tokens)).toEqual([
      { type: 'OpenBrace', value: '{{', raw: '{{' },
      { type: 'FunctionName', value: 'random', raw: 'random' },
      { type: 'ArgumentSeparator', value: '::', raw: '::' },
      { type: 'OpenBrace', value: '{{', raw: '{{' },
      { type: 'FunctionName', value: 'setvar', raw: 'setvar' },
      { type: 'ArgumentSeparator', value: '::', raw: '::' },
      { type: 'Argument', value: 'x', raw: 'x' },
      { type: 'ArgumentSeparator', value: '::', raw: '::' },
      { type: 'Argument', value: '1', raw: '1' },
      { type: 'CloseBrace', value: '}}', raw: '}}' },
      { type: 'ArgumentSeparator', value: '::', raw: '::' },
      { type: 'Argument', value: 'done', raw: 'done' },
      { type: 'CloseBrace', value: '}}', raw: '}}' },
      { type: 'EOF', value: '', raw: '' },
    ]);
  });

  it('tokenizes angle-bracket macros in text mode', () => {
    const tokenizer = new CBSTokenizer();

    const tokens = tokenizer.tokenize('hello <user> <char> <bot> world');

    expect(snapshotTokens(tokens)).toEqual([
      { type: 'PlainText', value: 'hello ', raw: 'hello ' },
      { type: 'AngleBracketMacro', value: 'user', raw: '<user>' },
      { type: 'PlainText', value: ' ', raw: ' ' },
      { type: 'AngleBracketMacro', value: 'char', raw: '<char>' },
      { type: 'PlainText', value: ' ', raw: ' ' },
      { type: 'AngleBracketMacro', value: 'bot', raw: '<bot>' },
      { type: 'PlainText', value: ' world', raw: ' world' },
      { type: 'EOF', value: '', raw: '' },
    ]);
  });

  it('tokenizes comment macros as a single comment token', () => {
    const tokenizer = new CBSTokenizer();

    const tokens = tokenizer.tokenize('{{// 주석::ignored}}');

    expect(snapshotTokens(tokens)).toEqual([
      { type: 'OpenBrace', value: '{{', raw: '{{' },
      { type: 'Comment', value: '주석::ignored', raw: '// 주석::ignored' },
      { type: 'CloseBrace', value: '}}', raw: '}}' },
      { type: 'EOF', value: '', raw: '' },
    ]);
  });

  it('tokenizes math macros as a single math expression token', () => {
    const tokenizer = new CBSTokenizer();

    const tokens = tokenizer.tokenize('{{? 1 + 2::3}}');

    expect(snapshotTokens(tokens)).toEqual([
      { type: 'OpenBrace', value: '{{', raw: '{{' },
      { type: 'MathExpression', value: '1 + 2::3', raw: '? 1 + 2::3' },
      { type: 'CloseBrace', value: '}}', raw: '}}' },
      { type: 'EOF', value: '', raw: '' },
    ]);
  });

  it('exposes tokenizer diagnostics via a getter and resets them between runs', () => {
    const tokenizer = new CBSTokenizer();

    tokenizer.tokenize('plain text');
    expect(getDiagnostics(tokenizer)).toEqual([]);

    tokenizer.tokenize('prefix {{oops');
    expect(getDiagnostics(tokenizer)).toMatchObject([
      {
        code: 'CBS001',
      },
    ]);

    tokenizer.tokenize('clean again');
    expect(getDiagnostics(tokenizer)).toEqual([]);
  });

  describe('unclosed stray recovery', () => {
    it('treats stray closing braces as plain text', () => {
      const tokenizer = new CBSTokenizer();

      const tokens = tokenizer.tokenize('before }} after');

      expect(snapshotTokens(tokens)).toEqual([
        { type: 'PlainText', value: 'before }} after', raw: 'before }} after' },
        { type: 'EOF', value: '', raw: '' },
      ]);
      expect(getDiagnostics(tokenizer)).toEqual([]);
    });

    it('recovers unclosed top-level macros as literal text and records CBS001', () => {
      const tokenizer = new CBSTokenizer();

      const tokens = tokenizer.tokenize('before {{setvar::x');

      expect(snapshotTokens(tokens)).toEqual([
        { type: 'PlainText', value: 'before ', raw: 'before ' },
        { type: 'PlainText', value: '{{setvar::x', raw: '{{setvar::x' },
        { type: 'EOF', value: '', raw: '' },
      ]);
      expect(getDiagnostics(tokenizer)).toMatchObject([
        {
          code: 'CBS001',
          message: 'Unclosed CBS macro',
        },
      ]);
    });
  });

  it('places the EOF token at the final cursor position', () => {
    const tokenizer = new CBSTokenizer();

    const tokens = tokenizer.tokenize('a\n{{char}}');
    const eof = tokens[tokens.length - 1];

    expect(eof).toBeDefined();
    expect(eof).toMatchObject({
      type: TokenType.EOF,
      range: {
        start: { line: 1, character: 8 },
        end: { line: 1, character: 8 },
      },
    });
  });
});
