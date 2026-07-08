/**
 * Plugin Viewer panel ↔ webview message contract.
 * @file packages/vscode/src/views/pluginViewerMessages.ts
 */

export const PLUGIN_VIEWER_PROTOCOL = 'risu-workbench.plugin-viewer';
export const PLUGIN_VIEWER_PROTOCOL_VERSION = 1;
export const PLUGIN_VIEWER_VIEW_NAME = 'plugin-viewer';

export interface PluginTreeNode {
  name: string;
  relativePath: string;
  kind: 'file' | 'directory';
  children?: PluginTreeNode[];
}

export interface PluginViewerLoadedPayload {
  stableId: string;
  name: string;
  description: string;
  iconUri: string | null;
  version: string | null;
  scripts: { build: boolean; dev: boolean };
  packageJsonError: string | null;
  tree: PluginTreeNode[];
}

interface Envelope<TType extends string, TPayload> {
  protocol: typeof PLUGIN_VIEWER_PROTOCOL;
  version: typeof PLUGIN_VIEWER_PROTOCOL_VERSION;
  type: TType;
  payload: TPayload;
}

export type PluginViewerLoadedMessage = Envelope<'plugin-viewer/loaded', PluginViewerLoadedPayload>;

export function createPluginViewerLoadedMessage(payload: PluginViewerLoadedPayload): PluginViewerLoadedMessage {
  return {
    protocol: PLUGIN_VIEWER_PROTOCOL,
    version: PLUGIN_VIEWER_PROTOCOL_VERSION,
    type: 'plugin-viewer/loaded',
    payload,
  };
}

function isEnvelope(message: unknown, type: string): boolean {
  if (typeof message !== 'object' || message === null) return false;
  const record = message as Record<string, unknown>;
  return (
    record.protocol === PLUGIN_VIEWER_PROTOCOL &&
    record.version === PLUGIN_VIEWER_PROTOCOL_VERSION &&
    record.type === type
  );
}

export function isPluginViewerReadyMessage(message: unknown): boolean {
  return isEnvelope(message, 'plugin-viewer/ready');
}

export function isPluginViewerRefreshMessage(message: unknown): boolean {
  return isEnvelope(message, 'plugin-viewer/refresh');
}
