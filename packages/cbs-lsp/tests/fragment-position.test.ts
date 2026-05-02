import type { CbsFragment, Range } from 'risu-workbench-core';
import { describe, expect, it } from 'vitest';

import { createFragmentOffsetMapper } from '../src/core';
import { createDiagnosticForFragment, mapDocumentToCbsFragments } from '../src/utils/diagnostics-router';
import { getFixtureCorpusEntry } from './fixtures/fixture-corpus';

function getFragment(
  fixtureId: string,
  section?: string,
): { entry: ReturnType<typeof getFixtureCorpusEntry>; fragment: CbsFragment } {
  const entry = getFixtureCorpusEntry(fixtureId);
  const fragmentMap = mapDocumentToCbsFragments(entry.filePath, entry.text);

  expect(fragmentMap).not.toBeNull();

  const fragment = section
    ? fragmentMap?.fragments.find((candidate) => candidate.section === section)
    : fragmentMap?.fragments[0];

  expect(fragment).toBeDefined();
  return { entry, fragment: fragment! };
}

describe('fragment position remap', () => {
  it('maps LF offsets, zero-width ranges, and fragment-boundary cursors', () => {
    const { entry, fragment } = getFragment('lorebook-basic');
    const documentContent = entry.text;
    const mapper = createFragmentOffsetMapper(fragment);

    expect(mapper.toHostOffset(0)).toBe(fragment.start);
    expect(mapper.toHostOffset(fragment.content.length)).toBe(fragment.end);
    expect(mapper.toLocalOffset(fragment.start)).toBe(0);
    expect(mapper.toLocalOffset(fragment.end)).toBe(fragment.content.length);

    expect(mapper.toLocalPosition(documentContent, { line: 4, character: 6 })).toEqual({
      line: 0,
      character: 6,
    });

    expect(
      mapper.toHostRangeFromOffsets(
        documentContent,
        fragment.content.length,
        fragment.content.length,
      ),
    ).toEqual({
      start: { line: 4, character: 14 },
      end: { line: 4, character: 14 },
    });

    const diagnostic = createDiagnosticForFragment(
      documentContent,
      fragment,
      'Cursor diagnostic',
      'error',
      'CBS001',
      6,
      6,
    );

    expect(diagnostic.range).toEqual({
      start: { line: 4, character: 6 },
      end: { line: 4, character: 6 },
    });
  });

  it('round-trips CRLF local ranges without line drift', () => {
    const { entry, fragment } = getFragment('lorebook-crlf');
    const documentContent = entry.text;
    const mapper = createFragmentOffsetMapper(fragment);
    const localRange: Range = {
      start: { line: 1, character: 0 },
      end: { line: 1, character: 8 },
    };

    expect(fragment.content).toBe('First line\r\n{{user}}');

    const hostRange = mapper.toHostRange(documentContent, localRange);

    expect(hostRange).toEqual({
      start: { line: 5, character: 0 },
      end: { line: 5, character: 8 },
    });
    expect(mapper.toLocalRange(documentContent, hostRange!)).toEqual(localRange);
  });

  it('preserves UTF-16 surrogate-pair columns for host and local cursor math', () => {
    const { entry, fragment } = getFragment('lorebook-utf16');
    const documentContent = entry.text;
    const mapper = createFragmentOffsetMapper(fragment);

    expect(mapper.toHostPosition(documentContent, 2)).toEqual({ line: 4, character: 2 });
    expect(mapper.toLocalPosition(documentContent, { line: 4, character: 2 })).toEqual({
      line: 0,
      character: 2,
    });

    expect(mapper.toHostRangeFromOffsets(documentContent, 2, 10)).toEqual({
      start: { line: 4, character: 2 },
      end: { line: 4, character: 10 },
    });
  });

  it('round-trips mixed Hangul and emoji ranges with UTF-16 columns', () => {
    const documentContent = ['---', 'name: entry', '---', '@@@ CONTENT', '한🙂{{기분}}🎉', ''].join('\n');
    const fragmentMap = mapDocumentToCbsFragments('/fixtures/unicode-range.risulorebook', documentContent);

    expect(fragmentMap).not.toBeNull();

    const fragment = fragmentMap?.fragments[0] as CbsFragment;
    const mapper = createFragmentOffsetMapper(fragment);
    const macroStart = fragment.content.indexOf('{{기분}}');
    const macroEnd = macroStart + '{{기분}}'.length;
    const hostRange = {
      start: { line: 4, character: 3 },
      end: { line: 4, character: 9 },
    };

    expect(fragment.content).toBe('한🙂{{기분}}🎉');
    expect(mapper.toHostPosition(documentContent, macroStart)).toEqual(hostRange.start);
    expect(mapper.toHostRangeFromOffsets(documentContent, macroStart, macroEnd)).toEqual(hostRange);
    expect(mapper.toLocalPosition(documentContent, hostRange.start)).toEqual({
      line: 0,
      character: 3,
    });
    expect(mapper.toLocalRange(documentContent, hostRange)).toEqual({
      start: { line: 0, character: 3 },
      end: { line: 0, character: 9 },
    });

    const diagnostic = createDiagnosticForFragment(
      documentContent,
      fragment,
      'Unicode range diagnostic',
      'error',
      'CBS-UNICODE',
      macroStart,
      macroEnd,
    );

    expect(diagnostic.range).toEqual(hostRange);
  });

  it('disambiguates duplicate fragment text via fragment metadata in multi-fragment documents', () => {
    const entry = getFixtureCorpusEntry('regex-duplicate-fragments');
    const documentContent = entry.text;
    const { fragment: inFragment } = getFragment('regex-duplicate-fragments', 'IN');
    const { fragment: outFragment } = getFragment('regex-duplicate-fragments', 'OUT');
    const inMapper = createFragmentOffsetMapper(inFragment);
    const outMapper = createFragmentOffsetMapper(outFragment);
    const localRange: Range = {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 8 },
    };

    expect(inFragment.content).toBe(outFragment.content);
    expect(inMapper.toHostRange(documentContent, localRange)).toEqual({
      start: { line: 5, character: 0 },
      end: { line: 5, character: 8 },
    });
    expect(outMapper.toHostRange(documentContent, localRange)).toEqual({
      start: { line: 7, character: 0 },
      end: { line: 7, character: 8 },
    });
    expect(
      inMapper.toLocalRange(documentContent, {
        start: { line: 7, character: 0 },
        end: { line: 7, character: 8 },
      }),
    ).toBeNull();
  });
});
