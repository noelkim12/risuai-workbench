import {
  SignatureHelp,
  SignatureHelpParams,
} from 'vscode-languageserver/node'
import { CBSBuiltinRegistry } from '../registry/builtins'

export class SignatureHelpProvider {
  constructor(private registry: CBSBuiltinRegistry) {}

  provide(_params: SignatureHelpParams): SignatureHelp | null {
    // TODO: Show active parameter info when typing :: separator
    // e.g., {{setvar::name::value}}
    //                  ^^^^  → highlight "name" parameter
    //                        ^^^^^ → highlight "value" parameter
    return null
  }
}
