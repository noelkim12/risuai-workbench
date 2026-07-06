import { describe, expect, it } from 'vitest';
import mainSource from '../../../src/main.ts?raw';
import sidebarSource from '../../../src/lib/components/SidebarView.svelte?raw';

describe('Artifact Browser import webview/source contract', () => {
  it('keeps the webview file picker while avoiding legacy whole-file base64 payloads', () => {
    expect(sidebarSource).toContain('type="file"');
    expect(sidebarSource).toContain('openImportPicker');
    expect(sidebarSource).toContain('importSelectedFile');
    expect(sidebarSource).toContain('onImportArtifact(selectedFile)');
    expect(mainSource).not.toContain('dataBase64');
  });

  it('streams selected files through chunk import messages', () => {
    expect(mainSource).toContain('IMPORT_CHUNK_BYTES');
    expect(mainSource).toContain('file.slice(');
    expect(mainSource).toContain('createArtifactBrowserImportArtifactChunkMessage');
    expect(mainSource).toContain('chunkBase64');
    expect(mainSource).not.toContain('file.arrayBuffer()');
  });

  it('preserves the File-typed import handler across SidebarView and main', () => {
    expect(sidebarSource).toContain('onImportArtifact: (file: File)');
    expect(mainSource).toContain('importArtifact(file: File)');
  });

  it('preserves import UI behavior: disabled while importing, status, spinner clears on cards', () => {
    expect(sidebarSource).toContain('disabled={importing}');
    expect(mainSource).toContain('importing.set(true)');
    // spinner clears when the host replies with refreshed cards, as today
    expect(mainSource).toContain('importing.set(false)');
  });
});
