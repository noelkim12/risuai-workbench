/**
 * Browser-safe {{raw}}/{{path}} asset CBS extraction, matching, and substitution.
 * Mirrors RisuAI's asset name matching order for regex preview rendering.
 * @file packages/core/src/simulator/regex/asset-resolver.ts
 */

export const ASSET_NAME_MAX_DIFFERENCE = 4;

const ASSET_TAG_SOURCE = '\\{\\{(?:raw|path)::(.+?)\\}\\}';
const MEDIA_EXTENSIONS = [
  'webp',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'mp4',
  'webm',
  'avi',
  'm4p',
  'm4v',
  'mp3',
  'wav',
  'ogg',
] as const;

export interface ResolvedAssetMatch {
  readonly matchedName: string;
}

function assetTagPattern(): RegExp {
  return new RegExp(ASSET_TAG_SOURCE, 'gms');
}

export function trimmer(value: string): string {
  let output = value;
  for (const extension of MEDIA_EXTENSIONS) {
    if (output.endsWith(`.${extension}`)) {
      output = output.substring(0, output.length - extension.length - 1);
      break;
    }
  }
  return output.trim().replace(/[_ \-.]/g, '');
}

export function getDistance(a: string, b: string): number {
  const height = a.length + 1;
  const width = b.length + 1;
  const distances = new Int16Array(height * width);

  for (let row = 0; row < height; row += 1) distances[row * width] = row;
  for (let column = 0; column < width; column += 1) distances[column] = column;

  for (let row = 1; row < height; row += 1) {
    for (let column = 1; column < width; column += 1) {
      distances[row * width + column] = Math.min(
        distances[(row - 1) * width + (column - 1)] + (a.charAt(row - 1) === b.charAt(column - 1) ? 0 : 1),
        distances[(row - 1) * width + column] + 1,
        distances[row * width + (column - 1)] + 1,
      );
    }
  }

  return distances[height * width - 1];
}

export function extractAssetCbsNames(output: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const match of output.matchAll(assetTagPattern())) {
    const name = match[1];
    if (name === undefined || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }

  return names;
}

export function resolveAssetName(
  name: string,
  candidates: readonly string[],
  maxDiff: number = ASSET_NAME_MAX_DIFFERENCE,
): ResolvedAssetMatch | null {
  const lowerName = name.toLocaleLowerCase();

  for (const candidate of candidates) {
    if (candidate.toLocaleLowerCase() === lowerName) return { matchedName: candidate };
  }

  const trimmedTarget = trimmer(lowerName);
  for (const candidate of candidates) {
    if (trimmer(candidate.toLocaleLowerCase()) === trimmedTarget) return { matchedName: candidate };
  }

  let closest: string | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const distance = getDistance(trimmedTarget, trimmer(candidate.toLocaleLowerCase()));
    if (distance < closestDistance) {
      closestDistance = distance;
      closest = candidate;
    }
  }

  if (closest === null || closestDistance > maxDiff) return null;
  return { matchedName: closest };
}

// Private-use-area delimiter: survives the CBS dry-run as plain text and
// cannot collide with regular document content.
const ASSET_MASK_DELIMITER = '\uE000';
const ASSET_MASK_TOKEN_PATTERN = /\uE000(\d+)\uE000/g;

export interface MaskedAssetCbs {
  readonly masked: string;
  readonly tags: readonly string[];
}

export function maskAssetCbs(source: string): MaskedAssetCbs {
  const tags: string[] = [];
  const masked = source.replace(assetTagPattern(), (whole: string) => {
    const token = `${ASSET_MASK_DELIMITER}${tags.length}${ASSET_MASK_DELIMITER}`;
    tags.push(whole);
    return token;
  });
  return { masked, tags };
}

export function unmaskAssetCbs(masked: string, tags: readonly string[]): string {
  if (tags.length === 0) return masked;
  return masked.replace(ASSET_MASK_TOKEN_PATTERN, (whole: string, index: string) => tags[Number(index)] ?? whole);
}

export function substituteAssetCbs(output: string, resolved: Record<string, string | null>): string {
  return output.replace(assetTagPattern(), (whole: string, name: string) => {
    if (!(name in resolved)) return whole;
    return resolved[name] ?? '';
  });
}
