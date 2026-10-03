import { z } from 'zod';
import { asRecord } from '../types';

export const characterLoreSettingsSchema = z.object({
  scanDepth: z.number(),
  tokenBudget: z.number(),
  recursiveScanning: z.boolean(),
  fullWordMatching: z.boolean(),
});

export type CharacterLoreSettings = z.infer<typeof characterLoreSettingsSchema>;

export function parseCharacterLoreSettings(value: unknown): CharacterLoreSettings | null {
  return characterLoreSettingsSchema.nullable().parse(value ?? null);
}

export function readCharbookLoreSettings(value: unknown): CharacterLoreSettings | null {
  const book = asRecord(value);
  if (book?.scan_depth == null || book.token_budget == null || book.recursive_scanning == null) {
    return null;
  }
  return parseCharacterLoreSettings({
    scanDepth: book.scan_depth,
    tokenBudget: book.token_budget,
    recursiveScanning: book.recursive_scanning,
    fullWordMatching: asRecord(book.extensions)?.risu_fullWordMatching ?? false,
  });
}

export function toCharbookLoreSettings(settings: CharacterLoreSettings | null) {
  return settings === null ? {} : {
    scan_depth: settings.scanDepth,
    token_budget: settings.tokenBudget,
    recursive_scanning: settings.recursiveScanning,
    extensions: { risu_fullWordMatching: settings.fullWordMatching },
  };
}
