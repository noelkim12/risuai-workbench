/**
 * Helpers for deriving a usable sample input from a .risuregex @@@ IN pattern.
 * @file packages/webview/src/lib/components/editor/regex/regexSampleInput.ts
 */

const GENERIC_CAPTURE_SAMPLE = 'value';

const LABEL_SAMPLE_BY_KEYWORD: Array<[keyword: string, sample: string]> = [
  ['crowd', 'list'],
  ['주변', 'list'],
  ['list', 'list'],
  ['chikan', 'name'],
  ['name', 'name'],
  ['이름', 'name'],
  ['positioning', 'current'],
  ['position', 'current'],
  ['current', 'current'],
  ['현재', 'current'],
];

export function generateRegexSampleInput(inText: string): string {
  const pattern = inText.trim();
  if (!pattern) return '';
  return new RegexSampleBuilder(pattern).build().trim();
}

class RegexSampleBuilder {
  private index = 0;
  private output = '';

  constructor(private readonly pattern: string) {}

  build(stopChar?: string): string {
    while (this.index < this.pattern.length) {
      const char = this.pattern[this.index];
      if (stopChar && char === stopChar) break;
      if (char === '\\') {
        this.output += this.readEscapeSample();
        this.skipQuantifier();
        continue;
      }
      if (char === '(') {
        this.output += this.readGroupSample();
        this.skipQuantifier();
        continue;
      }
      if (char === '[') {
        this.output += this.readCharacterClassSample();
        this.skipQuantifier();
        continue;
      }
      if (char === '^' || char === '$') {
        this.index += 1;
        continue;
      }
      if (char === '.') {
        this.index += 1;
        this.output += this.createCaptureSample();
        this.skipQuantifier();
        continue;
      }
      this.index += 1;
      this.output += char;
      this.skipQuantifier();
    }
    return this.output;
  }

  private readEscapeSample(): string {
    this.index += 1;
    if (this.index >= this.pattern.length) return '';
    const escaped = this.pattern[this.index];
    this.index += 1;
    if (escaped === 's') return ' ';
    if (escaped === 'd') return '1';
    if (escaped === 'w') return 'text';
    if (escaped === 'n') return '\n';
    if (escaped === 't') return '\t';
    return escaped;
  }

  private readGroupSample(): string {
    const startIndex = this.index;
    const groupContent = this.readBalancedGroup();
    if (groupContent === undefined) {
      this.index = startIndex + 1;
      return '(';
    }

    const normalized = groupContent.replace(/^\?:/, '');
    if (isOpenCapturePattern(normalized)) return this.createCaptureSample();

    const firstAlternative = splitTopLevelAlternatives(normalized)[0] ?? normalized;
    if (!firstAlternative) return this.createCaptureSample();
    return new RegexSampleBuilder(firstAlternative).build();
  }

  private readBalancedGroup(): string | undefined {
    let depth = 0;
    let escaped = false;
    const start = this.index + 1;
    for (let cursor = this.index; cursor < this.pattern.length; cursor += 1) {
      const char = this.pattern[cursor];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '(') depth += 1;
      if (char === ')') {
        depth -= 1;
        if (depth === 0) {
          this.index = cursor + 1;
          return this.pattern.slice(start, cursor);
        }
      }
    }
    return undefined;
  }

  private readCharacterClassSample(): string {
    const end = findCharacterClassEnd(this.pattern, this.index + 1);
    if (end === -1) {
      this.index += 1;
      return '[';
    }
    const content = this.pattern.slice(this.index + 1, end);
    this.index = end + 1;
    if (/\\d|0-9/.test(content)) return '1';
    if (/A-Z/.test(content)) return 'A';
    if (/a-z/.test(content)) return 'a';
    if (content.startsWith('^')) return this.createCaptureSample();
    return content.replace(/\\(.)/g, '$1').charAt(0) || this.createCaptureSample();
  }

  private skipQuantifier(): void {
    const char = this.pattern[this.index];
    if (char === '?' || char === '*' || char === '+') {
      this.index += 1;
      if (this.pattern[this.index] === '?') this.index += 1;
      return;
    }
    if (char !== '{') return;
    const end = this.pattern.indexOf('}', this.index + 1);
    if (end === -1) return;
    this.index = end + 1;
    if (this.pattern[this.index] === '?') this.index += 1;
  }

  private createCaptureSample(): string {
    const label = findNearestLabel(this.output);
    if (!label) return GENERIC_CAPTURE_SAMPLE;
    const normalizedLabel = label.toLowerCase();
    return LABEL_SAMPLE_BY_KEYWORD.find(([keyword]) => normalizedLabel.includes(keyword))?.[1] ?? normalizeLabelAsSample(label);
  }
}

function isOpenCapturePattern(pattern: string): boolean {
  return /^(?:\.\*\??|\.\+\??|\[\^?[^\]]+\][*+]\??)$/.test(pattern.trim());
}

function splitTopLevelAlternatives(pattern: string): string[] {
  const alternatives: string[] = [];
  let depth = 0;
  let escaped = false;
  let start = 0;
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '(') depth += 1;
    else if (char === ')') depth = Math.max(0, depth - 1);
    else if (char === '|' && depth === 0) {
      alternatives.push(pattern.slice(start, index));
      start = index + 1;
    }
  }
  alternatives.push(pattern.slice(start));
  return alternatives;
}

function findCharacterClassEnd(pattern: string, start: number): number {
  let escaped = false;
  for (let index = start; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === ']') return index;
  }
  return -1;
}

function findNearestLabel(output: string): string | undefined {
  const match = /([^\[\]\|\n:]{1,48}):\s*$/.exec(output);
  return match?.[1]?.trim();
}

function normalizeLabelAsSample(label: string): string {
  const words = label
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words.at(-1)?.toLowerCase() || GENERIC_CAPTURE_SAMPLE;
}
