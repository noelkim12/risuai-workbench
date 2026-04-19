import { type Position, type Range, Token, TokenType } from './tokens';

type SeparatorMode = 'header' | 'double' | 'single';

/** 토크나이저 단계에서 복구 가능한 CBS 진단 정보 */
export interface TokenizerDiagnostic {
  code: string;
  message: string;
  range: Range;
}

export class CBSTokenizer {
  private input: string = '';
  private pos: number = 0;
  private line: number = 0;
  private character: number = 0;
  private tokens: Token[] = [];
  private diagnostics: TokenizerDiagnostic[] = [];

  tokenize(input: string): Token[] {
    this.input = input;
    this.pos = 0;
    this.line = 0;
    this.character = 0;
    this.tokens = [];
    this.diagnostics = [];

    let textBuffer = '';
    let textStart: Position | null = null;

    while (!this.isEOF()) {
      if (this.isMacroStart()) {
        this.flushPlainText(textBuffer, textStart);
        textBuffer = '';
        textStart = null;

        const macroStartIndex = this.pos;
        const macroStart = this.currentPos();
        const macroTokens = this.readMacro();

        if (macroTokens === null) {
          const raw = this.input.slice(macroStartIndex, this.pos);
          this.tokens.push(
            this.createToken(TokenType.PlainText, raw, raw, macroStart, this.currentPos()),
          );
          this.diagnostics.push({
            code: 'CBS001',
            message: 'Unclosed CBS macro',
            range: { start: macroStart, end: this.currentPos() },
          });
          break;
        }

        this.tokens.push(...macroTokens);
        continue;
      }

      const angleMacro = this.matchAngleBracketMacro();
      if (angleMacro !== null) {
        this.flushPlainText(textBuffer, textStart);
        textBuffer = '';
        textStart = null;
        this.tokens.push(this.consumeAngleBracketMacro(angleMacro));
        continue;
      }

      if (textStart === null) {
        textStart = this.currentPos();
      }

      textBuffer += this.advance();
    }

    this.flushPlainText(textBuffer, textStart);

    const eofPos = this.currentPos();
    this.tokens.push(this.createToken(TokenType.EOF, '', '', eofPos, eofPos));

    return this.tokens;
  }

  getDiagnostics(): TokenizerDiagnostic[] {
    return this.diagnostics.map((diagnostic) => ({
      ...diagnostic,
      range: {
        start: this.clonePosition(diagnostic.range.start),
        end: this.clonePosition(diagnostic.range.end),
      },
    }));
  }

  private readMacro(): Token[] | null {
    const tokens: Token[] = [];
    const openStart = this.currentPos();
    this.advance();
    this.advance();
    tokens.push(this.createToken(TokenType.OpenBrace, '{{', '{{', openStart, this.currentPos()));

    if (this.peek() === '/' && this.peek(1) === '/') {
      return this.readSpecialMacro(TokenType.Comment, '//', tokens);
    }

    if (this.peek() === '?') {
      return this.readSpecialMacro(TokenType.MathExpression, '?', tokens);
    }

    return this.readStructuredMacro(tokens);
  }

  private readSpecialMacro(
    type: TokenType.Comment | TokenType.MathExpression,
    prefix: '//' | '?',
    tokens: Token[],
  ): Token[] | null {
    const contentStart = this.currentPos();

    while (!this.isEOF() && !this.isMacroClose()) {
      this.advance();
    }

    if (this.isEOF()) {
      return null;
    }

    const raw = this.input.slice(this.positionToIndex(contentStart), this.pos);
    const value = raw.slice(prefix.length).trimStart();
    tokens.push(this.createToken(type, value, raw, contentStart, this.currentPos()));
    tokens.push(this.consumeCloseBrace());

    return tokens;
  }

  private readStructuredMacro(tokens: Token[]): Token[] | null {
    let separatorMode: SeparatorMode = 'header';
    let headerRaw = '';
    const headerStart = this.currentPos();

    let argumentRaw = '';
    let argumentStart: Position | null = null;

    const flushHeader = () => {
      tokens.push(this.createHeaderToken(headerRaw, headerStart, this.currentPos()));
    };

    const flushArgument = () => {
      if (argumentStart === null || argumentRaw.length === 0) {
        argumentRaw = '';
        argumentStart = null;
        return;
      }

      tokens.push(
        this.createToken(
          TokenType.Argument,
          argumentRaw,
          argumentRaw,
          argumentStart,
          this.currentPos(),
        ),
      );
      argumentRaw = '';
      argumentStart = null;
    };

    while (!this.isEOF()) {
      if (this.isMacroClose()) {
        if (separatorMode === 'header') {
          flushHeader();
        } else {
          flushArgument();
        }

        tokens.push(this.consumeCloseBrace());
        return tokens;
      }

      if (separatorMode !== 'header' && this.isMacroStart()) {
        flushArgument();
        const nestedTokens = this.readMacro();
        if (nestedTokens === null) {
          return null;
        }

        tokens.push(...nestedTokens);
        continue;
      }

      if (separatorMode === 'header') {
        if (headerRaw.length === 0 && this.isElseKeywordLiteral()) {
          while (!this.isEOF() && !this.isMacroClose()) {
            headerRaw += this.advance();
          }
          continue;
        }

        if (this.peek() === ':' && this.peek(1) === ':') {
          flushHeader();
          tokens.push(this.consumeSeparator('::'));
          separatorMode = 'double';
          continue;
        }

        if (this.peek() === ':') {
          flushHeader();
          tokens.push(this.consumeSeparator(':'));
          separatorMode = 'single';
          continue;
        }

        headerRaw += this.advance();
        continue;
      }

      if (separatorMode === 'double' && this.peek() === ':' && this.peek(1) === ':') {
        flushArgument();
        tokens.push(this.consumeSeparator('::'));
        continue;
      }

      if (separatorMode === 'single' && this.peek() === ':') {
        flushArgument();
        tokens.push(this.consumeSeparator(':'));
        continue;
      }

      if (argumentStart === null) {
        argumentStart = this.currentPos();
      }

      argumentRaw += this.advance();
    }

    return null;
  }

