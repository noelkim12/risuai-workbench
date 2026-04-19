import { CBSBuiltinRegistry } from '../registry/builtins';
import type {
  BlockKind,
  BlockNode,
  CBSDocument,
  CBSNode,
  CommentNode,
  DiagnosticInfo,
  MacroCallNode,
  MathExprNode,
  PlainTextNode,
} from './ast';
import { CBSTokenizer } from './tokenizer';
import { type Position, type Range, TokenType, type Token } from './tokens';

const MAX_RECURSION_DEPTH = 20;

const PURE_MODE_BLOCKS = new Set<BlockKind>(['each', 'escape', 'pure', 'puredisplay', 'func']);
const CONDITIONAL_BLOCKS = new Set<BlockKind>(['when', 'if', 'if_pure']);

type ParsedSegments = {
  segments: CBSNode[][];
  separators: Token[];
  closeToken: Token;
};

const BLOCK_KIND_BY_NAME = new Map<string, BlockKind>([
  ['when', 'when'],
  ['each', 'each'],
  ['if', 'if'],
  ['if_pure', 'if_pure'],
  ['ifpure', 'if_pure'],
  ['escape', 'escape'],
  ['puredisplay', 'puredisplay'],
  ['pure_display', 'puredisplay'],
  ['pure', 'pure'],
  ['func', 'func'],
]);

export class CBSParser {
  private input = '';
  private tokens: Token[] = [];
  private pos = 0;
  private diagnostics: DiagnosticInfo[] = [];
  private readonly registry = new CBSBuiltinRegistry();
  private lineStarts: number[] = [0];

  parse(input: string): CBSDocument {
    const tokenizer = new CBSTokenizer();

    this.input = input;
    this.tokens = tokenizer.tokenize(input);
    this.pos = 0;
    this.lineStarts = this.buildLineStarts(input);
    this.diagnostics = tokenizer.getDiagnostics().map((diagnostic) => ({
      code: diagnostic.code,
      message: diagnostic.message,
      range: this.cloneRange(diagnostic.range),
      severity: 'error',
    }));

    return {
      nodes: this.parseNodes(0),
      diagnostics: this.diagnostics,
    };
  }

  private parseNodes(depth: number): CBSNode[] {
    const nodes: CBSNode[] = [];

    while (!this.isAt(TokenType.EOF)) {
      const node = this.parseNode(depth);
      if (!node) {
        break;
      }

      nodes.push(node);
    }

    return nodes;
  }

  private parseNode(depth: number): CBSNode | null {
    const token = this.currentToken();

    switch (token.type) {
      case TokenType.PlainText:
        this.pos += 1;
        return this.createPlainTextNode(token.value, token.range);
      case TokenType.AngleBracketMacro:
        this.pos += 1;
        return {
          type: 'MacroCall',
          name: token.value,
          arguments: [],
          range: this.cloneRange(token.range),
          nameRange: this.cloneRange(token.range),
        } satisfies MacroCallNode;
      case TokenType.EOF:
        return null;
      case TokenType.OpenBrace:
        if (depth > MAX_RECURSION_DEPTH) {
          this.addDiagnostic(
            'CBS007',
            `CBS macro nesting exceeds the maximum depth of ${MAX_RECURSION_DEPTH}`,
            this.macroRangeAt(this.pos),
          );
          return this.consumeRawMacroAsPlainText();
        }

        return this.parseStructuredNode(depth);
      default:
        this.pos += 1;
        return this.createPlainTextNode(token.raw || token.value, token.range);
    }
  }

  private parseStructuredNode(depth: number): CBSNode {
    const inner = this.peek(1);

    switch (inner.type) {
      case TokenType.FunctionName:
        return this.parseMacroCall(depth);
      case TokenType.BlockStart:
        return this.parseBlock(depth);
      case TokenType.Comment:
        return this.parseComment();
      case TokenType.MathExpression:
        return this.parseMathExpression();
      case TokenType.ElseKeyword:
        this.addDiagnostic(
          'CBS006',
          'Stray :else outside a conditional block',
          this.macroRangeAt(this.pos),
        );
        return this.consumeRawMacroAsPlainText();
      case TokenType.BlockEnd:
        this.addDiagnostic(
          'CBS006',
          'Unexpected block close without a matching open block',
          this.macroRangeAt(this.pos),
        );
        return this.consumeRawMacroAsPlainText();
      default:
        return this.consumeRawMacroAsPlainText();
    }
  }

