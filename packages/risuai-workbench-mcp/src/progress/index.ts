/**
 * MCP progress notification helpers.
 * @file packages/risuai-workbench-mcp/src/progress/index.ts
 */

import type { ServerNotification } from '@modelcontextprotocol/sdk/types.js';

export type ProgressToken = string | number;

export interface ProgressRequestLike {
  _meta?: {
    progressToken?: unknown;
  };
}

export interface ProgressReporter {
  report(progress: number, total: number | undefined, message: string): Promise<void>;
}

interface ProgressReporterOptions {
  sendNotification: (notification: ServerNotification) => Promise<void>;
  token: ProgressToken | null;
}

export function getProgressToken(extra: ProgressRequestLike): ProgressToken | null {
  const token = extra._meta?.progressToken;
  return typeof token === 'string' || typeof token === 'number' ? token : null;
}

export function createProgressReporter(options: ProgressReporterOptions): ProgressReporter {
  let lastProgress = Number.NEGATIVE_INFINITY;

  return {
    async report(progress: number, total: number | undefined, message: string): Promise<void> {
      if (options.token === null) return;
      if (!Number.isFinite(progress)) return;
      if (progress <= lastProgress) return;
      lastProgress = progress;

      await options.sendNotification({
        method: 'notifications/progress',
        params: {
          progress,
          progressToken: options.token,
          ...(total === undefined ? {} : { total }),
          ...(message === '' ? {} : { message }),
        },
      });
    },
  };
}
