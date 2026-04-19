import { extractCBSVarOps } from '../cbs/cbs';
import { estimateTokens } from './token-budget';

/** prompt-chain 단일 링크 */
export interface PromptChainLink {
  index: number;
  name: string;
  type: string;
  estimatedTokens: number;
  cbsReads: Set<string>;
  cbsWrites: Set<string>;
  satisfiedDeps: string[];
  unsatisfiedDeps: string[];
  hasConditional: boolean;
}

/** prompt-chain 이슈 */
export interface PromptChainIssue {
  type: 'unsatisfied-dependency' | 'late-write' | 'redundant-write' | 'empty-link';
  severity: 'info' | 'warning';
  linkIndex: number;
  message: string;
}

/** prompt-chain 분석 결과 */
export interface PromptChainResult {
  chain: PromptChainLink[];
  totalVariables: number;
  selfContainedVars: string[];
  externalDeps: string[];
  totalEstimatedTokens: number;
  issues: PromptChainIssue[];
}

const CBS_CONDITIONAL_RE = /\{\{#(?:if|when)::/;

/** analyzePromptChain analyzes ordered prompt/template links for dependency risks */
export function analyzePromptChain(
  templates: Array<{ name: string; text: string; type: string }>,
): PromptChainResult {
  const chain: PromptChainLink[] = [];
  const issues: PromptChainIssue[] = [];
  const writtenSoFar = new Set<string>();
  const allReads = new Set<string>();
  const allWrites = new Set<string>();
  const firstReadIndex = new Map<string, number>();
  const firstWriteIndex = new Map<string, number>();
  const lastWriteWithoutRead = new Map<string, { index: number; name: string }>();

  for (let index = 0; index < templates.length; index += 1) {
    const template = templates[index]!;
    if (!template.text.trim()) {
      issues.push({
        type: 'empty-link',
        severity: 'info',
        linkIndex: index,
        message: `Template "${template.name}" (index ${index}) is empty.`,
      });
    }

    const ops = extractCBSVarOps(template.text);
    const estimatedTokens = estimateTokens(template.text);
    const hasConditional = CBS_CONDITIONAL_RE.test(template.text);
    const satisfiedDeps: string[] = [];
    const unsatisfiedDeps: string[] = [];

    for (const varName of ops.reads) {
      allReads.add(varName);
      if (!firstReadIndex.has(varName)) {
        firstReadIndex.set(varName, index);
      }

      if (writtenSoFar.has(varName)) {
        satisfiedDeps.push(varName);
      } else {
        unsatisfiedDeps.push(varName);
      }

      lastWriteWithoutRead.delete(varName);
    }

    for (const varName of ops.writes) {
      allWrites.add(varName);
      if (!firstWriteIndex.has(varName)) {
        firstWriteIndex.set(varName, index);
      }

      const previousWrite = lastWriteWithoutRead.get(varName);
      if (previousWrite) {
        issues.push({
          type: 'redundant-write',
          severity: 'info',
          linkIndex: previousWrite.index,
          message: `Variable "${varName}" written by "${previousWrite.name}" (index ${previousWrite.index}) is overwritten by "${template.name}" (index ${index}) without being read.`,
        });
      }

      lastWriteWithoutRead.set(varName, { index, name: template.name });
      writtenSoFar.add(varName);
    }

    if (unsatisfiedDeps.length > 0) {
      issues.push({
        type: 'unsatisfied-dependency',
        severity: 'warning',
        linkIndex: index,
        message: `Template "${template.name}" reads unresolved variables: ${unsatisfiedDeps.join(', ')}.`,
      });
    }

    chain.push({
      index,
      name: template.name,
      type: template.type,
      estimatedTokens,
      cbsReads: ops.reads,
      cbsWrites: ops.writes,
      satisfiedDeps,
      unsatisfiedDeps,
      hasConditional,
    });
  }

  for (const [varName, writeIndex] of firstWriteIndex.entries()) {
    const readIndex = firstReadIndex.get(varName);
    if (readIndex !== undefined && writeIndex > readIndex) {
      issues.push({
        type: 'late-write',
        severity: 'warning',
        linkIndex: writeIndex,
        message: `Variable "${varName}" is first read at index ${readIndex} but first written at index ${writeIndex}. The read may see an empty value.`,
      });
    }
  }

  const selfContainedVars = [...allReads].filter((varName) => allWrites.has(varName));
  const externalDeps = [...allReads].filter((varName) => !allWrites.has(varName));
  const totalVariables = new Set([...allReads, ...allWrites]).size;
  const totalEstimatedTokens = chain.reduce((sum, link) => sum + link.estimatedTokens, 0);

  return {
    chain,
    totalVariables,
    selfContainedVars,
    externalDeps,
    totalEstimatedTokens,
    issues,
  };
}
