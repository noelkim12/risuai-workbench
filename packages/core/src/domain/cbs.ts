export interface CBSVarOps {
  reads: Set<string>;
  writes: Set<string>;
}

export function extractCBSVarOps(text: string): CBSVarOps {
  const reads = new Set<string>();
  const writes = new Set<string>();
  if (typeof text !== 'string' || text.length === 0) return { reads, writes };

  for (const match of text.matchAll(/\{\{(getvar|setvar|addvar)::([^}:]+)/g)) {
    const op = match[1];
    const key = match[2].trim();
    if (!key) continue;
    if (op === 'getvar') reads.add(key);
    else writes.add(key);
  }

  return { reads, writes };
}
