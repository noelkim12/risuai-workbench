import { describe, it, expect } from 'vitest';
import {
  isCbsBearingArtifact,
  isNonCbsArtifact,
  mapToCbsFragments,
  mapLorebookToCbsFragments,
  mapRegexToCbsFragments,
  mapPromptToCbsFragments,
  mapHtmlToCbsFragments,
  mapLuaToCbsFragments,
  mapLuaWasmStringLiteralsToCbsFragments,
  mapNonCbsToFragments,
  getCbsArtifactExtension,
  isCbsBearingFile,
  CBS_BEARING_ARTIFACTS,
  NON_CBS_ARTIFACTS,
  CbsFragmentMappingError,
} from '../../src/domain/custom-extension/cbs-fragments';
import type { CustomExtensionArtifact } from '../../src/domain/custom-extension/contracts';

describe('CBS Fragment Mapping', () => {
  describe('artifact classification', () => {
    it('classifies lorebook, regex, prompt, html, lua as CBS-bearing', () => {
      expect(CBS_BEARING_ARTIFACTS).toContain('lorebook');
      expect(CBS_BEARING_ARTIFACTS).toContain('regex');
      expect(CBS_BEARING_ARTIFACTS).toContain('prompt');
      expect(CBS_BEARING_ARTIFACTS).toContain('html');
      expect(CBS_BEARING_ARTIFACTS).toContain('lua');
    });

    it('classifies toggle and variable as non-CBS', () => {
      expect(NON_CBS_ARTIFACTS).toContain('toggle');
      expect(NON_CBS_ARTIFACTS).toContain('variable');
    });

    it('isCbsBearingArtifact returns true for CBS-bearing types', () => {
      expect(isCbsBearingArtifact('lorebook')).toBe(true);
      expect(isCbsBearingArtifact('regex')).toBe(true);
      expect(isCbsBearingArtifact('prompt')).toBe(true);
      expect(isCbsBearingArtifact('html')).toBe(true);
      expect(isCbsBearingArtifact('lua')).toBe(true);
    });

    it('isCbsBearingArtifact returns false for non-CBS types', () => {
      expect(isCbsBearingArtifact('toggle')).toBe(false);
      expect(isCbsBearingArtifact('variable')).toBe(false);
    });

    it('isNonCbsArtifact returns true for non-CBS types', () => {
      expect(isNonCbsArtifact('toggle')).toBe(true);
      expect(isNonCbsArtifact('variable')).toBe(true);
    });

    it('isNonCbsArtifact returns false for CBS-bearing types', () => {
      expect(isNonCbsArtifact('lorebook')).toBe(false);
      expect(isNonCbsArtifact('regex')).toBe(false);
      expect(isNonCbsArtifact('prompt')).toBe(false);
    });
  });

  describe('getCbsArtifactExtension', () => {
    it('returns correct extensions for CBS-bearing artifacts', () => {
      expect(getCbsArtifactExtension('lorebook')).toBe('.risulorebook');
      expect(getCbsArtifactExtension('regex')).toBe('.risuregex');
      expect(getCbsArtifactExtension('prompt')).toBe('.risuprompt');
      expect(getCbsArtifactExtension('html')).toBe('.risuhtml');
      expect(getCbsArtifactExtension('lua')).toBe('.risulua');
    });
  });

  describe('isCbsBearingFile', () => {
    it('returns true for CBS-bearing file paths', () => {
      expect(isCbsBearingFile('lorebooks/entry.risulorebook')).toBe(true);
      expect(isCbsBearingFile('regex/script.risuregex')).toBe(true);
      expect(isCbsBearingFile('prompt_template/item.risuprompt')).toBe(true);
      expect(isCbsBearingFile('html/background.risuhtml')).toBe(true);
      expect(isCbsBearingFile('lua/script.risulua')).toBe(true);
    });

    it('returns false for non-CBS file paths', () => {
      expect(isCbsBearingFile('toggle/module.risutoggle')).toBe(false);
      expect(isCbsBearingFile('variables/default.risuvar')).toBe(false);
    });

    it('is case-insensitive', () => {
      expect(isCbsBearingFile('lorebooks/entry.RISULOREBOOK')).toBe(true);
      expect(isCbsBearingFile('regex/script.Risuregex')).toBe(true);
    });
  });

  describe('mapLorebookToCbsFragments', () => {
    it('extracts only CONTENT section as CBS-bearing', () => {
      const content = `---
name: Test Entry
comment: Test comment
mode: normal
constant: false
selective: false
insertion_order: 100
case_sensitive: false
use_regex: false
---
@@@ KEYS
key1
key2
@@@ SECONDARY_KEYS
sec1
@@@ CONTENT
{{#if {{? {{getglobalvar::toggle}}=1}}}}
CBS content here
{{/if}}
`;

      const result = mapLorebookToCbsFragments(content);

      expect(result.artifact).toBe('lorebook');
      expect(result.fragments).toHaveLength(1);
      expect(result.fragments[0].section).toBe('CONTENT');
      expect(result.fragments[0].content).toContain('{{#if');
      expect(result.fragments[0].content).toContain('CBS content here');
    });

    it('excludes frontmatter from fragments', () => {
      const content = `---
name: Test
comment: Comment
mode: normal
constant: false
selective: false
insertion_order: 100
case_sensitive: false
use_regex: false
---
@@@ KEYS
@@@ CONTENT
{{getvar::test}}
`;

      const result = mapLorebookToCbsFragments(content);

      // Fragment should not include frontmatter
      expect(result.fragments[0].start).toBeGreaterThan(content.indexOf('---'));
      expect(result.fragments[0].content).not.toContain('name:');
      expect(result.fragments[0].content).not.toContain('mode:');
    });

    it('excludes KEYS and SECONDARY_KEYS sections', () => {
      const content = `---
name: Test
comment: Comment
mode: normal
constant: false
selective: false
insertion_order: 100
case_sensitive: false
use_regex: false
---
@@@ KEYS
keyword1
keyword2
@@@ SECONDARY_KEYS
secondary1
@@@ CONTENT
{{getvar::test}}
`;

      const result = mapLorebookToCbsFragments(content);

      expect(result.fragments).toHaveLength(1);
      expect(result.fragments[0].section).toBe('CONTENT');
      expect(result.fragments[0].content).not.toContain('keyword1');
      expect(result.fragments[0].content).not.toContain('secondary1');
    });

    it('handles lorebook without SECONDARY_KEYS', () => {
      const content = `---
name: Test
comment: Comment
mode: normal
constant: false
selective: false
insertion_order: 100
case_sensitive: false
use_regex: false
---
@@@ KEYS
key1
@@@ CONTENT
{{getvar::test}}
`;

      const result = mapLorebookToCbsFragments(content);

      expect(result.fragments).toHaveLength(1);
      expect(result.fragments[0].section).toBe('CONTENT');
    });

    it('provides accurate range metadata', () => {
      const content = `---
name: Test
comment: Comment
mode: normal
constant: false
selective: false
insertion_order: 100
case_sensitive: false
use_regex: false
---
@@@ KEYS
@@@ CONTENT
{{getvar::test}}
`;

      const result = mapLorebookToCbsFragments(content);
      const fragment = result.fragments[0];

      // Range should point to actual content in the original string
      const extractedContent = content.slice(fragment.start, fragment.end);
      expect(extractedContent).toBe(fragment.content);
    });

    it('returns empty fragments for empty content section', () => {
      const content = `---
name: Test
comment: Comment
mode: normal
constant: false
selective: false
insertion_order: 100
case_sensitive: false
use_regex: false
---
@@@ KEYS
@@@ CONTENT
`;

      const result = mapLorebookToCbsFragments(content);

      // Empty content section should produce no fragments
      expect(result.fragments).toHaveLength(0);
    });
  });

  describe('mapRegexToCbsFragments', () => {
    it('extracts both IN and OUT sections as CBS-bearing', () => {
      const content = `---
comment: Test regex
type: editdisplay
---
@@@ IN
pattern(.*)
@@@ OUT
{{getvar::replacement}}
`;

      const result = mapRegexToCbsFragments(content);

      expect(result.artifact).toBe('regex');
      expect(result.fragments).toHaveLength(2);

      const inFragment = result.fragments.find((f) => f.section === 'IN');
      const outFragment = result.fragments.find((f) => f.section === 'OUT');

      expect(inFragment).toBeDefined();
      expect(outFragment).toBeDefined();
      expect(inFragment!.content).toBe('pattern(.*)');
      expect(outFragment!.content).toBe('{{getvar::replacement}}');
    });

    it('excludes frontmatter from fragments', () => {
      const content = `---
comment: Test
type: editinput
flag: g
---
@@@ IN
test
@@@ OUT
result
`;

      const result = mapRegexToCbsFragments(content);

      for (const fragment of result.fragments) {
        expect(fragment.content).not.toContain('comment:');
        expect(fragment.content).not.toContain('type:');
        expect(fragment.content).not.toContain('flag:');
      }
    });

    it('provides accurate range metadata for IN section', () => {
      const content = `---
comment: Test
type: editdisplay
---
@@@ IN
pattern(.*)
@@@ OUT
replacement
`;

      const result = mapRegexToCbsFragments(content);
      const inFragment = result.fragments.find((f) => f.section === 'IN')!;

      const extractedContent = content.slice(inFragment.start, inFragment.end);
      expect(extractedContent).toBe(inFragment.content);
    });

    it('provides accurate range metadata for OUT section', () => {
      const content = `---
comment: Test
type: editdisplay
---
@@@ IN
pattern
@@@ OUT
{{getvar::test}}
`;

      const result = mapRegexToCbsFragments(content);
      const outFragment = result.fragments.find((f) => f.section === 'OUT')!;

      const extractedContent = content.slice(outFragment.start, outFragment.end);
      expect(extractedContent).toBe(outFragment.content);
    });

    it('handles CBS expressions in both IN and OUT', () => {
      const content = `---
comment: CBS regex
type: editdisplay
---
@@@ IN
{{getvar::pattern}}
@@@ OUT
{{#if {{? {{getvar::condition}}=1}}}}{{getvar::result}}{{/if}}
`;

      const result = mapRegexToCbsFragments(content);

      const inFragment = result.fragments.find((f) => f.section === 'IN')!;
      const outFragment = result.fragments.find((f) => f.section === 'OUT')!;

      expect(inFragment.content).toContain('{{getvar::pattern}}');
      expect(outFragment.content).toContain('{{#if');
      expect(outFragment.content).toContain('{{/if}}');
    });

    it('recovers a valid OUT section even when IN section is missing', () => {
      const content = `---
comment: Recovery
type: editdisplay
---
@@ IN
broken header that should be ignored
@@@ OUT
{{getvar::recovered}}
`;

      const result = mapRegexToCbsFragments(content);

      expect(result.fragments).toHaveLength(1);
      expect(result.fragments[0]).toMatchObject({
        section: 'OUT',
        content: '{{getvar::recovered}}',
      });
      expect(content.slice(result.fragments[0].start, result.fragments[0].end)).toBe(
        result.fragments[0].content,
      );
    });
  });

  describe('mapPromptToCbsFragments', () => {
    it('extracts TEXT section for plain/jailbreak/cot variants', () => {
      const content = `---
type: plain
type2: main
role: system
---
@@@ TEXT
{{#if {{? {{getglobalvar::toggle}}=1}}}}
System prompt with CBS
{{/if}}
`;

      const result = mapPromptToCbsFragments(content);

      expect(result.artifact).toBe('prompt');
      expect(result.fragments).toHaveLength(1);
      expect(result.fragments[0].section).toBe('TEXT');
      expect(result.fragments[0].content).toContain('{{#if');
    });

    it('extracts INNER_FORMAT section for typed variants', () => {
      const content = `---
type: persona
---
@@@ INNER_FORMAT
{{slot}}

---
`;

      const result = mapPromptToCbsFragments(content);

      expect(result.fragments).toHaveLength(1);
      expect(result.fragments[0].section).toBe('INNER_FORMAT');
      expect(result.fragments[0].content).toContain('{{slot}}');
    });

    it('extracts both INNER_FORMAT and DEFAULT_TEXT for authornote', () => {
      const content = `---
type: authornote
---
@@@ INNER_FORMAT
---

{{slot}}

@@@ DEFAULT_TEXT
[ Style: {{getvar::style}} ]
`;

      const result = mapPromptToCbsFragments(content);

      expect(result.fragments).toHaveLength(2);
      expect(result.fragments.some((f) => f.section === 'INNER_FORMAT')).toBe(true);
      expect(result.fragments.some((f) => f.section === 'DEFAULT_TEXT')).toBe(true);
    });

    it('excludes frontmatter from fragments', () => {
      const content = `---
type: plain
type2: main
role: system
name: Test Prompt
---
@@@ TEXT
Content here
`;

      const result = mapPromptToCbsFragments(content);

      expect(result.fragments[0].content).not.toContain('type:');
      expect(result.fragments[0].content).not.toContain('role:');
      expect(result.fragments[0].content).not.toContain('name:');
    });

    it('returns no fragments for chat variant (no body sections)', () => {
      const content = `---
type: chat
range_start: 0
range_end: end
---
`;

      const result = mapPromptToCbsFragments(content);

      expect(result.fragments).toHaveLength(0);
    });

    it('returns no fragments for cache variant (no body sections)', () => {
      const content = `---
type: cache
name: main-cache
depth: 2
cache_role: all
---
`;

      const result = mapPromptToCbsFragments(content);

      expect(result.fragments).toHaveLength(0);
    });

    it('provides accurate range metadata', () => {
      const content = `---
type: plain
type2: main
role: system
---
@@@ TEXT
{{getvar::test}}
`;

      const result = mapPromptToCbsFragments(content);
      const fragment = result.fragments[0];

      const extractedContent = content.slice(fragment.start, fragment.end);
      expect(extractedContent).toBe(fragment.content);
    });

    it('recovers later valid prompt sections after a malformed earlier header', () => {
      const content = `---
type: plain
---
@@ TEXT
broken text header
@@@ DEFAULT_TEXT
Recovered fallback
`;

      const result = mapPromptToCbsFragments(content);

      expect(result.fragments).toHaveLength(1);
      expect(result.fragments[0]).toMatchObject({
        section: 'DEFAULT_TEXT',
        content: 'Recovered fallback',
      });
    });
  });

  describe('mapHtmlToCbsFragments', () => {
    it('treats entire file as CBS-bearing', () => {
      const content = `<script>
.a-stat-item {
  {{#if {{? {{screen_width}} > 768 }} }}
  padding: 8px 5px;
  {{/if}}
}
</script>
`;

      const result = mapHtmlToCbsFragments(content);

      expect(result.artifact).toBe('html');
      expect(result.fragments).toHaveLength(1);
      expect(result.fragments[0].section).toBe('full');
      expect(result.fragments[0].start).toBe(0);
      expect(result.fragments[0].end).toBe(content.length);
      expect(result.fragments[0].content).toBe(content);
    });

    it('includes CBS expressions in HTML', () => {
      const content = `<div>
{{#if {{? {{getvar::condition}}=1}}}}
  <span>Conditional content</span>
{{/if}}
</div>`;

      const result = mapHtmlToCbsFragments(content);

      expect(result.fragments[0].content).toContain('{{#if');
      expect(result.fragments[0].content).toContain('{{/if}}');
    });
  });

  describe('mapLuaToCbsFragments', () => {
    it('treats entire file as CBS-bearing (simplified approach)', () => {
      const content = `function onTrigger()
  local msg = "{{getvar::message}}"
  return msg
end
`;

      const result = mapLuaToCbsFragments(content);

      expect(result.artifact).toBe('lua');
      expect(result.fragments).toHaveLength(1);
      expect(result.fragments[0].section).toBe('full');
      expect(result.fragments[0].start).toBe(0);
      expect(result.fragments[0].end).toBe(content.length);
    });

    it('includes string literals that may contain CBS', () => {
      const content = `local template = "{{#if {{? {{getvar::condition}}=1}}}}result{{/if}}"`;

      const result = mapLuaToCbsFragments(content);

      expect(result.fragments[0].content).toContain('{{#if');
      expect(result.fragments[0].content).toContain('{{/if}}');
    });
  });

  describe('mapLuaWasmStringLiteralsToCbsFragments', () => {
    it('maps only CBS-bearing Lua string literal contents to fragments', () => {
      const source = 'local a = "plain"\nlocal b = "hello {{user}}"\n';
      const cbsContentStart = source.indexOf('hello {{user}}');
      const cbsContentEnd = cbsContentStart + 'hello {{user}}'.length;
      const plainContentStart = source.indexOf('plain');
      const plainContentEnd = plainContentStart + 'plain'.length;

      const fragmentMap = mapLuaWasmStringLiteralsToCbsFragments(source, [
        {
          startUtf16: plainContentStart - 1,
          endUtf16: plainContentEnd + 1,
          contentStartUtf16: plainContentStart,
          contentEndUtf16: plainContentEnd,
          startByte: plainContentStart - 1,
          endByte: plainContentEnd + 1,
          contentStartByte: plainContentStart,
          contentEndByte: plainContentEnd,
          quoteKind: 'double',
          hasCbsMarker: false,
        },
        {
          startUtf16: cbsContentStart - 1,
          endUtf16: cbsContentEnd + 1,
          contentStartUtf16: cbsContentStart,
          contentEndUtf16: cbsContentEnd,
          startByte: cbsContentStart - 1,
          endByte: cbsContentEnd + 1,
          contentStartByte: cbsContentStart,
          contentEndByte: cbsContentEnd,
          quoteKind: 'double',
          hasCbsMarker: true,
        },
      ]);

      expect(fragmentMap.artifact).toBe('lua');
      expect(fragmentMap.fragments).toHaveLength(1);
      expect(fragmentMap.fragments[0]).toMatchObject({
        section: 'lua-string:1',
        start: cbsContentStart,
        end: cbsContentEnd,
        content: 'hello {{user}}',
      });
    });
  });

  describe('mapNonCbsToFragments', () => {
    it('returns empty fragments for toggle (explicitly non-CBS)', () => {
      const content = `some toggle DSL content
that is not CBS`;

      const result = mapNonCbsToFragments('toggle', content);

      expect(result.artifact).toBe('toggle');
      expect(result.fragments).toHaveLength(0);
      expect(result.fileLength).toBe(content.length);
    });

    it('returns empty fragments for variable (explicitly non-CBS)', () => {
      const content = `key1=value1
key2=value2`;

      const result = mapNonCbsToFragments('variable', content);

      expect(result.artifact).toBe('variable');
      expect(result.fragments).toHaveLength(0);
      expect(result.fileLength).toBe(content.length);
    });
  });

  describe('mapToCbsFragments (unified API)', () => {
    it('routes lorebook to mapLorebookToCbsFragments', () => {
      const content = `---
name: Test
comment: Comment
mode: normal
constant: false
selective: false
insertion_order: 100
case_sensitive: false
use_regex: false
---
@@@ KEYS
@@@ CONTENT
{{getvar::test}}
`;

      const result = mapToCbsFragments('lorebook', content);

      expect(result.artifact).toBe('lorebook');
      expect(result.fragments).toHaveLength(1);
    });

    it('routes regex to mapRegexToCbsFragments', () => {
      const content = `---
comment: Test
type: editdisplay
---
@@@ IN
pattern
@@@ OUT
replacement
`;

      const result = mapToCbsFragments('regex', content);

      expect(result.artifact).toBe('regex');
      expect(result.fragments).toHaveLength(2);
    });

    it('routes prompt to mapPromptToCbsFragments', () => {
      const content = `---
type: plain
type2: main
role: system
---
@@@ TEXT
content
`;

      const result = mapToCbsFragments('prompt', content);

      expect(result.artifact).toBe('prompt');
      expect(result.fragments).toHaveLength(1);
    });

    it('routes html to mapHtmlToCbsFragments', () => {
      const content = '<div>{{getvar::test}}</div>';

      const result = mapToCbsFragments('html', content);

      expect(result.artifact).toBe('html');
      expect(result.fragments).toHaveLength(1);
    });

    it('routes lua to mapLuaToCbsFragments', () => {
      const content = 'local x = "{{getvar::test}}"';

      const result = mapToCbsFragments('lua', content);

      expect(result.artifact).toBe('lua');
      expect(result.fragments).toHaveLength(1);
    });

    it('routes toggle to mapNonCbsToFragments (empty result)', () => {
      const content = 'toggle DSL content';

      const result = mapToCbsFragments('toggle', content);

      expect(result.artifact).toBe('toggle');
      expect(result.fragments).toHaveLength(0);
    });

    it('routes variable to mapNonCbsToFragments (empty result)', () => {
      const content = 'key=value';

      const result = mapToCbsFragments('variable', content);

      expect(result.artifact).toBe('variable');
      expect(result.fragments).toHaveLength(0);
    });

    it('throws for unknown artifact types', () => {
      expect(() => mapToCbsFragments('unknown' as CustomExtensionArtifact, 'content')).toThrow(
        CbsFragmentMappingError
      );
    });
  });

  describe('range metadata accuracy', () => {
    it('lorebook fragment ranges are extractable from original content', () => {
      const content = `---
name: Test
comment: Comment
mode: normal
constant: false
selective: false
insertion_order: 100
case_sensitive: false
use_regex: false
---
@@@ KEYS
key1
@@@ CONTENT
{{getvar::test}}
more content
`;

      const result = mapLorebookToCbsFragments(content);
      const fragment = result.fragments[0];

      // Extract using the range and verify it matches the content
      const extracted = content.slice(fragment.start, fragment.end);
      expect(extracted).toBe(fragment.content);
    });

    it('regex fragment ranges are extractable from original content', () => {
      const content = `---
comment: Test
type: editdisplay
---
@@@ IN
pattern here
@@@ OUT
output here
`;

      const result = mapRegexToCbsFragments(content);

      for (const fragment of result.fragments) {
        const extracted = content.slice(fragment.start, fragment.end);
        expect(extracted).toBe(fragment.content);
      }
    });

    it('prompt fragment ranges are extractable from original content', () => {
      const content = `---
type: plain
type2: main
role: system
---
@@@ TEXT
line1
line2
line3
`;

      const result = mapPromptToCbsFragments(content);
      const fragment = result.fragments[0];

      const extracted = content.slice(fragment.start, fragment.end);
      expect(extracted).toBe(fragment.content);
    });
  });

  describe('edge cases', () => {
    it('handles CRLF line endings in lorebook', () => {
      const content = `---\r\nname: Test\r\ncomment: Comment\r\nmode: normal\r\nconstant: false\r\nselective: false\r\ninsertion_order: 100\r\ncase_sensitive: false\r\nuse_regex: false\r\n---\r\n@@@ KEYS\r\n@@@ CONTENT\r\n{{getvar::test}}\r\n`;

      const result = mapLorebookToCbsFragments(content);

      expect(result.fragments).toHaveLength(1);
      expect(result.fragments[0].section).toBe('CONTENT');
    });

    it('handles CRLF line endings in regex', () => {
      const content = `---\r\ncomment: Test\r\ntype: editdisplay\r\n---\r\n@@@ IN\r\npattern\r\n@@@ OUT\r\noutput\r\n`;

      const result = mapRegexToCbsFragments(content);

      expect(result.fragments).toHaveLength(2);
    });

    it('handles empty files gracefully', () => {
      const result = mapHtmlToCbsFragments('');

      expect(result.fragments).toHaveLength(1);
      expect(result.fragments[0].content).toBe('');
      expect(result.fragments[0].start).toBe(0);
      expect(result.fragments[0].end).toBe(0);
    });

    it('handles files with only whitespace', () => {
      const result = mapLuaToCbsFragments('   \n\n   ');

      expect(result.fragments).toHaveLength(1);
      expect(result.fragments[0].content).toBe('   \n\n   ');
    });
  });

  describe('T14 acceptance criteria', () => {
    it('extracts only CBS-bearing sections (lorebook)', () => {
      const content = `---
name: Test
comment: Comment
mode: normal
constant: false
selective: false
insertion_order: 100
case_sensitive: false
use_regex: false
---
@@@ KEYS
key1
key2
@@@ SECONDARY_KEYS
sec1
@@@ CONTENT
{{getvar::test}}
`;

      const result = mapToCbsFragments('lorebook', content);

      // Only CONTENT should be CBS-bearing
      expect(result.fragments).toHaveLength(1);
      expect(result.fragments[0].section).toBe('CONTENT');
    });

    it('excludes frontmatter from lorebook ranges', () => {
      const content = `---
name: Test
comment: Comment
mode: normal
constant: false
selective: false
insertion_order: 100
case_sensitive: false
use_regex: false
---
@@@ KEYS
@@@ CONTENT
{{getvar::test}}
`;

      const result = mapToCbsFragments('lorebook', content);
      const fragment = result.fragments[0];

      // Fragment should start after frontmatter
      const frontmatterEnd = content.indexOf('@@@ CONTENT') + '@@@ CONTENT'.length;
      expect(fragment.start).toBeGreaterThanOrEqual(frontmatterEnd);
    });

    it('explicitly classifies toggle as non-CBS-bearing', () => {
      const result = mapToCbsFragments('toggle', 'some toggle content');

      expect(result.artifact).toBe('toggle');
      expect(result.fragments).toHaveLength(0);
    });

    it('explicitly classifies variable as non-CBS-bearing', () => {
      const result = mapToCbsFragments('variable', 'key=value');

      expect(result.artifact).toBe('variable');
      expect(result.fragments).toHaveLength(0);
    });

    it('preserves section/range metadata for diagnostics routing', () => {
      const content = `---
comment: Test
type: editdisplay
---
@@@ IN
{{getvar::pattern}}
@@@ OUT
{{getvar::replacement}}
`;

      const result = mapToCbsFragments('regex', content);

      for (const fragment of result.fragments) {
        // Each fragment should have all required metadata
        expect(fragment.section).toBeDefined();
        expect(typeof fragment.start).toBe('number');
        expect(typeof fragment.end).toBe('number');
        expect(typeof fragment.content).toBe('string');
        expect(fragment.start).toBeLessThan(fragment.end);
      }
    });
  });
});
