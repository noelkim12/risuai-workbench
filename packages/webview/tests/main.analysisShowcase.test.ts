import { describe, expect, it } from 'vitest';
// biome-ignore lint/style/useNamingConvention: Vite ?raw import returns the file source string.
import MainSource from '../src/main.ts?raw';

describe('analysis-showcase mount branch', () => {
  it('mounts AnalysisShowcaseApp when webviewName is analysis-showcase', () => {
    expect(MainSource).toMatch(/webviewName === 'analysis-showcase'/);
    expect(MainSource).toMatch(/AnalysisShowcaseApp/);
  });
});
