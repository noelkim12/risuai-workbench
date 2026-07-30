/**
 * MCP JSON Schema dialect adapter.
 * @file packages/risuai-workbench-mcp/src/contracts/json-schema-dialect.ts
 */

import { z } from 'zod';

export const MCP_JSON_SCHEMA_DIALECT = 'https://json-schema.org/draft/2020-12/schema';

/**
 * Preserve Zod runtime validation while making the MCP SDK advertise JSON Schema 2020-12.
 * The SDK currently requests Draft-07 during tools/list conversion, so the schema-level
 * converter override keeps the protocol contract on MCP's required dialect.
 */
export function withMcpJsonSchemaDialect<TSchema extends z.ZodObject>(
  schema: TSchema,
  io: 'input' | 'output',
): TSchema {
  const jsonSchema = {
    ...z.toJSONSchema(schema, { io, target: 'draft-2020-12' }),
    type: 'object' as const,
  };
  schema._zod.toJSONSchema = () => structuredClone(jsonSchema);
  return schema;
}
