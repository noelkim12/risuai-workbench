export interface LogEntry {
  date: string; // YYYY-MM-DD
  operation: string; // 'analyze' or 'analyze --all'
  scope: string; // artifact key or 'workspace'
  bullets: string[];
}

/** Format a log entry in the llm_wiki-compatible convention. */
export function formatLogEntry(entry: LogEntry): string {
  const header = `## [${entry.date}] ${entry.operation} | ${entry.scope}`;
  const body = entry.bullets.map((b) => `- ${b}`).join('\n');
  return `${header}\n${body}\n`;
}

/** Compute today's date in YYYY-MM-DD format (UTC). */
export function currentDateString(now: Date = new Date()): string {
  const yyyy = now.getUTCFullYear().toString();
  const mm = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = now.getUTCDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
