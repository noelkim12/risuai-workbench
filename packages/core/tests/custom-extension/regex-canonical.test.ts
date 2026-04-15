import { describe, expect, it } from 'vitest';
import type { CustomExtensionTarget } from '../../src/domain/custom-extension/contracts';
import {
  buildRegexPath,
  extractRegexFromCharx,
  extractRegexFromModule,
  extractRegexFromPreset,
  injectRegexIntoCharx,
  injectRegexIntoModule,
  injectRegexIntoPreset,
  parseRegexContent,
  REGEX_TYPES,
  RegexAdapterError,
  serializeRegexContent,
  type RegexContent,
  type UpstreamRegexEntry,
} from '../../src/domain/custom-extension/extensions/regex';

describe('regex canonical adapter', () => {
  describe('parseRegexContent', () => {
    it('parses YAML header plus exact IN/OUT boundaries', () => {
      const content = `---
comment: 상태창
type: editdisplay
ableFlag: true
flag: g<move_top>
---
@@@ IN
\\[(.*?) \\| Date: (.*?) \\| Time: (.*?) \\| Location: (.*?) \\|(.*?) \\]\\n

@@@ OUT
<div class="cartoon-bg">
  {{raw::{{getvar::cv_char}}}}
</div>
`;

      expect(parseRegexContent(content)).toEqual({
        comment: '상태창',
        type: 'editdisplay',
        ableFlag: true,
        flag: 'g<move_top>',
        in: '\\[(.*?) \\| Date: (.*?) \\| Time: (.*?) \\| Location: (.*?) \\|(.*?) \\]\\n\n',
        out: '<div class="cartoon-bg">\n  {{raw::{{getvar::cv_char}}}}\n</div>',
      });
    });

    it('preserves absent vs explicit flag semantics', () => {
      const absent = parseRegexContent(`---
comment: no-flags
type: editinput
---
@@@ IN
foo
@@@ OUT
bar
`);

      const explicitDefaults = parseRegexContent(`---
comment: explicit-defaults
type: editinput
ableFlag: false
flag: ""
---
@@@ IN
foo
@@@ OUT
bar
`);

      expect(absent).toEqual({
        comment: 'no-flags',
        type: 'editinput',
        in: 'foo',
        out: 'bar',
      });
      expect('ableFlag' in absent).toBe(false);
      expect('flag' in absent).toBe(false);

      expect(explicitDefaults).toEqual({
        comment: 'explicit-defaults',
        type: 'editinput',
        ableFlag: false,
        flag: '',
        in: 'foo',
        out: 'bar',
      });
      expect('ableFlag' in explicitDefaults).toBe(true);
      expect('flag' in explicitDefaults).toBe(true);
    });

    it('supports quoted header values containing colons', () => {
      const parsed = parseRegexContent(`---
comment: "🤍 : 이어서 진행"
type: editdisplay
---
@@@ IN
\\*says nothing\\*
@@@ OUT
(OOC : Please advance to the next scene.)
`);

      expect(parsed.comment).toBe('🤍 : 이어서 진행');
      expect(parsed.type).toBe('editdisplay');
      expect(parsed.in).toBe('\\*says nothing\\*');
      expect(parsed.out).toBe('(OOC : Please advance to the next scene.)');
    });

    it('rejects malformed quoted metadata', () => {
      expect(() =>
        parseRegexContent(`---
comment: "unterminated
type: editdisplay
---
@@@ IN
foo
@@@ OUT
bar
`)
      ).toThrow(/Invalid quoted string value/);
    });

    it('rejects unsupported regex type', () => {
      expect(() =>
        parseRegexContent(`---
comment: invalid
type: editpreview
---
@@@ IN
foo
@@@ OUT
bar
`)
      ).toThrow(RegexAdapterError);
      expect(() =>
        parseRegexContent(`---
comment: invalid
type: editpreview
---
@@@ IN
foo
@@@ OUT
bar
`)
      ).toThrow(/Unsupported regex type "editpreview"/);
    });

    it('rejects files missing an OUT section', () => {
      expect(() =>
        parseRegexContent(`---
comment: broken
type: editinput
---
@@@ IN
foo
`)
      ).toThrow(/Expected both @@@ IN and @@@ OUT sections/);
    });
  });

  describe('serializeRegexContent', () => {
    it('serializes canonical content deterministically', () => {
      const canonical: RegexContent = {
        comment: '생각보기',
        type: 'editdisplay',
        ableFlag: false,
        flag: 'g',
        in: '<Thoughts>([\\s\\S]*?)<\\/Thoughts>',
        out: '{{#if {{? {{getglobalvar::toggle_thinkkniht}}=1}}}}<Thoughts>\n$1\n</Thoughts>\n{{/if}}',
      };

      expect(serializeRegexContent(canonical)).toBe(`---
comment: 생각보기
type: editdisplay
ableFlag: false
flag: g
---
@@@ IN
<Thoughts>([\\s\\S]*?)<\\/Thoughts>
@@@ OUT
{{#if {{? {{getglobalvar::toggle_thinkkniht}}=1}}}}<Thoughts>
$1
</Thoughts>
{{/if}}
`);
    });

    it('omits optional fields when absent but preserves explicit defaults', () => {
      const absent = serializeRegexContent({
        comment: 'absent',
        type: 'editinput',
        in: 'foo',
        out: 'bar',
      });
      const explicit = serializeRegexContent({
        comment: 'explicit',
        type: 'editinput',
        ableFlag: false,
        flag: '',
        in: 'foo',
        out: 'bar',
      });

      expect(absent).toBe(`---
comment: absent
type: editinput
---
@@@ IN
foo
@@@ OUT
bar
`);
      expect(explicit).toBe(`---
comment: explicit
type: editinput
ableFlag: false
flag: ""
---
@@@ IN
foo
@@@ OUT
bar
`);
    });

    it('quotes header values when needed', () => {
      const serialized = serializeRegexContent({
        comment: '🤍 : 이어서 진행',
        type: 'disabled',
        flag: 'g<move_top><order 1>',
        in: '\\*says nothing\\*',
        out: '(OOC : next scene)',
      });

      expect(serialized).toContain('comment: "🤍 : 이어서 진행"');
      expect(serialized).toContain('flag: "g<move_top><order 1>"');
    });

    it('round-trips parse and serialize without changing canonical data', () => {
      const original = `---
comment: combat filter
type: editprocess
ableFlag: true
flag: gmsi<order 1>
---
@@@ IN
{{#if {{cond}}}}danger{{/if}}
@@@ OUT
safe-$1
`;

      const reparsed = parseRegexContent(serializeRegexContent(parseRegexContent(original)));
      expect(reparsed).toEqual(parseRegexContent(original));
    });
  });

  describe('type and target semantics', () => {
    it('freezes the five accepted regex types', () => {
      expect(REGEX_TYPES).toEqual([
        'editinput',
        'editoutput',
        'editdisplay',
        'editprocess',
        'disabled',
      ]);
    });

    it('rejects unsupported target for regex path building', () => {
      expect(() => buildRegexPath('unknown' as CustomExtensionTarget, 'combat')).toThrow(
        RegexAdapterError
      );
    });

    it('builds deterministic regex paths from a stem', () => {
      expect(buildRegexPath('charx', 'Combat Filter')).toBe('regex/Combat_Filter.risuregex');
      expect(buildRegexPath('module', '상태창')).toBe('regex/상태창.risuregex');
      expect(buildRegexPath('preset', 'prompt/cleaner')).toBe('regex/prompt_cleaner.risuregex');
    });
  });

  describe('upstream extraction and injection', () => {
    it('extracts regex arrays from charx/module/preset with shape preserved', () => {
      const entry = {
        comment: 'state',
        type: 'editdisplay',
        flag: '',
        ableFlag: false,
        in: 'foo',
        out: 'bar',
      };

      expect(
        extractRegexFromCharx(
          { data: { extensions: { risuai: { customScripts: [entry] } } } },
          'charx'
        )
      ).toEqual([entry]);
      expect(extractRegexFromModule({ regex: [entry] }, 'module')).toEqual([entry]);
      expect(extractRegexFromPreset({ presetRegex: [entry] }, 'preset')).toEqual([entry]);
    });

    it('returns null when an upstream regex collection is absent', () => {
      expect(extractRegexFromCharx({}, 'charx')).toBeNull();
      expect(extractRegexFromModule({}, 'module')).toBeNull();
      expect(extractRegexFromPreset({}, 'preset')).toBeNull();
    });

    it('injects regex arrays back into upstream targets without materializing absent optionals', () => {
      const canonical: RegexContent[] = [
        {
          comment: 'strict-shape',
          type: 'editinput',
          in: 'foo',
          out: 'bar',
        },
        {
          comment: 'explicit-defaults',
          type: 'editoutput',
          ableFlag: false,
          flag: '',
          in: 'baz',
          out: 'qux',
        },
      ];

      const charx: {
        data?: { extensions?: { risuai?: { customScripts?: RegexContent[] } } };
      } = {};
      const module: { regex?: RegexContent[] } = {};
      const preset: { presetRegex?: RegexContent[] } = {};

      injectRegexIntoCharx(charx, canonical, 'charx');
      injectRegexIntoModule(module, canonical, 'module');
      injectRegexIntoPreset(preset, canonical, 'preset');

      expect(charx.data?.extensions?.risuai?.customScripts).toEqual(canonical);
      expect(module.regex).toEqual(canonical);
      expect(preset.presetRegex).toEqual(canonical);
      expect('flag' in (module.regex?.[0] ?? {})).toBe(false);
      expect('ableFlag' in (module.regex?.[0] ?? {})).toBe(false);
      expect('flag' in (module.regex?.[1] ?? {})).toBe(true);
      expect('ableFlag' in (module.regex?.[1] ?? {})).toBe(true);
    });

    it('deletes upstream regex collections when injected content is null', () => {
      const existingEntry: UpstreamRegexEntry = {
        comment: 'x',
        type: 'editinput',
        in: 'before',
        out: 'after',
      };
      const charx = {
        data: { extensions: { risuai: { customScripts: [existingEntry] } } },
      };
      const module = { regex: [existingEntry] };
      const preset = { presetRegex: [existingEntry] };

      injectRegexIntoCharx(charx, null, 'charx');
      injectRegexIntoModule(module, null, 'module');
      injectRegexIntoPreset(preset, null, 'preset');

      expect(charx.data.extensions.risuai.customScripts).toBeUndefined();
      expect(module.regex).toBeUndefined();
      expect(preset.presetRegex).toBeUndefined();
    });

    it('does not materialize empty charx scaffolding when null injection starts from absence', () => {
      const charx: { data?: { extensions?: { risuai?: { customScripts?: UpstreamRegexEntry[] } } } } =
        {};

      injectRegexIntoCharx(charx, null, 'charx');

      expect(charx).toEqual({});
      expect(charx.data).toBeUndefined();
    });

    it('rejects unsupported regex types found in upstream objects', () => {
      expect(() =>
        extractRegexFromModule(
          {
            regex: [
              {
                comment: 'broken',
                type: 'editpreview',
                in: 'foo',
                out: 'bar',
              },
            ],
          },
          'module'
        )
      ).toThrow(/Unsupported regex type "editpreview"/);
    });
  });
});
