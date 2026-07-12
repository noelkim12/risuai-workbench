const BASE_DELAY_MS = 2_000;
const MAX_DELAY_MS = 30_000;

export function nextBackoffDelayMs(attempt: number): number {
  return Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
}
