import { z } from 'zod';
import type { RisuLuaJsonValue } from '@risuai-workbench/core/node';

const workspaceRuntimeSourceSchema = z.object({
  kind: z.literal('workspace'),
  form: z.enum(['canonical', 'dist']),
  entryModuleId: z.string().min(1).optional(),
}).strict();

const contextRuntimeSourceSchema = z.object({
  kind: z.literal('context'),
  contextId: z.string().min(1),
  entryModuleId: z.string().min(1).optional(),
}).strict();

const inlineRuntimeSourceSchema = z.object({
  kind: z.literal('inline'),
  moduleId: z.string().min(1),
  source: z.string(),
}).strict();

export const runtimeSourceSchema = z.discriminatedUnion('kind', [
  workspaceRuntimeSourceSchema,
  contextRuntimeSourceSchema,
  inlineRuntimeSourceSchema,
]);

export type RuntimeSource = z.infer<typeof runtimeSourceSchema>;

export const runtimeContextPayloadSchema = z.object({
  entry: z.string().min(1),
  modules: z.record(z.string(), z.string()),
  scenarios: z.array(z.unknown()).optional(),
}).strict();

const jsonValueSchema: z.ZodType<RisuLuaJsonValue> = z.lazy(() => z.union([
  z.null(),
  z.boolean(),
  z.number().finite(),
  z.string(),
  z.array(jsonValueSchema),
  z.record(z.string(), jsonValueSchema),
]));

const hostProfileSchema = z.enum(['minimal', 'button-action', 'chat-state']);
const hostOverridesSchema = z.object({
  globals: z.record(z.string(), jsonValueSchema).optional(),
  chatVariables: z.record(z.string(), jsonValueSchema).optional(),
  globalVariables: z.record(z.string(), jsonValueSchema).optional(),
  state: z.record(z.string(), jsonValueSchema).optional(),
  randomSeed: z.number().int().optional(),
}).strict();

const executionLimitsSchema = z.object({
  timeoutMs: z.number().int().positive().optional(),
  instructionLimit: z.number().int().positive().optional(),
  hostCallLimit: z.number().int().positive().optional(),
  maxTraceEvents: z.number().int().positive().optional(),
}).strict();

const moduleTargetSchema = z.object({
  kind: z.literal('module'),
  moduleId: z.string().min(1).optional(),
}).strict();

const exportTargetSchema = z.object({
  kind: z.literal('export'),
  moduleId: z.string().min(1).optional(),
  exportName: z.string().min(1),
  args: z.array(jsonValueSchema).optional(),
}).strict();

const runtimeTargetSchema = z.discriminatedUnion('kind', [moduleTargetSchema, exportTargetSchema]);
const diagnosticIdSchema = z.enum([
  'RUNTIME_INVALID_REQUEST',
  'RUNTIME_MODULE_NOT_FOUND',
  'RUNTIME_COMPILE_ERROR',
  'RUNTIME_LUA_ERROR',
  'RUNTIME_TIMEOUT',
  'RUNTIME_ABORTED',
  'RUNTIME_INSTRUCTION_LIMIT',
  'RUNTIME_HOST_CALL_LIMIT',
  'RUNTIME_VALUE_LIMIT',
  'RUNTIME_ASSERTION_FAILED',
  'RUNTIME_INTERNAL_ERROR',
]);

const runtimeScenarioSchema = z.object({
  id: z.string().min(1),
  target: runtimeTargetSchema,
  hostProfile: hostProfileSchema.optional(),
  host: hostOverridesSchema.optional(),
  limits: executionLimitsSchema.optional(),
  expected: z.object({
    status: z.enum(['ok', 'error']).optional(),
    value: jsonValueSchema.optional(),
    state: z.record(z.string(), jsonValueSchema).optional(),
    diagnosticIds: z.array(diagnosticIdSchema).optional(),
  }).strict().optional(),
}).strict();

export const RuntimeDebugInputSchema = z.object({
  source: runtimeSourceSchema,
  moduleId: z.string().min(1).optional(),
  exportName: z.string().min(1),
  args: z.array(jsonValueSchema).optional(),
  hostProfile: hostProfileSchema.optional(),
  host: hostOverridesSchema.optional(),
  limits: executionLimitsSchema.optional(),
}).strict();

export const RuntimeSmokeInputSchema = z.object({
  source: runtimeSourceSchema,
  compareSource: runtimeSourceSchema.optional(),
  scenarios: z.array(runtimeScenarioSchema).min(1).max(20),
  hostProfile: hostProfileSchema.optional(),
  host: hostOverridesSchema.optional(),
  limits: executionLimitsSchema.optional(),
}).strict();

export type RuntimeDebugInput = z.infer<typeof RuntimeDebugInputSchema>;
export type RuntimeSmokeInput = z.infer<typeof RuntimeSmokeInputSchema>;
