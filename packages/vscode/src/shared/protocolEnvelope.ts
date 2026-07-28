/**
 * VS Code extension host compatibility wrapper for protocol envelope guards.
 *
 * Implementation lives in `@risuai-workbench/core` shared module.
 * This file re-exports the shared guards so existing import paths continue to resolve.
 *
 * @file packages/vscode/src/shared/protocolEnvelope.ts
 */

export {
  isProtocolMessageEnvelope,
  isProtocolEnvelope,
  isPlainRecord,
} from '@risuai-workbench/core';
