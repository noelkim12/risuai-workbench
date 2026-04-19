import { describe, expect, it } from 'vitest';
import type { CustomExtensionTarget } from '../../src/domain/custom-extension/contracts';
import {
  buildHtmlPath,
  extractHtmlFromCharx,
  extractHtmlFromModule,
  injectHtmlIntoCharx,
  injectHtmlIntoModule,
  parseHtmlContent,
  resolveDuplicateHtmlSources,
  serializeHtmlContent,
  HtmlAdapterError,
} from '../../src/domain/custom-extension/extensions/html';

describe('html canonical adapter', () => {
  describe('parseHtmlContent', () => {
    it('preserves exact file content without transformation', () => {
      const content = '<div class="container">Hello World</div>';
      expect(parseHtmlContent(content)).toBe(content);
    });

    it('preserves empty strings', () => {
      expect(parseHtmlContent('')).toBe('');
    });

    it('preserves multiline HTML with CSS and CBS', () => {
      const multiline = `<script>
.a-stat-item {
    background: linear-gradient(145deg, rgba(25,30,40,0.7), rgba(30,36,48,0.7));
    border-radius: 8px;

    /* [반응형] 패딩 */
    {{#if {{? {{screen_width}} > 768 }} }} /* -- 데스크탑 -- */
    padding: 8px 5px;
    {{/if}}
    {{#if {{? {{screen_width}} <= 768 }} }} /* -- 모바일 -- */
    padding: 6px 3px;
    {{/if}}
}
</script>`;
      expect(parseHtmlContent(multiline)).toBe(multiline);
    });

    it('preserves leading and trailing whitespace', () => {
      const content = '  \n<div>Content</div>\n  ';
      expect(parseHtmlContent(content)).toBe(content);
    });

    it('preserves HTML with CBS expressions', () => {
      const content = `<div class="{{#if {{? {{screen_width}} > 768 }} }}desktop{{/if}}">
  {{user}}님 환영합니다
</div>`;
      expect(parseHtmlContent(content)).toBe(content);
    });

    it('preserves complex HTML with style and script tags', () => {
      const complex = `<!DOCTYPE html>
<html>
<head>
  <style>
    .settings-panel {
      position: fixed;
      {{#if {{? {{screen_width}} > 768 }} }}
      width: 33%;
      {{/if}}
    }
  </style>
</head>
<body>
  <div id="app"></div>
  <script>
    console.log("{{greeting}}");
  </script>
</body>
</html>`;
      expect(parseHtmlContent(complex)).toBe(complex);
    });
  });

  describe('serializeHtmlContent', () => {
    it('serializes content exactly as-is', () => {
      const content = '<div class="test">Content</div>';
      expect(serializeHtmlContent(content)).toBe(content);
    });

    it('serializes empty strings', () => {
      expect(serializeHtmlContent('')).toBe('');
    });

    it('is inverse of parseHtmlContent (round-trip identity)', () => {
      const original = `<style>
  .item { padding: {{padding}}px; }
</style>`;
      const parsed = parseHtmlContent(original);
      const serialized = serializeHtmlContent(parsed);
      expect(serialized).toBe(original);
    });
  });

  describe('target discrimination', () => {
    it('rejects preset target with clear error', () => {
      expect(() => buildHtmlPath('preset' as CustomExtensionTarget)).toThrow(
        HtmlAdapterError
      );
      expect(() => buildHtmlPath('preset' as CustomExtensionTarget)).toThrow(
        /preset.*does not support.*risuhtml/
      );
    });

    it('accepts charx target', () => {
      expect(() => buildHtmlPath('charx')).not.toThrow();
    });

    it('accepts module target', () => {
      expect(() => buildHtmlPath('module')).not.toThrow();
    });
  });

  describe('buildHtmlPath', () => {
    it('builds charx HTML path with fixed stem', () => {
      const path = buildHtmlPath('charx');
      expect(path).toBe('html/background.risuhtml');
    });

    it('builds module HTML path with fixed stem', () => {
      const path = buildHtmlPath('module');
      expect(path).toBe('html/background.risuhtml');
    });

    it('returns same path for both charx and module (singleton)', () => {
      const charxPath = buildHtmlPath('charx');
      const modulePath = buildHtmlPath('module');
      expect(charxPath).toBe(modulePath);
      expect(charxPath).toBe('html/background.risuhtml');
    });
  });

  describe('resolveDuplicateHtmlSources', () => {
    it('returns single source when only one provided', () => {
      const source = { target: 'charx' as const, source: 'html/background.risuhtml', content: '<div></div>' };
      expect(resolveDuplicateHtmlSources([source])).toBe(source);
    });

    it('throws when no sources provided', () => {
      expect(() => resolveDuplicateHtmlSources([])).toThrow(HtmlAdapterError);
      expect(() => resolveDuplicateHtmlSources([])).toThrow(/No HTML sources/);
    });

    it('throws when multiple file sources provided', () => {
      const sources = [
        { target: 'charx' as const, source: 'html/background.risuhtml', content: '<div>1</div>' },
        { target: 'charx' as const, source: 'html/custom.risuhtml', content: '<div>2</div>' },
      ];
      expect(() => resolveDuplicateHtmlSources(sources)).toThrow(HtmlAdapterError);
      expect(() => resolveDuplicateHtmlSources(sources)).toThrow(/Duplicate.*multiple files/);
    });

    it('throws when duplicate sources with different paths', () => {
      const sources = [
        { target: 'module' as const, source: 'html/background.risuhtml', content: 'A' },
        { target: 'module' as const, source: 'html/background.risuhtml', content: 'B' },
      ];
      expect(() => resolveDuplicateHtmlSources(sources)).toThrow(HtmlAdapterError);
      expect(() => resolveDuplicateHtmlSources(sources)).toThrow(/Duplicate/);
    });
  });

  describe('extractHtmlFromCharx', () => {
    it('extracts HTML from charx extensions.risuai.backgroundHTML', () => {
      const upstream = {
        data: {
          extensions: {
            risuai: {
              backgroundHTML: '<div class="bg">Background</div>',
            },
          },
        },
      };
      expect(extractHtmlFromCharx(upstream, 'charx')).toBe('<div class="bg">Background</div>');
    });

    it('returns null when backgroundHTML is missing', () => {
      const upstream = { data: { extensions: { risuai: {} } } };
      expect(extractHtmlFromCharx(upstream, 'charx')).toBeNull();
    });

    it('returns null when extensions.risuai is missing', () => {
      const upstream = { data: { extensions: {} } };
      expect(extractHtmlFromCharx(upstream, 'charx')).toBeNull();
    });

    it('returns null when data is missing', () => {
      const upstream = {};
      expect(extractHtmlFromCharx(upstream, 'charx')).toBeNull();
    });

    it('returns null when backgroundHTML is empty string', () => {
      const upstream = {
        data: {
          extensions: {
            risuai: {
              backgroundHTML: '',
            },
          },
        },
      };
      expect(extractHtmlFromCharx(upstream, 'charx')).toBe('');
    });

    it('throws when target is not charx', () => {
      const upstream = {};
      expect(() => extractHtmlFromCharx(upstream, 'module' as CustomExtensionTarget)).toThrow(
        HtmlAdapterError
      );
      expect(() => extractHtmlFromCharx(upstream, 'module' as CustomExtensionTarget)).toThrow(
        /Expected target "charx"/
      );
    });

    it('throws when target is preset', () => {
      const upstream = {};
      expect(() => extractHtmlFromCharx(upstream, 'preset' as CustomExtensionTarget)).toThrow(
        HtmlAdapterError
      );
      expect(() => extractHtmlFromCharx(upstream, 'preset' as CustomExtensionTarget)).toThrow(
        /does not support.*risuhtml/
      );
    });

    it('preserves CBS expressions in HTML', () => {
      const upstream = {
        data: {
          extensions: {
            risuai: {
              backgroundHTML: '<div>{{#if {{? {{screen_width}} > 768 }} }}desktop{{/if}}</div>',
            },
          },
        },
      };
      expect(extractHtmlFromCharx(upstream, 'charx')).toBe(
        '<div>{{#if {{? {{screen_width}} > 768 }} }}desktop{{/if}}</div>'
      );
    });
  });

  describe('extractHtmlFromModule', () => {
    it('extracts HTML from module backgroundEmbedding', () => {
      const upstream = {
        backgroundEmbedding: '<style>.bg { color: red; }</style>',
      };
      expect(extractHtmlFromModule(upstream, 'module')).toBe('<style>.bg { color: red; }</style>');
    });

    it('returns null when backgroundEmbedding is missing', () => {
      const upstream = {};
      expect(extractHtmlFromModule(upstream, 'module')).toBeNull();
    });

    it('returns empty string when backgroundEmbedding is empty', () => {
      const upstream = { backgroundEmbedding: '' };
      expect(extractHtmlFromModule(upstream, 'module')).toBe('');
    });

    it('throws when target is not module', () => {
      const upstream = {};
      expect(() => extractHtmlFromModule(upstream, 'charx' as CustomExtensionTarget)).toThrow(
        HtmlAdapterError
      );
      expect(() => extractHtmlFromModule(upstream, 'charx' as CustomExtensionTarget)).toThrow(
        /Expected target "module"/
      );
    });

    it('throws when target is preset', () => {
      const upstream = {};
      expect(() => extractHtmlFromModule(upstream, 'preset' as CustomExtensionTarget)).toThrow(
        HtmlAdapterError
      );
    });

    it('preserves complex HTML with CBS', () => {
      const upstream = {
        backgroundEmbedding: `<script>
.panel {
  {{#if {{? {{screen_width}} > 768 }} }}
  width: 33%;
  {{/if}}
}
</script>`,
      };
      expect(extractHtmlFromModule(upstream, 'module')).toBe(upstream.backgroundEmbedding);
    });
  });

  describe('injectHtmlIntoCharx', () => {
    it('injects HTML into charx extensions.risuai.backgroundHTML', () => {
      const upstream: { data?: { extensions?: { risuai?: { backgroundHTML?: string } } } } = {};
      injectHtmlIntoCharx(upstream, '<div>New</div>', 'charx');
      expect(upstream.data?.extensions?.risuai?.backgroundHTML).toBe('<div>New</div>');
    });

    it('creates nested objects if missing', () => {
      const upstream: { data?: { extensions?: { risuai?: { backgroundHTML?: string } } } } = {};
      injectHtmlIntoCharx(upstream, '<div>Test</div>', 'charx');
      expect(upstream.data).toBeDefined();
      expect(upstream.data?.extensions).toBeDefined();
      expect(upstream.data?.extensions?.risuai).toBeDefined();
      expect(upstream.data?.extensions?.risuai?.backgroundHTML).toBe('<div>Test</div>');
    });

    it('deletes field when content is null', () => {
      const upstream = {
        data: {
          extensions: {
            risuai: {
              backgroundHTML: '<div>Old</div>',
            },
          },
        },
      };
      injectHtmlIntoCharx(upstream, null, 'charx');
      expect(upstream.data.extensions.risuai.backgroundHTML).toBeUndefined();
    });

    it('throws when target is not charx', () => {
      const upstream = {};
      expect(() => injectHtmlIntoCharx(upstream, '<div></div>', 'module' as CustomExtensionTarget)).toThrow(
        HtmlAdapterError
      );
    });

    it('throws when target is preset', () => {
      const upstream = {};
      expect(() => injectHtmlIntoCharx(upstream, '<div></div>', 'preset' as CustomExtensionTarget)).toThrow(
        HtmlAdapterError
      );
    });

    it('preserves exact HTML content including CBS', () => {
      const upstream: { data?: { extensions?: { risuai?: { backgroundHTML?: string } } } } = {};
      const html = '<div>{{#if {{? {{screen_width}} > 768 }} }}desktop{{/if}}</div>';
      injectHtmlIntoCharx(upstream, html, 'charx');
      expect(upstream.data?.extensions?.risuai?.backgroundHTML).toBe(html);
    });
  });

  describe('injectHtmlIntoModule', () => {
    it('injects HTML into module backgroundEmbedding', () => {
      const upstream: { backgroundEmbedding?: string } = {};
      injectHtmlIntoModule(upstream, '<style>.test {}</style>', 'module');
      expect(upstream.backgroundEmbedding).toBe('<style>.test {}</style>');
    });

    it('deletes field when content is null', () => {
      const upstream = { backgroundEmbedding: '<div>Old</div>' };
      injectHtmlIntoModule(upstream, null, 'module');
      expect(upstream.backgroundEmbedding).toBeUndefined();
    });

    it('throws when target is not module', () => {
      const upstream = {};
      expect(() => injectHtmlIntoModule(upstream, '<div></div>', 'charx' as CustomExtensionTarget)).toThrow(
        HtmlAdapterError
      );
    });

    it('throws when target is preset', () => {
      const upstream = {};
      expect(() => injectHtmlIntoModule(upstream, '<div></div>', 'preset' as CustomExtensionTarget)).toThrow(
        HtmlAdapterError
      );
    });

    it('preserves exact HTML content including whitespace', () => {
      const upstream: { backgroundEmbedding?: string } = {};
      const html = '  <div>  \n    {{user}}  \n  </div>  ';
      injectHtmlIntoModule(upstream, html, 'module');
      expect(upstream.backgroundEmbedding).toBe(html);
    });
  });

  describe('round-trip integrity', () => {
    it('charx: extract then inject returns original', () => {
      const original = {
        data: {
          extensions: {
            risuai: {
              backgroundHTML: '<div class="test">{{user}}</div>',
            },
          },
        },
      };
      const extracted = extractHtmlFromCharx(original, 'charx');
      const roundTrip: { data?: { extensions?: { risuai?: { backgroundHTML?: string } } } } = {};
      injectHtmlIntoCharx(roundTrip, extracted, 'charx');
      expect(roundTrip.data?.extensions?.risuai?.backgroundHTML).toBe(
        original.data.extensions.risuai.backgroundHTML
      );
    });

    it('module: extract then inject returns original', () => {
      const original = {
        backgroundEmbedding: '<style>.bg { color: {{color}}; }</style>',
      };
      const extracted = extractHtmlFromModule(original, 'module');
      const roundTrip: { backgroundEmbedding?: string } = {};
      injectHtmlIntoModule(roundTrip, extracted, 'module');
      expect(roundTrip.backgroundEmbedding).toBe(original.backgroundEmbedding);
    });

    it('charx: inject then extract returns original', () => {
      const upstream: { data?: { extensions?: { risuai?: { backgroundHTML?: string } } } } = {};
      const html = '<div>{{#if active}}show{{/if}}</div>';
      injectHtmlIntoCharx(upstream, html, 'charx');
      const extracted = extractHtmlFromCharx(upstream, 'charx');
      expect(extracted).toBe(html);
    });

    it('module: inject then extract returns original', () => {
      const upstream: { backgroundEmbedding?: string } = {};
      const html = '<script>console.log("{{msg}}")</script>';
      injectHtmlIntoModule(upstream, html, 'module');
      const extracted = extractHtmlFromModule(upstream, 'module');
      expect(extracted).toBe(html);
    });

    it('preserves complex CBS-embedded HTML round-trip', () => {
      const complexHtml = `<script>
.a-stat-item {
    background: linear-gradient(145deg, rgba(25,30,40,0.7), rgba(30,36,48,0.7));
    border-radius: 8px;
    text-align: center;
    border: 1px solid rgba(138,162,204,0.1);
    transition: all 0.3s;
    box-shadow: inset 0 1px 2px rgba(255,255,255,0.05);

    /* [반응형] 패딩 */
    {{#if {{? {{screen_width}} > 768 }} }} /* -- 데스크탑 -- */
    padding: 8px 5px;
    {{/if}}
    {{#if {{? {{screen_width}} <= 768 }} }} /* -- 모바일 -- */
    padding: 6px 3px;
    {{/if}}
}
</script>`;
      const upstream: { data?: { extensions?: { risuai?: { backgroundHTML?: string } } } } = {};
      injectHtmlIntoCharx(upstream, complexHtml, 'charx');
      const extracted = extractHtmlFromCharx(upstream, 'charx');
      expect(extracted).toBe(complexHtml);
    });
  });

  describe('singleton enforcement', () => {
    it('enforces single HTML file per charx target', () => {
      const sources = [
        { target: 'charx' as const, source: 'html/background.risuhtml', content: '<div>1</div>' },
        { target: 'charx' as const, source: 'html/extra.risuhtml', content: '<div>2</div>' },
      ];
      expect(() => resolveDuplicateHtmlSources(sources)).toThrow(HtmlAdapterError);
    });

    it('enforces single HTML file per module target', () => {
      const sources = [
        { target: 'module' as const, source: 'html/background.risuhtml', content: '<div>1</div>' },
        { target: 'module' as const, source: 'html/secondary.risuhtml', content: '<div>2</div>' },
      ];
      expect(() => resolveDuplicateHtmlSources(sources)).toThrow(HtmlAdapterError);
    });

    it('error message mentions singleton path', () => {
      const sources = [
        { target: 'charx' as const, source: 'html/background.risuhtml', content: 'A' },
        { target: 'charx' as const, source: 'html/other.risuhtml', content: 'B' },
      ];
      expect(() => resolveDuplicateHtmlSources(sources)).toThrow(
        /html\/background\.risuhtml/
      );
    });
  });

  describe('edge cases', () => {
    it('handles HTML with special characters', () => {
      const html = '<div data-attr="<>&\'\"">Content</div>';
      const upstream: { backgroundEmbedding?: string } = {};
      injectHtmlIntoModule(upstream, html, 'module');
      expect(extractHtmlFromModule(upstream, 'module')).toBe(html);
    });

    it('handles HTML with unicode characters', () => {
      const html = '<div>한국어 日本語 🎉</div>';
      const upstream: { data?: { extensions?: { risuai?: { backgroundHTML?: string } } } } = {};
      injectHtmlIntoCharx(upstream, html, 'charx');
      expect(extractHtmlFromCharx(upstream, 'charx')).toBe(html);
    });

    it('handles very long HTML content', () => {
      const longHtml = '<div>' + 'x'.repeat(10000) + '</div>';
      const upstream: { backgroundEmbedding?: string } = {};
      injectHtmlIntoModule(upstream, longHtml, 'module');
      expect(extractHtmlFromModule(upstream, 'module')).toBe(longHtml);
    });

    it('handles HTML with Windows line endings', () => {
      const html = '<div>\r\nLine1\r\nLine2\r\n</div>';
      const upstream: { data?: { extensions?: { risuai?: { backgroundHTML?: string } } } } = {};
      injectHtmlIntoCharx(upstream, html, 'charx');
      expect(extractHtmlFromCharx(upstream, 'charx')).toBe(html);
    });

    it('handles null content round-trip', () => {
      const upstream: { data?: { extensions?: { risuai?: { backgroundHTML?: string } } } } = {
        data: { extensions: { risuai: { backgroundHTML: '<div>test</div>' } } },
      };
      injectHtmlIntoCharx(upstream, null, 'charx');
      expect(extractHtmlFromCharx(upstream, 'charx')).toBeNull();
    });
  });
});
