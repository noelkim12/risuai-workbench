/**
 * Tool surface baseline snapshot script.
 * @file packages/risuai-workbench-mcp/src/dev/snapshot-tool-surface.ts
 *
 * Spawns the local MCP server over stdio and captures the exact `tools/list`
 * response to produce a repeatable measurement report.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

/** Token estimation heuristic: ~4 bytes per token for typical ASCII/UTF-8 text. */
const BYTES_PER_TOKEN_ESTIMATE = 4;

/** Default cap for the largest-tools list. */
const DEFAULT_LARGEST_CAP = 20;

/** Default token growth tolerance for --check mode (5%). */
const DEFAULT_TOKEN_TOLERANCE = 0.05;

export interface ToolSurfaceReport {
  schema: string;
  generatedAt: string;
  packageName: string;
  packageVersion: string;
  toolCount: number;
  rawBytes: number;
  estimatedTokens: number;
  largestTools: Array<{ name: string; bytes: number }>;
  tools: Array<{
    name: string;
    description?: string;
    inputSchema?: unknown;
    outputSchema?: unknown;
    annotations?: unknown;
  }>;
}

/**
 * Build a deterministic, sorted tool list from the MCP server.
 */
export async function buildToolSurfaceReport(options: {
  binPath?: string;
  root?: string;
  packageName?: string;
  packageVersion?: string;
} = {}): Promise<ToolSurfaceReport> {
  const binPath = options.binPath ?? path.resolve(__dirname, '../../bin/risuai-workbench-mcp.js');
  const root = options.root ?? process.cwd();
  const packageName = options.packageName ?? 'risuai-workbench-mcp';
  const packageVersion = options.packageVersion ?? '0.1.0';

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [binPath, '--stdio', '--root', root],
    stderr: 'pipe',
  });

  const client = new Client({
    name: 'snapshot-tool-surface',
    version: '0.1.0',
  });

  let toolList: Awaited<ReturnType<typeof client.listTools>>;

  try {
    await client.connect(transport);
    toolList = await client.listTools();
  } finally {
    await client.close();
  }

  const tools = toolList.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    outputSchema: (tool as Record<string, unknown>).outputSchema as unknown,
    annotations: tool.annotations,
  }));

  // Deterministic ordering by name
  tools.sort((a, b) => a.name.localeCompare(b.name));

  const serialized = JSON.stringify(tools, null, 2);
  const rawBytes = Buffer.byteLength(serialized, 'utf8');
  const estimatedTokens = Math.ceil(rawBytes / BYTES_PER_TOKEN_ESTIMATE);

  const toolSizes = tools.map((tool) => ({
    name: tool.name,
    bytes: Buffer.byteLength(JSON.stringify(tool), 'utf8'),
  }));

  toolSizes.sort((a, b) => b.bytes - a.bytes);

  const largestTools = toolSizes.slice(0, DEFAULT_LARGEST_CAP);

  return {
    schema: 'risuai-workbench-mcp.tool-surface-report',
    generatedAt: new Date().toISOString(),
    packageName,
    packageVersion,
    toolCount: tools.length,
    rawBytes,
    estimatedTokens,
    largestTools,
    tools,
  };
}

/**
 * Serialize a report to a deterministic JSON string.
 */
export function serializeReport(report: ToolSurfaceReport): string {
  return JSON.stringify(report, null, 2) + '\n';
}

/**
 * Write the report to the conventional reports directory.
 */
export async function writeReportToFile(
  report: ToolSurfaceReport,
  reportsDir: string,
): Promise<{ reportPath: string; baselinePath: string }> {
  await mkdir(reportsDir, { recursive: true });

  const timestamp = report.generatedAt.replace(/[:.]/g, '-');
  const reportPath = path.join(reportsDir, `tool-surface-${timestamp}.json`);
  const baselinePath = path.join(reportsDir, 'baseline.json');

  await writeFile(reportPath, serializeReport(report), 'utf8');

  return { reportPath, baselinePath };
}

/**
 * Check mode: compare current surface against a baseline.
 *
 * If no baseline exists, writes the current report as the baseline
 * and returns ok (first-run semantics).
 *
 * If a baseline exists, compares token count and tool count.
 * Returns an error message string if the budget is exceeded,
 * or `null` if within tolerance.
 */
export async function checkSurfaceAgainstBaseline(
  report: ToolSurfaceReport,
  baselinePath: string,
  tolerance = DEFAULT_TOKEN_TOLERANCE,
): Promise<string | null> {
  if (!existsSync(baselinePath)) {
    await writeFile(baselinePath, serializeReport(report), 'utf8');
    return null;
  }

  const baselineRaw = await readFile(baselinePath, 'utf8');
  const baseline = JSON.parse(baselineRaw) as ToolSurfaceReport;

  const tokenDelta = report.estimatedTokens - baseline.estimatedTokens;
  const tokenGrowth = baseline.estimatedTokens > 0
    ? tokenDelta / baseline.estimatedTokens
    : 0;

  const toolDelta = report.toolCount - baseline.toolCount;

  if (tokenGrowth > tolerance) {
    return (
      `Token budget exceeded: ${report.estimatedTokens} tokens ` +
      `(+${(tokenGrowth * 100).toFixed(1)}%) vs baseline ${baseline.estimatedTokens}. ` +
      `Tool delta: ${toolDelta >= 0 ? '+' : ''}${toolDelta}.`
    );
  }

  return null;
}

/**
 * CLI entry point.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isCheck = args.includes('--check');
  const reportsDir = path.resolve(process.cwd(), 'reports/mcp-tool-surface');

  const report = await buildToolSurfaceReport();
  const { reportPath, baselinePath } = await writeReportToFile(report, reportsDir);

  // eslint-disable-next-line no-console
  console.log(`Report: ${reportPath}`);
  // eslint-disable-next-line no-console
  console.log(`Tools: ${report.toolCount} | Bytes: ${report.rawBytes} | Tokens: ${report.estimatedTokens}`);
  // eslint-disable-next-line no-console
  console.log('Largest tools:');
  for (const t of report.largestTools.slice(0, 5)) {
    // eslint-disable-next-line no-console
    console.log(`  ${t.name}: ${t.bytes} bytes`);
  }

  if (isCheck) {
    const errorMessage = await checkSurfaceAgainstBaseline(report, baselinePath);
    if (errorMessage) {
      // eslint-disable-next-line no-console
      console.error(`CHECK FAILED: ${errorMessage}`);
      process.exit(1);
    }
    // eslint-disable-next-line no-console
    console.log('CHECK OK: surface within baseline tolerance.');
  }
}

if (require.main === module) {
  main().catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}
