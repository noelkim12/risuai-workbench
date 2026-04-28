import type { CancellationToken } from 'vscode-languageserver/node';
import type { BlockKind, BlockNode, Range } from 'risu-workbench-core';
import { walkAST } from 'risu-workbench-core';
import { FoldingRange, FoldingRangeParams } from 'vscode-languageserver/node';

import {
  fragmentAnalysisService,
  type FragmentAnalysisRequest,
  type FragmentAnalysisService,
} from '../../core';
import { isRequestCancelled } from '../../utils/request-cancellation';

const SUPPORTED_FOLDING_BLOCKS = new Set<BlockKind>([
  'when',
  'each',
  'escape',
  'pure',
  'puredisplay',
  'func',
]);

function createBlockFoldRange(block: BlockNode): Range | null {
  if (!block.closeRange || !SUPPORTED_FOLDING_BLOCKS.has(block.kind)) {
    return null;
  }

  return {
    start: block.openRange.start,
    end: block.closeRange.end,
  };
}

export class FoldingProvider {
  constructor(
    private readonly analysisService: FragmentAnalysisService = fragmentAnalysisService,
  ) {}

  provide(
    _params: FoldingRangeParams,
    request: FragmentAnalysisRequest,
    cancellationToken?: CancellationToken,
  ): FoldingRange[] {
    if (isRequestCancelled(cancellationToken)) {
      return [];
    }

    const analysis = this.analysisService.analyzeDocument(request, cancellationToken);
    if (!analysis) {
      return [];
    }

    const ranges: FoldingRange[] = [];

    for (const fragmentAnalysis of analysis.fragmentAnalyses) {
      if (isRequestCancelled(cancellationToken)) {
        return [];
      }

       if (!fragmentAnalysis.recovery.structureReliable) {
        continue;
      }

      walkAST(fragmentAnalysis.document.nodes, {
        visitBlock: (block) => {
          if (isRequestCancelled(cancellationToken)) {
            return;
          }

          const localRange = createBlockFoldRange(block);
          if (!localRange) {
            return;
          }

          const hostRange = fragmentAnalysis.mapper.toHostRange(request.text, localRange);
          if (!hostRange) {
            return;
          }

          if (hostRange.end.line <= hostRange.start.line) {
            return;
          }

          ranges.push({
            startLine: hostRange.start.line,
            startCharacter: hostRange.start.character,
            endLine: hostRange.end.line,
            endCharacter: hostRange.end.character,
          });
        },
      });
    }

    return ranges.sort(
      (left, right) =>
        left.startLine - right.startLine ||
        (left.startCharacter ?? 0) - (right.startCharacter ?? 0) ||
        left.endLine - right.endLine ||
        (left.endCharacter ?? 0) - (right.endCharacter ?? 0),
    );
  }
}