  private createHeaderToken(raw: string, start: Position, end: Position): Token {
    const trimmed = raw.trim();
    const lowered = trimmed.toLocaleLowerCase();

    if (lowered === ':else') {
      return this.createToken(TokenType.ElseKeyword, ':else', raw, start, end);
    }

    if (trimmed === '/') {
      return this.createToken(TokenType.BlockEnd, '/', raw, start, end);
    }

    if (trimmed.startsWith('#')) {
      return this.createToken(
        TokenType.BlockStart,
        `#${this.normalizeName(trimmed.slice(1))}`,
        raw,
        start,
        end,
      );
    }

    if (trimmed.startsWith('/')) {
      return this.createToken(
        TokenType.BlockEnd,
        `/${this.normalizeName(trimmed.slice(1))}`,
        raw,
        start,
        end,
      );
    }

    return this.createToken(TokenType.FunctionName, this.normalizeName(raw), raw, start, end);
  }

  private normalizeName(raw: string): string {
    return raw.toLocaleLowerCase().replace(/[\s_-]/g, '');
  }

  private flushPlainText(raw: string, start: Position | null): void {
    if (start === null || raw.length === 0) {
      return;
    }

    this.tokens.push(this.createToken(TokenType.PlainText, raw, raw, start, this.currentPos()));
  }

  private consumeAngleBracketMacro(name: string): Token {
    const literal = `<${name}>`;
    const start = this.currentPos();
    for (let index = 0; index < literal.length; index += 1) {
      this.advance();
    }
    return this.createToken(TokenType.AngleBracketMacro, name, literal, start, this.currentPos());
  }

  private consumeCloseBrace(): Token {
    const start = this.currentPos();
    this.advance();
    this.advance();
    return this.createToken(TokenType.CloseBrace, '}}', '}}', start, this.currentPos());
  }

  private consumeSeparator(raw: '::' | ':'): Token {
    const start = this.currentPos();
    this.advance();
    if (raw === '::') {
      this.advance();
    }
    return this.createToken(TokenType.ArgumentSeparator, raw, raw, start, this.currentPos());
  }

  private createToken(
    type: TokenType,
    value: string,
    raw: string,
    start: Position,
    end: Position,
  ): Token {
    return {
      type,
      value,
      raw,
      range: {
        start: this.clonePosition(start),
        end: this.clonePosition(end),
      },
    };
  }

  private matchAngleBracketMacro(): string | null {
    if (this.input.startsWith('<user>', this.pos)) {
      return 'user';
    }

    if (this.input.startsWith('<char>', this.pos)) {
      return 'char';
    }

    if (this.input.startsWith('<bot>', this.pos)) {
      return 'bot';
    }

    return null;
  }

  private isElseKeywordLiteral(): boolean {
    return (
      this.input.slice(this.pos, this.pos + 5).toLocaleLowerCase() === ':else' &&
      this.input.slice(this.pos + 5, this.pos + 7) === '}}'
    );
  }

  private positionToIndex(position: Position): number {
    let index = 0;
    let line = 0;
    let character = 0;

    while (index < this.input.length) {
      if (line === position.line && character === position.character) {
        return index;
      }

      const ch = this.input[index];
      index += 1;

      if (ch === '\n') {
        line += 1;
        character = 0;
      } else {
        character += 1;
      }
    }

    return index;
  }

  private clonePosition(position: Position): Position {
    return { line: position.line, character: position.character };
  }

  private currentPos(): Position {
    return { line: this.line, character: this.character };
  }

  private advance(): string {
    const ch = this.input[this.pos++];
    if (ch === '\n') {
      this.line++;
      this.character = 0;
    } else {
      this.character++;
    }
    return ch;
  }

  private peek(offset: number = 0): string {
    return this.input[this.pos + offset] ?? '';
  }

  private isMacroStart(): boolean {
    return this.peek() === '{' && this.peek(1) === '{';
  }

  private isMacroClose(): boolean {
    return this.peek() === '}' && this.peek(1) === '}';
  }

  private isEOF(): boolean {
    return this.pos >= this.input.length;
  }
}
