import { describe, expect, it } from 'vitest';
import {
  createDefaultSimulatorProfile,
  createDefaultMainEditorSimulatorProfile,
  isSimulatorProfile,
  mergeSimulatorProfileVariables,
  normalizeSimulatorProfile,
} from '../../src/domain/editor';

describe('main editor simulator profile contracts', () => {
  it('creates a JSON-serializable default profile with empty required maps', () => {
    const profile = createDefaultSimulatorProfile();

    expect(JSON.parse(JSON.stringify(profile))).toEqual(profile);
    expect(profile).toEqual({
      id: 'default',
      name: 'Default',
      target: { moduleIds: [] },
      variables: {
        chatVariables: {},
        globalVariables: {},
        toggleValues: {},
        tempVariables: {},
      },
      chatHistory: [],
      htmlContext: { enabledHtmlDocumentUris: [] },
    });
  });

  it('exposes the main editor default profile API name', () => {
    expect(createDefaultMainEditorSimulatorProfile()).toEqual(createDefaultSimulatorProfile());
  });

  it('keeps preview overrides ahead of saved profile variables', () => {
    const merged = mergeSimulatorProfileVariables(
      {
        chatVariables: { mood: 'calm', name: 'profile' },
        globalVariables: { weather: 'rain' },
        toggleValues: { debug: false },
        tempVariables: { scratch: 'profile' },
      },
      {
        chatVariables: { mood: 'focused' },
        globalVariables: { weather: 'sun' },
        toggleValues: { debug: true },
        tempVariables: { scratch: 'preview' },
      },
    );

    expect(merged.chatVariables).toEqual({ mood: 'focused', name: 'profile' });
    expect(merged.globalVariables).toEqual({ weather: 'sun' });
    expect(merged.toggleValues).toEqual({ debug: true });
    expect(merged.tempVariables).toEqual({ scratch: 'preview' });
  });

  it('merges variables when the saved profile object is passed directly', () => {
    const profile = createDefaultMainEditorSimulatorProfile();
    profile.variables.chatVariables.mood = 'profile';

    const merged = mergeSimulatorProfileVariables(profile, {
      chatVariables: { mood: 'preview' },
    });

    expect(merged.chatVariables).toEqual({ mood: 'preview' });
  });

  it('normalizes corrupted profile data to the default profile', () => {
    expect(isSimulatorProfile({ ...createDefaultSimulatorProfile(), variables: { chatVariables: { mood: 1 } } })).toBe(false);
    expect(normalizeSimulatorProfile({ id: 'broken' })).toEqual(createDefaultSimulatorProfile());
  });
});
