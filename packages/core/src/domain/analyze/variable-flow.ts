import type { ElementCBSData } from './correlation';
import { PHASE_MAP, PipelinePhase } from './constants';
import type { VarEvent, VarFlowEntry, VarFlowIssue, VarFlowResult } from './variable-flow-types';

/** analyzeVariableFlow builds a pipeline-aware CBS variable flow graph */
export function analyzeVariableFlow(
  elements: ElementCBSData[],
  defaultVariables: Record<string, string>,
): VarFlowResult {
  const allEvents: VarEvent[] = [];

  for (const element of elements) {
    const phase = PHASE_MAP[element.elementType] ?? PipelinePhase.CBS_EXPANSION;

    for (const varName of element.reads) {
      allEvents.push({
        varName,
        action: 'read',
        phase,
        elementType: element.elementType,
        elementName: element.elementName,
        executionOrder: element.executionOrder,
      });
    }
    for (const varName of element.writes) {
      allEvents.push({
        varName,
        action: 'write',
        phase,
        elementType: element.elementType,
        elementName: element.elementName,
        executionOrder: element.executionOrder,
      });
    }
  }

  const eventMap = new Map<string, VarEvent[]>();
  for (const event of allEvents) {
    const bucket = eventMap.get(event.varName) ?? [];
    bucket.push(event);
    eventMap.set(event.varName, bucket);
  }

  const variables: VarFlowEntry[] = [];
  for (const [varName, events] of [...eventMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const orderedEvents = [...events].sort(compareRuntimeOrder);
    const defaultValue = defaultVariables[varName] ?? null;
    variables.push({
      varName,
      events: orderedEvents,
      defaultValue,
      issues: detectIssues(varName, orderedEvents, defaultValue),
    });
  }

  const byIssueType: Record<string, number> = {};
  let withIssues = 0;
  for (const variable of variables) {
    if (variable.issues.length > 0) {
      withIssues += 1;
    }
    for (const issue of variable.issues) {
      byIssueType[issue.type] = (byIssueType[issue.type] ?? 0) + 1;
    }
  }

  return {
    variables,
    summary: {
      totalVariables: variables.length,
      withIssues,
      byIssueType,
    },
  };
}

function detectIssues(
  varName: string,
  events: VarEvent[],
  defaultValue: string | null,
): VarFlowIssue[] {
  const issues: VarFlowIssue[] = [];
  const reads = events.filter((event) => event.action === 'read');
  const writes = events.filter((event) => event.action === 'write');
  let hasValue = defaultValue !== null;

  for (const event of events) {
    if (event.action === 'read' && !hasValue) {
      issues.push({
        type: 'uninitialized-read',
        severity: 'warning',
        message: `Variable "${varName}" may be read before it is initialized.`,
        events: [event],
      });
      break;
    }
    if (event.action === 'write') {
      hasValue = true;
    }
  }

  if (writes.length > 0 && reads.length === 0) {
    issues.push({
      type: 'write-only',
      severity: 'info',
      message: `Variable "${varName}" is written but never read.`,
      events: writes,
    });
  }

  const uniqueWriters = [...new Set(writes.map((event) => `${event.elementType}:${event.elementName}`))];
  if (uniqueWriters.length >= 2) {
    issues.push({
      type: 'overwrite-conflict',
      severity: 'warning',
      message: `Variable "${varName}" is written by multiple elements: ${uniqueWriters.join(', ')}.`,
      events: writes,
    });
  }

  const seenPairs = new Set<string>();
  for (const read of reads) {
    for (const write of writes) {
      if (!isDefinitivelyLater(write, read)) continue;
      const pairKey = `${write.elementType}:${write.elementName}->${read.elementType}:${read.elementName}`;
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);
      issues.push({
        type: 'phase-order-risk',
        severity: 'warning',
        message: `Variable "${varName}" is written by "${write.elementName}" after "${read.elementName}" may already read it.`,
        events: [write, read],
      });
    }
  }

  return issues;
}

function compareRuntimeOrder(left: VarEvent, right: VarEvent): number {
  if (left.phase !== right.phase) {
    return left.phase - right.phase;
  }

  if (left.executionOrder !== undefined && right.executionOrder !== undefined) {
    if (left.executionOrder !== right.executionOrder) {
      return right.executionOrder - left.executionOrder;
    }
  }

  if (left.action !== right.action) {
    return left.action === 'write' ? -1 : 1;
  }

  return left.elementName.localeCompare(right.elementName);
}

function isDefinitivelyLater(write: VarEvent, read: VarEvent): boolean {
  if (write.phase !== read.phase) {
    return write.phase > read.phase;
  }

  if (write.executionOrder !== undefined && read.executionOrder !== undefined) {
    return write.executionOrder < read.executionOrder;
  }

  return false;
}
