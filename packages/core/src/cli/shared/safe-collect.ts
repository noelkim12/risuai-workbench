export function safeCollect<T>(fn: () => T, warnPrefix: string, fallback: T): T {
  try {
    return fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`  ⚠️ ${warnPrefix}: ${message}`);
    return fallback;
  }
}
