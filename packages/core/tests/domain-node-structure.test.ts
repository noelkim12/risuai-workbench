import { describe, expect, it } from 'vitest';

import * as domain from '@/domain';
import {
  buildRisuFolderMap,
  extractCBSVarOps,
  sanitizeFilename,
} from '@/domain';
import { ensureDir, parseCardFile } from '@/node';

describe('packages/core Phase 1 domain/node structure', () => {
  it('provides a domain entry for pure helpers only', () => {
    expect(domain.buildRisuFolderMap).toBe(buildRisuFolderMap);
    expect(domain.extractCBSVarOps).toBe(extractCBSVarOps);
    expect(domain.sanitizeFilename).toBe(sanitizeFilename);
    expect('parseCardFile' in domain).toBe(false);
    expect('ensureDir' in domain).toBe(false);
  });

  it('keeps node-only helpers on the node entry', () => {
    expect(parseCardFile).toBeTypeOf('function');
    expect(ensureDir).toBeTypeOf('function');
  });
});
