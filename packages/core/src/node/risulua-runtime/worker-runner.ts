import fs from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';

import {
  DEFAULT_RISULUA_EXECUTION_LIMITS,
  RISULUA_RUNTIME_LIMITS,
  type RisuLuaDiagnosticId,
  type RisuLuaEngineRequest,
  type RisuLuaExecutionRequest,
  type RisuLuaExecutionResult,
} from './contracts';

const WORKER_RESOURCE_LIMITS = Object.freeze({
  maxOldGenerationSizeMb: 64,
  maxYoungGenerationSizeMb: 16,
  stackSizeMb: 4,
});

export async function executeRisuLua(
  request: RisuLuaExecutionRequest,
  options: { signal?: AbortSignal } = {},
): Promise<RisuLuaExecutionResult> {
  const normalizedRequest = normalizeRequest(request);
  if (options.signal?.aborted) return boundaryError('RUNTIME_ABORTED', 'RisuLua execution was aborted');

  let worker: Worker;
  try {
    worker = createRuntimeWorker(normalizedRequest);
  } catch (error) {
    return boundaryError('RUNTIME_INTERNAL_ERROR', errorMessage(error));
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: RisuLuaExecutionResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abort);
      worker.removeAllListeners();
      void worker.terminate();
      resolve(result);
    };
    const abort = () => finish(boundaryError('RUNTIME_ABORTED', 'RisuLua execution was aborted'));
    const timeout = setTimeout(() => {
      finish(boundaryError(
        'RUNTIME_TIMEOUT',
        `RisuLua execution exceeded ${normalizedRequest.limits.timeoutMs} ms`,
      ));
    }, normalizedRequest.limits.timeoutMs);

    worker.once('message', (message: unknown) => {
      finish(isExecutionResult(message)
        ? message
        : boundaryError('RUNTIME_INTERNAL_ERROR', 'RisuLua Worker returned an invalid response'));
    });
    worker.once('error', (error) => {
      finish(boundaryError('RUNTIME_INTERNAL_ERROR', errorMessage(error)));
    });
    worker.once('exit', (code) => {
      if (!settled && code !== 0) {
        finish(boundaryError('RUNTIME_INTERNAL_ERROR', `RisuLua Worker exited with code ${code}`));
      }
    });
    options.signal?.addEventListener('abort', abort, { once: true });
  });
}

function normalizeRequest(request: RisuLuaExecutionRequest): RisuLuaEngineRequest {
  const requested = request.limits ?? {};
  return {
    ...request,
    hostProfile: request.hostProfile ?? 'minimal',
    limits: {
      timeoutMs: boundedInteger(
        requested.timeoutMs,
        DEFAULT_RISULUA_EXECUTION_LIMITS.timeoutMs,
        RISULUA_RUNTIME_LIMITS.defaultTimeoutMs,
      ),
      instructionLimit: boundedInteger(
        requested.instructionLimit,
        DEFAULT_RISULUA_EXECUTION_LIMITS.instructionLimit,
        RISULUA_RUNTIME_LIMITS.defaultInstructionLimit,
      ),
      hostCallLimit: boundedInteger(
        requested.hostCallLimit,
        DEFAULT_RISULUA_EXECUTION_LIMITS.hostCallLimit,
        RISULUA_RUNTIME_LIMITS.defaultHostCallLimit,
      ),
      maxTraceEvents: boundedInteger(
        requested.maxTraceEvents,
        DEFAULT_RISULUA_EXECUTION_LIMITS.maxTraceEvents,
        RISULUA_RUNTIME_LIMITS.defaultMaxTraceEvents,
      ),
    },
  };
}

function boundedInteger(value: number | undefined, fallback: number, maximum: number): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(maximum, Math.trunc(value)));
}

function createRuntimeWorker(request: RisuLuaEngineRequest): Worker {
  const compiledEntry = path.join(__dirname, 'worker-entry.js');
  if (fs.existsSync(compiledEntry)) {
    return new Worker(compiledEntry, {
      workerData: request,
      resourceLimits: WORKER_RESOURCE_LIMITS,
    });
  }

  const sourceEntry = path.join(__dirname, 'worker-entry.ts');
  const typescriptPath = require.resolve('typescript');
  const bootstrap = [
    `const fs = require('node:fs');`,
    `const ts = require(${JSON.stringify(typescriptPath)});`,
    `require.extensions['.ts'] = function(module, filename) {`,
    `  const source = fs.readFileSync(filename, 'utf8');`,
    `  const output = ts.transpileModule(source, { compilerOptions: {`,
    `    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true`,
    `  }}).outputText;`,
    `  module._compile(output, filename);`,
    `};`,
    `require(${JSON.stringify(sourceEntry)});`,
  ].join('\n');
  return new Worker(bootstrap, {
    eval: true,
    workerData: request,
    resourceLimits: WORKER_RESOURCE_LIMITS,
  });
}

function isExecutionResult(value: unknown): value is RisuLuaExecutionResult {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<RisuLuaExecutionResult>;
  return (candidate.status === 'ok' || candidate.status === 'error')
    && Array.isArray(candidate.diagnostics)
    && Array.isArray(candidate.trace)
    && typeof candidate.metrics === 'object';
}

function boundaryError(id: RisuLuaDiagnosticId, message: string): RisuLuaExecutionResult {
  return {
    status: 'error',
    stateDiff: {},
    trace: [],
    diagnostics: [{ id, message }],
    metrics: {
      instructions: 0,
      hostCalls: 0,
      traceEvents: 0,
      traceTruncated: false,
    },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
