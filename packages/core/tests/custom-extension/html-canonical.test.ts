import { describe, expect, it } from 'vitest';
import type { CustomExtensionTarget } from '../../src/domain/custom-extension/contracts';
import {
  buildHtmlPath,
  extractHtmlFromCharx,
  extractHtmlFromModule,
  injectHtmlIntoCharx,
  injectHtmlIntoModule,
  resolveDuplicateHtmlSources,
  HtmlAdapterError,
} from '../../src/domain/custom-extension/extensions/html';

describe('html canonical adapter', () => {

  describe('target discrimination', () => {
    it('rejects preset target with clear error', () => {
      expect(() => buildHtmlPath('preset' as CustomExtensionTarget)).toThrow(
        HtmlAdapterError
      );
      expect(() => buildHtmlPath('preset' as CustomExtensionTarget)).toThrow(
        /preset.*does not support.*risuhtml/
      );
    });
  });

  describe('resolveDuplicateHtmlSources', () => {

    it('throws when multiple file sources provided', () => {
      const sources = [
        { target: 'charx' as const, source: 'html/background.risuhtml', content: '<div>1</div>' },
        { target: 'charx' as const, source: 'html/custom.risuhtml', content: '<div>2</div>' },
      ];
      expect(() => resolveDuplicateHtmlSources(sources)).toThrow(HtmlAdapterError);
      expect(() => resolveDuplicateHtmlSources(sources)).toThrow(/Duplicate.*multiple files/);
    });
  });

  describe('extractHtmlFromModule', () => {

    it('returns empty string when backgroundEmbedding is empty', () => {
      const upstream = { backgroundEmbedding: '' };
      expect(extractHtmlFromModule(upstream, 'module')).toBe('');
    });
  });

  describe('injectHtmlIntoCharx', () => {

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
  });

  describe('injectHtmlIntoModule', () => {

    it('deletes field when content is null', () => {
      const upstream = { backgroundEmbedding: '<div>Old</div>' };
      injectHtmlIntoModule(upstream, null, 'module');
      expect(upstream.backgroundEmbedding).toBeUndefined();
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

  describe('edge cases', () => {

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
