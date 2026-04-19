export enum TokenType {
  PlainText,
  OpenBrace, // {{
  CloseBrace, // }}
  ArgumentSeparator, // ::
  FunctionName,
  Argument,
  BlockStart, // #when, #each, #if, #escape, #puredisplay
  BlockEnd, // /when, /each, /, /if
  ElseKeyword, // :else
  Comment, // {{// ...}}
  MathExpression, // {{? expr}}
  AngleBracketMacro, // <user>, <char>, <bot>
  EOF,
}

export interface Token {
  type: TokenType
  value: string
  range: Range
  raw: string
}

export interface Range {
  start: Position
  end: Position
}

export interface Position {
  line: number
  character: number
}