  private parseComment(): CommentNode {
    const open = this.consume(TokenType.OpenBrace);
    const comment = this.consume(TokenType.Comment);
    const close = this.consume(TokenType.CloseBrace);

    return {
      type: 'Comment',
      value: comment.value,
      range: this.createRange(open.range.start, close.range.end),
    };
  }

  private parseMathExpression(): MathExprNode {
    const open = this.consume(TokenType.OpenBrace);
    const expression = this.consume(TokenType.MathExpression);
    const close = this.consume(TokenType.CloseBrace);

    return {
      type: 'MathExpr',
      expression: expression.value,
      range: this.createRange(open.range.start, close.range.end),
    };
  }

  private parseMacroCall(depth: number): MacroCallNode {
    const open = this.consume(TokenType.OpenBrace);
    const nameToken = this.consume(TokenType.FunctionName);
    const parsed = this.parseSeparatedSegmentsUntilClose(depth);

    if (!this.registry.has(nameToken.value)) {
      this.addDiagnostic(
        'CBS003',
        `Unknown CBS function ${JSON.stringify(nameToken.raw.trim())}`,
        nameToken.range,
      );
    }

    return {
      type: 'MacroCall',
      name: nameToken.value,
      arguments: parsed.segments,
      range: this.createRange(open.range.start, parsed.closeToken.range.end),
      nameRange: this.cloneRange(nameToken.range),
    };
  }

  private parseBlock(depth: number): BlockNode | MacroCallNode {
    const open = this.consume(TokenType.OpenBrace);
    const blockToken = this.consume(TokenType.BlockStart);
    const parsed = this.parseSeparatedSegmentsUntilClose(depth);
    const openRange = this.createRange(open.range.start, parsed.closeToken.range.end);

    const header = this.parseBlockHeaderToken(blockToken);
    if (!header.kind) {
      this.addDiagnostic(
        'CBS003',
        `Unknown CBS block ${JSON.stringify(blockToken.raw.trim())}`,
        blockToken.range,
      );

      return {
        type: 'MacroCall',
        name: header.name,
        arguments: this.mergeInlineTailIntoArguments(
          parsed.segments,
          blockToken,
          header.inlineTail,
        ),
        range: this.createRange(open.range.start, parsed.closeToken.range.end),
        nameRange: this.cloneRange(blockToken.range),
      };
    }

    const { operators, condition } = this.buildBlockHeader(
      parsed,
      blockToken,
      header.inlineTail,
      header.kind,
    );

    if (PURE_MODE_BLOCKS.has(header.kind)) {
      const pureBody = this.capturePureBody(header.kind, openRange);

      return {
        type: 'Block',
        kind: header.kind,
        operators,
        condition,
        body: pureBody.body,
        elseBody: undefined,
        range: this.createRange(
          open.range.start,
          this.resolveBlockEndPosition(openRange, pureBody.body, undefined, pureBody.closeRange),
        ),
        openRange,
        closeRange: pureBody.closeRange,
      };
    }

    const body: CBSNode[] = [];
    let elseBody: CBSNode[] | undefined;
    let target = body;
    let closeRange: Range | undefined;
    let elseConsumed = false;

    while (!this.isAt(TokenType.EOF)) {
      if (this.isElseMacro()) {
        if (CONDITIONAL_BLOCKS.has(header.kind) && !elseConsumed) {
          this.consumeElseMacro();
          elseConsumed = true;
          elseBody = [];
          target = elseBody;
          continue;
        }

        this.addDiagnostic(
          'CBS006',
          'Unexpected :else for the current block',
          this.macroRangeAt(this.pos),
        );
        target.push(this.consumeRawMacroAsPlainText());
        continue;
      }

      if (this.isBlockEndMacro()) {
        const blockEnd = this.readBlockEndToken(this.peek(1));
        closeRange = this.consumeBlockEndMacro();
        if (!this.blockEndMatchesKind(blockEnd, header.kind)) {
          this.addDiagnostic('CBS006', 'Cross-nested block close detected', closeRange);
        }
        break;
      }

      const node = this.parseNode(depth + 1);
      if (!node) {
        break;
      }

      target.push(node);
    }

    if (!closeRange) {
      this.addDiagnostic(
        'CBS002',
        `Unclosed CBS block ${JSON.stringify(blockToken.raw.trim())}`,
        openRange,
      );
    }

    return {
      type: 'Block',
      kind: header.kind,
      operators,
      condition,
      body,
      elseBody,
      range: this.createRange(
        open.range.start,
        this.resolveBlockEndPosition(openRange, body, elseBody, closeRange),
      ),
      openRange,
      closeRange,
    };
  }

