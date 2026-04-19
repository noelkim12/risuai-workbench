/** Markdown 테이블 행 생성 */
export const mdRow = (cells: string[]): string => `| ${cells.join(' | ')} |`;

/** HTML 이스케이프 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
