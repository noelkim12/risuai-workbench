/**
 * Webview compatibility wrapper for protocol envelope guards.
 *
 * Implementation lives in `@risuai-workbench/core/cbs-browser`.
 * This file re-exports the shared guards so existing import paths continue to resolve.
 *
 * @file packages/webview/src/lib/protocolEnvelope.ts
 */

export {
  isProtocolMessageEnvelope,
  isProtocolEnvelope,
  isPlainRecord,
} from '@risuai-workbench/core/cbs-browser';
