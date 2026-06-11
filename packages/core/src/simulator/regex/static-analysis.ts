/**
 * Heuristic regex risk analysis powered by regexpp.
 * Findings are warnings about risk possibility, not proof of exploitability.
 * @file packages/core/src/simulator/regex/static-analysis.ts
 */
import { RegExpParser, visitRegExpAST, type AST } from 'regexpp';
import type { RegexRiskFindingDto } from './types';

export interface RegexRiskAnalysisInput {
  pattern: string;
  flags: string;
  maxPatternLength: number;
}

export function analyzeRegexRisks(input: RegexRiskAnalysisInput): RegexRiskFindingDto[] {
  if (input.pattern.length > input.maxPatternLength) {
    return [
      createFinding(
        'REGEX_PARSE_ERROR',
        'error',
        'high',
        `Pattern length ${input.pattern.length} exceeds maxPatternLength ${input.maxPatternLength}.`,
      ),
    ];
  }

  let pattern: AST.Pattern;
  try {
    pattern = new RegExpParser({ ecmaVersion: 2022 }).parsePattern(
      input.pattern,
      0,
      input.pattern.length,
      input.flags.includes('u') || input.flags.includes('v'),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to parse regular expression.';
    return [createFinding('REGEX_PARSE_ERROR', 'error', 'high', message)];
  }

  const findings: RegexRiskFindingDto[] = [];
  visitRegExpAST(pattern, {
    onQuantifierEnter(node) {
      if (containsQuantifier(node.element)) {
        findings.push(
          createFinding(
            'NESTED_QUANTIFIER',
            'warning',
            'high',
            'Nested quantifiers can cause catastrophic backtracking.',
            node.start,
            node.end,
          ),
        );
      }
      if (containsAnyCharacter(node.element)) {
        findings.push(
          createFinding(
            'REPEATED_WILDCARD',
            'warning',
            'medium',
            'A repeated wildcard can scan large inputs and backtrack heavily.',
            node.start,
            node.end,
          ),
        );
      }
      if (containsAmbiguousAlternation(node.element)) {
        findings.push(
          createFinding(
            'AMBIGUOUS_ALTERNATION',
            'warning',
            'medium',
            'Alternatives with prefix overlap under repetition can backtrack heavily.',
            node.start,
            node.end,
          ),
        );
      }
    },
    onBackreferenceEnter(node) {
      findings.push(
        createFinding(
          'BACKREFERENCE',
          'warning',
          'medium',
          'Backreferences make regex performance harder to reason about.',
          node.start,
          node.end,
        ),
      );
    },
  });

  if (hasGreedyDotPrefix(pattern)) {
    findings.push(
      createFinding(
        'GREEDY_DOT_PREFIX',
        'info',
        'low',
        'Greedy dot before a literal suffix can become slow on long failing inputs.',
      ),
    );
  }

  if (input.flags.includes('g') && canMatchEmpty(pattern)) {
    findings.push(
      createFinding(
        'GLOBAL_EMPTY_MATCH',
        'warning',
        'medium',
        'This global regex can match an empty string; preview runners must advance lastIndex manually.',
      ),
    );
  }

  return dedupeFindings(findings);
}

function containsQuantifier(element: AST.Element): boolean {
  let found = false;
  visitRegExpAST(element, {
    onQuantifierEnter() {
      found = true;
    },
  });
  return found;
}

function containsAnyCharacter(element: AST.Element): boolean {
  let found = false;
  visitRegExpAST(element, {
    onCharacterSetEnter(node) {
      if (node.kind === 'any') {
        found = true;
      }
    },
  });
  return found;
}

function containsAmbiguousAlternation(element: AST.Element): boolean {
  let found = false;
  visitRegExpAST(element, {
    onAlternativeEnter(node) {
      if (hasPrefixOverlappingSiblings(node)) {
        found = true;
      }
    },
  });
  return found;
}

function hasPrefixOverlappingSiblings(alternative: AST.Alternative): boolean {
  const parent = alternative.parent;
  if (parent.type !== 'CapturingGroup' && parent.type !== 'Group') {
    return false;
  }

  const rawAlternatives = parent.alternatives.map((candidate) => candidate.raw).filter(Boolean);
  for (const left of rawAlternatives) {
    for (const right of rawAlternatives) {
      if (left !== right && right.startsWith(left)) {
        return true;
      }
    }
  }
  return false;
}

function hasGreedyDotPrefix(pattern: AST.Pattern): boolean {
  return pattern.alternatives.some((alternative) => {
    const elements = alternative.elements.filter((element) => !isEdgeAssertion(element));
    const first = elements[0];
    return first?.type === 'Quantifier' && first.greedy && first.element.type === 'CharacterSet' && first.element.kind === 'any' && elements.length > 1;
  });
}

function canMatchEmpty(pattern: AST.Pattern): boolean {
  return pattern.alternatives.some((alternative) => alternative.elements.every(canElementMatchEmpty));
}

function canElementMatchEmpty(element: AST.Element): boolean {
  if (isEdgeAssertion(element)) {
    return true;
  }
  if (element.type === 'Assertion') {
    return true;
  }
  if (element.type === 'Quantifier') {
    return element.min === 0 || canElementMatchEmpty(element.element);
  }
  if (element.type === 'Group' || element.type === 'CapturingGroup') {
    return element.alternatives.some((alternative) => alternative.elements.every(canElementMatchEmpty));
  }
  return false;
}

function isEdgeAssertion(element: AST.Element): boolean {
  return element.type === 'Assertion' && (element.kind === 'start' || element.kind === 'end');
}

function createFinding(
  code: RegexRiskFindingDto['code'],
  severity: RegexRiskFindingDto['severity'],
  confidence: RegexRiskFindingDto['confidence'],
  message: string,
  start?: number,
  end?: number,
): RegexRiskFindingDto {
  return {
    code,
    severity,
    confidence,
    message,
    ...(start !== undefined && end !== undefined ? { range: { start, end } } : {}),
  };
}

function dedupeFindings(findings: RegexRiskFindingDto[]): RegexRiskFindingDto[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.code}:${finding.range?.start ?? ''}:${finding.range?.end ?? ''}:${finding.message}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
