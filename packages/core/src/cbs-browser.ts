/**
 * Browser-safe core exports for webview consumption.
 * No Node.js I/O, no VS Code APIs, no DOM globals.
 * @file packages/core/src/cbs-browser.ts
 */

export { CBSBuiltinRegistry, type CBSBuiltinFunction } from './domain/cbs/registry/builtins';
export {
  isPlainRecord,
  isProtocolMessageEnvelope,
  isProtocolEnvelope,
} from './shared/protocol-envelope';
