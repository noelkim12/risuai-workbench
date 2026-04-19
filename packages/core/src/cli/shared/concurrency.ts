const DEFAULT_IO_CONCURRENCY = 64;

export interface ConcurrencyLimiter {
  run<T>(fn: () => Promise<T>): Promise<T>;
  map<T, R>(items: readonly T[], fn: (item: T, index: number) => Promise<R>): Promise<R[]>;
}

export function createLimiter(max?: number): ConcurrencyLimiter {
  const limit = max ?? (Number(process.env.RISU_IO_CONCURRENCY) || DEFAULT_IO_CONCURRENCY);
  let active = 0;
  const queue: Array<() => void> = [];

  function tryNext(): void {
    while (queue.length > 0 && active < limit) {
      active += 1;
      const resolve = queue.shift()!;
      resolve();
    }
  }

  async function run<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= limit) {
      await new Promise<void>((resolve) => queue.push(resolve));
    } else {
      active += 1;
    }
    try {
      return await fn();
    } finally {
      active -= 1;
      tryNext();
    }
  }

  function map<T, R>(items: readonly T[], fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
    return Promise.all(items.map((item, i) => run(() => fn(item, i))));
  }

  return { run, map };
}
