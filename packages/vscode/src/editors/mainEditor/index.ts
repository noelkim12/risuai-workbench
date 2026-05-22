/**
 * Main custom text editor registration surface.
 * @file packages/vscode/src/editors/mainEditor/index.ts
 */

export { MainEditorProvider, registerMainEditorProviders } from './MainEditorProvider';
export {
  MAIN_EDITOR_FORMATS,
  MAIN_EDITOR_PROTOCOL,
  MAIN_EDITOR_PROTOCOL_VERSION,
  detectMainEditorFormat,
  getMainEditorPreferenceKey,
  type MainEditorFormatKind,
  type MainEditorPreferenceState,
} from './mainEditorTypes';
