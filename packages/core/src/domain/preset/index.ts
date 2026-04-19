import { asRecord, type GenericRecord } from '../types';

/** 순수 preset 객체에서 대표 prompt 텍스트 필드를 반환한다. */
export function getPresetPromptTextsFromPreset(
  preset: unknown,
): Array<{ name: 'main' | 'jailbreak' | 'global_note'; text: string }> {
  const record = asRecord(preset);
  if (!record) return [];

  const fields: Array<{ name: 'main' | 'jailbreak' | 'global_note'; value: unknown }> = [
    { name: 'main', value: record.mainPrompt },
    { name: 'jailbreak', value: record.jailbreak },
    { name: 'global_note', value: record.globalNote },
  ];

  return fields
    .filter((field): field is { name: 'main' | 'jailbreak' | 'global_note'; value: string } => typeof field.value === 'string' && field.value.length > 0)
    .map((field) => ({ name: field.name, text: field.value }));
}

/** 순수 preset 객체에서 promptTemplate 항목 배열을 반환한다. */
export function getPresetPromptTemplateItemsFromPreset(preset: unknown): GenericRecord[] {
  const record = asRecord(preset);
  if (!record || !Array.isArray(record.promptTemplate)) return [];
  return record.promptTemplate
    .map((item) => asRecord(item))
    .filter((item): item is GenericRecord => item != null);
}
