/**
 * Zod input schemas for core workflow actions.
 * Colocated to keep adapter code thin.
 * @file packages/risuai-workbench-mcp/src/actions/schemas/core-workflow-schemas.ts
 */

import { z } from 'zod';

export const RunExtractInputSchema = z.object({
  sourcePath: z.string(),
  outDir: z.string().optional(),
  type: z.enum(['character', 'module', 'preset']).optional(),
  postValidate: z.boolean().optional(),
  risuluaDomainGeneration: z.enum(['report', 'validated']).optional(),
  risuluaRecovery: z.enum(['none', 'full-source']).optional(),
  risuluaSplit: z.enum(['none', 'report', 'coarse', 'module-table']).optional(),
  risuluaMode: z.literal('modular').optional(),
}).strict();
