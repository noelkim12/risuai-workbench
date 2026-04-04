import { FoldingRange, FoldingRangeParams } from 'vscode-languageserver/node'

export class FoldingProvider {
  provide(_params: FoldingRangeParams): FoldingRange[] {
    // TODO: Register folding ranges for:
    // - {{#when ...}} ~ {{/when}}
    // - {{#each ...}} ~ {{/each}}
    // - {{#escape}} ~ {{/escape}}
    // - {{#puredisplay}} ~ {{/puredisplay}}
    return []
  }
}
