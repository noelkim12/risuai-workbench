/**
 * Pure markdown helpers used by every wiki renderer.
 * No business logic. Each function is a deterministic string transformation.
 */

type FrontmatterValue = string | number | boolean | string[] | number[] | undefined;

const RESERVED_YAML_CHARS = /[:{}\[\],&*#?|\-<>=!%@`"']/;

/** Serialize a flat key/value map to YAML frontmatter, omitting undefined values. */
export function serializeFrontmatter(fields: Record<string, FrontmatterValue>): string {
  const lines: string[] = ['---'];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    lines.push(`${key}: ${renderValue(value)}`);
  }
  lines.push('---');
  return lines.join('\n') + '\n';
}

function renderValue(value: string | number | boolean | string[] | number[]): string {
  if (Array.isArray(value)) {
    return `[${value.map((v) => String(v)).join(', ')}]`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (needsQuoting(value)) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return value;
}

function needsQuoting(value: string): boolean {
  if (value === '') return true;
  if (RESERVED_YAML_CHARS.test(value)) return true;
  if (/^(true|false|null|yes|no)$/i.test(value)) return true;
  if (/^-?\d+(\.\d+)?$/.test(value)) return true;
  return false;
}

/** Build a GFM table with escaped pipe characters. */
export function buildTable(headers: string[], rows: string[][]): string {
  const headerLine = `| ${headers.join(' | ')} |`;
  const separator = `|${headers.map(() => '---').join('|')}|`;
  const bodyLines = rows.map(
    (row) => `| ${row.map((cell) => cell.replace(/\|/g, '\\|')).join(' | ')} |`,
  );
  return [headerLine, separator, ...bodyLines].join('\n');
}

/** Build a markdown link, escaping brackets inside the label. */
export function buildLink(label: string, url: string): string {
  const escapedLabel = label.replace(/\[/g, '\\[').replace(/\]/g, '\\]');
  return `[${escapedLabel}](${url})`;
}

/** Escape markdown-significant characters in free text. */
export function escapeMarkdown(text: string): string {
  return text.replace(/[`\[\]]/g, (ch) => `\\${ch}`);
}
