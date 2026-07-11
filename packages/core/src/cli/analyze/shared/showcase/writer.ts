import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { analysisShowcaseSchema, type AnalysisShowcase } from '@/domain';

export const ANALYSIS_SHOWCASE_FILE_NAME = 'risu-analysis.showcase.json' as const;

export type ShowcaseWriterFs = {
  readonly mkdirSync?: typeof fs.mkdirSync;
  readonly rmSync: typeof fs.rmSync;
  readonly writeFileSync: typeof fs.writeFileSync;
  readonly renameSync: typeof fs.renameSync;
};

export type WriteAnalysisShowcaseOptions = {
  readonly analysisDir: string;
  readonly payload: AnalysisShowcase;
  readonly fsOps: ShowcaseWriterFs;
};

export function writeAnalysisShowcase(analysisDir: string, payload: AnalysisShowcase): void {
  writeAnalysisShowcaseWithFs({
    analysisDir,
    payload,
    fsOps: fs,
  });
}

export function writeAnalysisShowcaseWithFs(options: WriteAnalysisShowcaseOptions): void {
  const parsed = analysisShowcaseSchema.parse(options.payload);
  const targetPath = path.join(options.analysisDir, ANALYSIS_SHOWCASE_FILE_NAME);
  const tempPath = `${targetPath}.tmp-${process.pid}-${randomUUID()}`;
  const bytes = `${JSON.stringify(parsed, null, 2)}\n`;

  try {
    options.fsOps.mkdirSync?.(options.analysisDir, { recursive: true });
    options.fsOps.writeFileSync(tempPath, bytes, 'utf8');
    options.fsOps.renameSync(tempPath, targetPath);
  } catch (error) {
    options.fsOps.rmSync(tempPath, { force: true });
    throw error;
  }
}
