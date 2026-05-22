import { getErrorMessage } from './errors';

export function safeCollect<T>(fn: () => T, warnPrefix: string, fallback: T): T {
  try {
    return fn();
  } catch (error) {
    const message = getErrorMessage(error);
    console.warn(`  ⚠️ ${warnPrefix}: ${message}`);
    return fallback;
  }
}