  private parseSeparatedSegmentsUntilClose(depth: number): ParsedSegments {
    const segments: CBSNode[][] = [];
    const separators: Token[] = [];
    let currentSegment: CBSNode[] = [];
    let sawArguments = false;

    while (!this.isAt(TokenType.CloseBrace)) {
      if (this.isAt(TokenType.EOF)) {
        throw new Error(
          'Unexpected EOF while parsing macro arguments. Tokenizer should have recovered earlier.',
        );
      }

      if (this.isAt(TokenType.ArgumentSeparator)) {
        const separator = this.consume(TokenType.ArgumentSeparator);
        if (!sawArguments && currentSegment.length === 0 && segments.length === 0) {
          sawArguments = true;
          continue;
        }

        sawArguments = true;
        segments.push(currentSegment);
        separators.push(separator);
        currentSegment = [];
        continue;
      }

      if (this.isAt(TokenType.Argument)) {
        const argument = this.consume(TokenType.Argument);
        currentSegment.push(this.createPlainTextNode(argument.value, argument.range));
        continue;
      }

      const node = this.parseNode(depth + 1);
      if (!node) {
        break;
      }

      currentSegment.push(node);
    }

    const closeToken = this.consume(TokenType.CloseBrace);
    if (sawArguments || currentSegment.length > 0) {
      segments.push(currentSegment);
    }

    return {
      segments,
      separators,
      closeToken,
    };
  }

  private buildBlockHeader(
    parsed: ParsedSegments,
    blockToken: Token,
    inlineTail: string,
    kind: BlockKind,
  ): { operators: string[]; condition: CBSNode[] } {
    const segments = parsed.segments.map((segment) => [...segment]);
    const separators = [...parsed.separators];
    const operators: string[] = [];

    if (segments.length > 1) {
      const mode = this.readModeOperator(kind, segments[0]);
      if (mode) {
        operators.push(mode);
        segments.shift();
        separators.shift();
      }
    }

    const condition = this.flattenSegments(segments, separators);
    if (condition.length > 0) {
      return { operators, condition };
    }

    if (inlineTail.length === 0) {
      return { operators, condition: [] };
    }

    return {
      operators,
      condition: [this.createPlainTextNode(inlineTail, blockToken.range)],
    };
  }

