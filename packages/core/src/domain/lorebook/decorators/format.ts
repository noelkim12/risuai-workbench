/**
 * Lorebook decorator documentation formatting helpers.
 * Produces markdown and plain-text representations for LSP hover and Monaco completion docs.
 * @file packages/core/src/domain/lorebook/decorators/format.ts
 */

import type { LorebookDecoratorSupportLevel } from './types';

import { getLorebookDecoratorSpec } from './registry';

const SUPPORT_LABEL: Record<LorebookDecoratorSupportLevel, string> = {
  active: 'Active',
  partial: 'Partial',
  uncertain: 'Uncertain',
  unsupported: 'Unsupported',
};

/**
 * formatLorebookDecoratorMarkdown.
 * Formats a decorator spec as markdown documentation suitable for LSP hover
 * or Monaco resolved completion docs.
 *
 * @param name - Decorator name (with or without `@@`, case-insensitive)
 * @returns Markdown string with header, description, and support badge
 */
export function formatLorebookDecoratorMarkdown(name: string): string {
  const spec = getLorebookDecoratorSpec(name);
  if (!spec) {
    return `**@@${name}**\n\nUnknown lorebook decorator.`;
  }

  const lines: string[] = [];
  lines.push(`**${spec.label}**`);
  lines.push('');
  lines.push(spec.summary);
  lines.push('');
  lines.push(spec.description);

  lines.push('');
  lines.push(`**Support:** ${SUPPORT_LABEL[spec.supportLevel]}`);
  lines.push(`**Category:** ${spec.category}`);

  if (spec.examples.length > 0) {
    lines.push('');
    lines.push('**Examples:**');
    for (const ex of spec.examples) {
      lines.push(`- \`${ex}\``);
    }
  }

  return lines.join('\n');
}

/**
 * formatLorebookDecoratorPlain.
 * Formats a decorator spec as plain text without markdown syntax.
 * Suitable for environments that do not render markdown.
 *
 * @param name - Decorator name (with or without `@@`, case-insensitive)
 * @returns Plain text description with support level
 */
export function formatLorebookDecoratorPlain(name: string): string {
  const spec = getLorebookDecoratorSpec(name);
  if (!spec) {
    return `@@${name} - Unknown lorebook decorator.`;
  }

  const lines: string[] = [];
  lines.push(spec.label);
  lines.push(spec.summary);
  lines.push(spec.description);
  lines.push(`Support: ${SUPPORT_LABEL[spec.supportLevel]}`);
  lines.push(`Category: ${spec.category}`);

  if (spec.examples.length > 0) {
    lines.push(`Examples: ${spec.examples.join(', ')}`);
  }

  return lines.join('\n');
}
