import { CBSBuiltinFunction, isDocOnlyBuiltin } from './builtins'

export interface FunctionDocumentation {
  signature: string
  description: string
  descriptionKo?: string
  examples: string[]
  seeAlso?: string[]
}

export function generateDocumentation(fn: CBSBuiltinFunction): FunctionDocumentation {
  const args = fn.arguments
    .map((a) => {
      const prefix = a.variadic ? '...' : ''
      const suffix = a.required ? '' : '?'
      return `${prefix}${a.name}${suffix}`
    })
    .join(', ')

  const signature = fn.isBlock
    ? `{{${fn.name} ${args}}}...{{/${fn.name.replace('#', '')}}}`
    : fn.arguments.length > 0
      ? `{{${fn.name}::${fn.arguments.map((a) => a.name).join('::')}}}`
      : `{{${fn.name}}}`

  return {
    signature,
    description: fn.description,
    descriptionKo: fn.descriptionKo,
    examples: [], // TODO: Populate from cbs_docs.cbs
    seeAlso: fn.aliases.length > 0 ? fn.aliases.map((a) => `{{${a}}}`) : undefined,
  }
}

export function formatHoverContent(fn: CBSBuiltinFunction): string {
  const doc = generateDocumentation(fn)
  const lines: string[] = []

  lines.push(`**${fn.name}**`)
  if (fn.aliases.length > 0) {
    lines.push(`_(alias: ${fn.aliases.join(', ')})_`)
  }
  lines.push('')
  lines.push(fn.description)
  if (fn.descriptionKo) {
    lines.push('')
    lines.push(fn.descriptionKo)
  }
  lines.push('')
  lines.push('```cbs')
  lines.push(doc.signature)
  lines.push('```')

  if (isDocOnlyBuiltin(fn)) {
    lines.push('')
    lines.push(
      '**Documentation-only syntax entry:** visible in editor docs and completion, but not a general runtime callback builtin.',
    )
  }

  if (fn.deprecated) {
    lines.push('')
    lines.push(`**Deprecated:** ${fn.deprecated.message}`)
    if (fn.deprecated.replacement) {
      lines.push(`Use \`${fn.deprecated.replacement}\` instead.`)
    }
  }

  return lines.join('\n')
}
