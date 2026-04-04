import { Token, TokenType, Position } from './tokens'

export class CBSTokenizer {
  private input: string = ''
  private pos: number = 0
  private line: number = 0
  private character: number = 0
  private tokens: Token[] = []

  tokenize(input: string): Token[] {
    this.input = input
    this.pos = 0
    this.line = 0
    this.character = 0
    this.tokens = []

    // TODO: Implement character-by-character tokenization
    // Key considerations from parser analysis:
    // - {{ opens macro mode, }} closes it
    // - :: splits arguments (but NOT inside nested {{}})
    // - {{// starts comment mode
    // - {{? starts math expression mode
    // - <user>, <char>, <bot> are angle bracket macros
    // - #when, #each etc. are block starts
    // - /when, / etc. are block ends
    // - :else is a special keyword inside blocks

    return this.tokens
  }

  private currentPos(): Position {
    return { line: this.line, character: this.character }
  }

  private advance(): string {
    const ch = this.input[this.pos++]
    if (ch === '\n') {
      this.line++
      this.character = 0
    } else {
      this.character++
    }
    return ch
  }

  private peek(offset: number = 0): string {
    return this.input[this.pos + offset] ?? ''
  }

  private isEOF(): boolean {
    return this.pos >= this.input.length
  }
}