  private capturePureBody(
    kind: BlockKind,
    openRange: Range,
  ): { body: CBSNode[]; closeRange?: Range } {
    const startToken = this.currentToken();
    const bodyStart = startToken.type === TokenType.EOF ? openRange.end : startToken.range.start;
    let scanIndex = this.pos;
    let literalDepth = 0;

    while (true) {
      const token = this.tokens[scanIndex];

      if (!token || token.type === TokenType.EOF) {
        this.pos = scanIndex;
        this.addDiagnostic('CBS002', `Unclosed CBS block ${JSON.stringify(`#${kind}`)}`, openRange);
        return {
          body: this.createLiteralNodesBetween(
            bodyStart,
            token ? token.range.start : openRange.end,
          ),
          closeRange: undefined,
        };
      }

      if (token.type !== TokenType.OpenBrace) {
        scanIndex += 1;
        continue;
      }

      const inner = this.tokens[scanIndex + 1];
      if (!inner) {
        scanIndex += 1;
        continue;
      }

      if (inner.type === TokenType.BlockStart) {
        literalDepth += 1;
        scanIndex = this.skipMacroAt(scanIndex);
        continue;
      }

      if (inner.type === TokenType.BlockEnd) {
        const closeRange = this.macroRangeAt(scanIndex);
        const blockEnd = this.readBlockEndToken(inner);

        if (literalDepth === 0) {
          this.pos = this.skipMacroAt(scanIndex);
          if (!this.blockEndMatchesKind(blockEnd, kind)) {
            this.addDiagnostic('CBS006', 'Cross-nested block close detected', closeRange);
          }
          return {
            body: this.createLiteralNodesBetween(bodyStart, token.range.start),
            closeRange,
          };
        }

        literalDepth -= 1;
        scanIndex = this.skipMacroAt(scanIndex);
        continue;
      }

      scanIndex = this.skipMacroAt(scanIndex);
    }
  }

  private mergeInlineTailIntoArguments(
    segments: CBSNode[][],
    blockToken: Token,
    inlineTail: string,
  ): CBSNode[][] {
    if (inlineTail.length === 0) {
      return segments;
    }

    if (segments.length > 0) {
      return segments;
    }

    return [[this.createPlainTextNode(inlineTail, blockToken.range)]];
  }

  private flattenSegments(segments: CBSNode[][], separators: Token[]): CBSNode[] {
    const nodes: CBSNode[] = [];

    for (let index = 0; index < segments.length; index += 1) {
      nodes.push(...segments[index]);

      const separator = separators[index];
      if (separator) {
        nodes.push(this.createPlainTextNode(separator.raw, separator.range));
      }
    }

    return nodes;
  }

  private readModeOperator(kind: BlockKind, segment: CBSNode[]): string | null {
    if (segment.length !== 1 || segment[0].type !== 'PlainText') {
      return null;
    }

    const value = segment[0].value.trim().toLowerCase();
    if (kind === 'when' && (value === 'keep' || value === 'legacy')) {
      return value;
    }

    if ((kind === 'each' || kind === 'escape') && value === 'keep') {
      return value;
    }

    return null;
  }

  private parseBlockHeaderToken(token: Token): {
    kind?: BlockKind;
    name: string;
    inlineTail: string;
  } {
    const trimmed = token.raw.trim();
    const body = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
    const splitIndex = body.search(/\s/);
    const rawName = (splitIndex === -1 ? body : body.slice(0, splitIndex)).trim();
    const inlineTail = splitIndex === -1 ? '' : body.slice(splitIndex).trim();
    const normalizedName = rawName.toLowerCase().replace(/-/g, '_');

    return {
      kind: BLOCK_KIND_BY_NAME.get(normalizedName),
      name: normalizedName.replace(/^#+/, ''),
      inlineTail,
    };
  }

  private readBlockEndToken(token: Token): { kind?: BlockKind; shorthand: boolean } {
    const trimmed = token.raw.trim();
    if (trimmed === '/') {
      return { shorthand: true };
    }

    const body = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
    const splitIndex = body.search(/\s/);
    const rawName = (splitIndex === -1 ? body : body.slice(0, splitIndex)).trim();
    const normalizedName = rawName.toLowerCase().replace(/-/g, '_');

    return {
      kind: BLOCK_KIND_BY_NAME.get(normalizedName),
      shorthand: false,
    };
  }

  private blockEndMatchesKind(
    actual: { kind?: BlockKind; shorthand: boolean },
    expected: BlockKind,
  ): boolean {
    return actual.shorthand || actual.kind === expected;
  }

  private consumeElseMacro(): void {
    this.consume(TokenType.OpenBrace);
    this.consume(TokenType.ElseKeyword);
    this.consume(TokenType.CloseBrace);
  }

  private consumeBlockEndMacro(): Range {
    const open = this.consume(TokenType.OpenBrace);
    this.consume(TokenType.BlockEnd);
    const close = this.consume(TokenType.CloseBrace);
    return this.createRange(open.range.start, close.range.end);
  }

  private consumeRawMacroAsPlainText(): PlainTextNode {
    const range = this.macroRangeAt(this.pos);
    const value = this.sliceRange(range);
    this.pos = this.skipMacroAt(this.pos);
    return this.createPlainTextNode(value, range);
  }

  private createLiteralNodesBetween(start: Position, end: Position): PlainTextNode[] {
    if (this.positionsEqual(start, end)) {
      return [];
    }

    const value = this.slicePositions(start, end);
    if (value.length === 0) {
      return [];
    }

    return [this.createPlainTextNode(value, this.createRange(start, end))];
  }

  private resolveBlockEndPosition(
    openRange: Range,
    body: CBSNode[],
    elseBody: CBSNode[] | undefined,
    closeRange: Range | undefined,
  ): Position {
    if (closeRange) {
      return closeRange.end;
    }

    const tail =
      elseBody && elseBody.length > 0 ? elseBody[elseBody.length - 1] : body[body.length - 1];
    return tail ? tail.range.end : openRange.end;
  }

  private addDiagnostic(
    code: string,
    message: string,
    range: Range,
    severity: DiagnosticInfo['severity'] = 'error',
  ): void {
    this.diagnostics.push({
      code,
      message,
      range: this.cloneRange(range),
      severity,
    });
  }

  private currentToken(): Token {
    return this.tokens[this.pos] ?? this.tokens[this.tokens.length - 1];
  }

  private peek(offset: number): Token {
    return this.tokens[this.pos + offset] ?? this.tokens[this.tokens.length - 1];
  }

  private isAt(type: TokenType): boolean {
    return this.currentToken().type === type;
  }

  private isElseMacro(): boolean {
    return (
      this.currentToken().type === TokenType.OpenBrace &&
      this.peek(1).type === TokenType.ElseKeyword
    );
  }

  private isBlockEndMacro(): boolean {
    return (
      this.currentToken().type === TokenType.OpenBrace && this.peek(1).type === TokenType.BlockEnd
    );
  }

  private consume(type: TokenType): Token {
    const token = this.currentToken();
    if (token.type !== type) {
      throw new Error(`Expected ${TokenType[type]}, received ${TokenType[token.type]}`);
    }

    this.pos += 1;
    return token;
  }

  private macroRangeAt(index: number): Range {
    const open = this.tokens[index];
    const close = this.tokens[this.findMacroCloseIndex(index)];
    return this.createRange(open.range.start, close.range.end);
  }

  private findMacroCloseIndex(index: number): number {
    let depth = 0;

    for (let cursor = index; cursor < this.tokens.length; cursor += 1) {
      const token = this.tokens[cursor];
      if (token.type === TokenType.OpenBrace) {
        depth += 1;
      }

      if (token.type === TokenType.CloseBrace) {
        depth -= 1;
        if (depth === 0) {
          return cursor;
        }
      }
    }

    return index;
  }

  private skipMacroAt(index: number): number {
    return this.findMacroCloseIndex(index) + 1;
  }

  private createPlainTextNode(value: string, range: Range): PlainTextNode {
    return {
      type: 'PlainText',
      value,
      range: this.cloneRange(range),
    };
  }

  private createRange(start: Position, end: Position): Range {
    return {
      start: this.clonePosition(start),
      end: this.clonePosition(end),
    };
  }

  private cloneRange(range: Range): Range {
    return this.createRange(range.start, range.end);
  }

  private clonePosition(position: Position): Position {
    return {
      line: position.line,
      character: position.character,
    };
  }

  private positionsEqual(left: Position, right: Position): boolean {
    return left.line === right.line && left.character === right.character;
  }

  private sliceRange(range: Range): string {
    return this.slicePositions(range.start, range.end);
  }

  private slicePositions(start: Position, end: Position): string {
    return this.input.slice(this.indexFromPosition(start), this.indexFromPosition(end));
  }

  private indexFromPosition(position: Position): number {
    const lineStart = this.lineStarts[position.line] ?? this.input.length;
    return Math.min(lineStart + position.character, this.input.length);
  }

  private buildLineStarts(input: string): number[] {
    const starts = [0];

    for (let index = 0; index < input.length; index += 1) {
      if (input[index] === '\n') {
        starts.push(index + 1);
      }
    }

    return starts;
  }
}
