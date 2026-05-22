// Core library entry point - browser-safe exports only
// Domain logic and exported contracts (no Node.js I/O)
// Node.js I/O helpers available via './node' entry point
export * from './domain';
export {
  isPlainRecord,
  isProtocolMessageEnvelope,
  isProtocolEnvelope,
} from './shared/protocol-envelope';
export { escapeRegExp } from './shared/string-patterns';
