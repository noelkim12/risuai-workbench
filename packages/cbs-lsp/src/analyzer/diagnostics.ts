import { CBSDocument, DiagnosticInfo } from '../parser/ast'
import { CBSBuiltinRegistry } from '../registry/builtins'

export enum DiagnosticCode {
  // Errors
  UnclosedBrace = 'CBS001',
  UnmatchedBlockEnd = 'CBS002',
  UnknownFunction = 'CBS003',
  WrongArgumentCount = 'CBS004',
  MissingRequiredArgument = 'CBS005',
  InvalidBlockNesting = 'CBS006',
  CallStackExceeded = 'CBS007',

  // Warnings
  DeprecatedFunction = 'CBS100',
  UndefinedVariable = 'CBS101',
  UnusedVariable = 'CBS102',
  EmptyBlock = 'CBS103',
  LegacyAngleBracket = 'CBS104',

  // Info
  AliasAvailable = 'CBS200',
}

export class DiagnosticsEngine {
  constructor(private registry: CBSBuiltinRegistry) {}

  analyze(document: CBSDocument): DiagnosticInfo[] {
    const diagnostics: DiagnosticInfo[] = [...document.diagnostics]

    // TODO: Implement 15 validation rules from spec:
    // 1. {{ / }} matching
    // 2. Block matching (#when → /when)
    // 3. Cross-nesting detection
    // 4. Function name validity
    // 5. Argument count validation
    // 6. :else position validation (only inside #when)
    // 7. slot::name outside #each warning
    // 8. Deprecated function detection
    // 9. Variable flow analysis (setvar/getvar pairs)
    // 10. #when operator validity
    // 11. #each syntax validation (as keyword)
    // 12. Math expression basic validation
    // 13. <user>/<char>/<bot> legacy warning
    // 14. Empty block warning
    // 15. Skip comment internals

    return diagnostics
  }
}
