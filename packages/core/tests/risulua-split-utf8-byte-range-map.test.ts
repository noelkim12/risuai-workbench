import { describe, expect, it } from 'vitest';
import { createRisuLuaUtf8ByteStringMap } from '../src/domain/risulua-split';

describe('createRisuLuaUtf8ByteStringMap', () => {
  describe('ASCII strings', () => {
    it('maps ASCII characters 1:1 between JS index and byte index', () => {
      const source = 'local M = {}';
      const map = createRisuLuaUtf8ByteStringMap(source);

      expect(map.byteLength).toBe(12);
      for (let i = 0; i <= source.length; i++) {
        expect(map.jsIndexToByteIndex(i)).toBe(i);
        expect(map.byteIndexToJsIndex(i)).toBe(i);
      }
    });

    it('handles empty string', () => {
      const map = createRisuLuaUtf8ByteStringMap('');
      expect(map.byteLength).toBe(0);
      expect(map.jsIndexToByteIndex(0)).toBe(0);
      expect(map.byteIndexToJsIndex(0)).toBe(0);
    });

    it('clamps out-of-bounds indices', () => {
      const source = 'abc';
      const map = createRisuLuaUtf8ByteStringMap(source);

      expect(map.jsIndexToByteIndex(-1)).toBe(0);
      expect(map.jsIndexToByteIndex(100)).toBe(3);
      expect(map.byteIndexToJsIndex(-1)).toBe(0);
      expect(map.byteIndexToJsIndex(100)).toBe(3);
    });
  });

  describe('Korean/Hangul text', () => {
    it('maps Hangul syllables (3 bytes each in UTF-8)', () => {
      const source = '한글';
      const map = createRisuLuaUtf8ByteStringMap(source);

      expect(map.byteLength).toBe(6);
      expect(map.jsIndexToByteIndex(0)).toBe(0);
      expect(map.jsIndexToByteIndex(1)).toBe(3);
      expect(map.jsIndexToByteIndex(2)).toBe(6);

      expect(map.byteIndexToJsIndex(0)).toBe(0);
      expect(map.byteIndexToJsIndex(1)).toBe(0);
      expect(map.byteIndexToJsIndex(2)).toBe(0);
      expect(map.byteIndexToJsIndex(3)).toBe(1);
      expect(map.byteIndexToJsIndex(4)).toBe(1);
      expect(map.byteIndexToJsIndex(5)).toBe(1);
    });

    it('handles mixed ASCII and Hangul', () => {
      const source = 'a한b글';
      const map = createRisuLuaUtf8ByteStringMap(source);

      expect(map.byteLength).toBe(8);
      expect(map.jsIndexToByteIndex(0)).toBe(0);
      expect(map.jsIndexToByteIndex(1)).toBe(1);
      expect(map.jsIndexToByteIndex(2)).toBe(4);
      expect(map.jsIndexToByteIndex(3)).toBe(5);
      expect(map.jsIndexToByteIndex(4)).toBe(8);
    });
  });

  describe('Emoji and surrogate pairs', () => {
    it('maps emoji (4 bytes in UTF-8, 2 JS code units)', () => {
      const source = '😀';
      const map = createRisuLuaUtf8ByteStringMap(source);

      expect(map.byteLength).toBe(4);
      expect(source.length).toBe(2);

      expect(map.jsIndexToByteIndex(0)).toBe(0);
      expect(map.jsIndexToByteIndex(1)).toBe(4);
      expect(map.jsIndexToByteIndex(2)).toBe(4);

      expect(map.byteIndexToJsIndex(0)).toBe(0);
      expect(map.byteIndexToJsIndex(1)).toBe(0);
      expect(map.byteIndexToJsIndex(2)).toBe(0);
      expect(map.byteIndexToJsIndex(3)).toBe(0);
    });

    it('handles multiple emoji', () => {
      const source = '😀😁';
      const map = createRisuLuaUtf8ByteStringMap(source);

      expect(map.byteLength).toBe(8);
      expect(source.length).toBe(4);

      expect(map.jsIndexToByteIndex(0)).toBe(0);
      expect(map.jsIndexToByteIndex(2)).toBe(4);
      expect(map.jsIndexToByteIndex(4)).toBe(8);
    });

    it('maps all bytes within a surrogate pair to the starting JS index', () => {
      const source = 'a😀b';
      const map = createRisuLuaUtf8ByteStringMap(source);

      expect(map.byteIndexToJsIndex(0)).toBe(0);
      expect(map.byteIndexToJsIndex(1)).toBe(1);
      expect(map.byteIndexToJsIndex(2)).toBe(1);
      expect(map.byteIndexToJsIndex(3)).toBe(1);
      expect(map.byteIndexToJsIndex(4)).toBe(1);
      expect(map.byteIndexToJsIndex(5)).toBe(3);
    });
  });

  describe('CRLF line endings', () => {
    it('treats CRLF as two separate ASCII characters', () => {
      const source = 'a\r\nb';
      const map = createRisuLuaUtf8ByteStringMap(source);

      expect(map.byteLength).toBe(4);
      expect(map.jsIndexToByteIndex(0)).toBe(0);
      expect(map.jsIndexToByteIndex(1)).toBe(1);
      expect(map.jsIndexToByteIndex(2)).toBe(2);
      expect(map.jsIndexToByteIndex(3)).toBe(3);
      expect(map.jsIndexToByteIndex(4)).toBe(4);
    });
  });

  describe('Mixed content', () => {
    it('handles Korean + emoji + ASCII mix', () => {
      const source = '-- 한글 😀 prefix\nlocal M = {}';
      const map = createRisuLuaUtf8ByteStringMap(source);

      // '-- 한글 😀 prefix' = 3 + 3 + 3 + 1 + 4 + 1 + 6 = 21 bytes
      // '\n' = 1 byte
      // 'local M = {}' = 12 bytes
      // Total = 34 bytes
      const commentBytes = 3 + 3 + 3 + 1 + 4 + 1 + 6;
      const newlineBytes = 1;
      const codeBytes = 12;
      expect(map.byteLength).toBe(commentBytes + newlineBytes + codeBytes);

      const newlineByteIndex = commentBytes;
      expect(map.byteIndexToJsIndex(newlineByteIndex)).toBe(15); // newline char at JS index 15

      const codeStartByteIndex = commentBytes + newlineBytes;
      expect(map.byteIndexToJsIndex(codeStartByteIndex)).toBe(16); // 'local' starts at JS index 16
    });

    it('handles 2-byte UTF-8 characters (Latin-1 supplement)', () => {
      const source = 'café';
      const map = createRisuLuaUtf8ByteStringMap(source);

      expect(map.byteLength).toBe(5);
      expect(map.jsIndexToByteIndex(0)).toBe(0);
      expect(map.jsIndexToByteIndex(3)).toBe(3);
      expect(map.jsIndexToByteIndex(4)).toBe(5);

      expect(map.byteIndexToJsIndex(3)).toBe(3);
      expect(map.byteIndexToJsIndex(4)).toBe(3);
    });
  });

  describe('Range conversion', () => {
    it('round-trips JS range through byte range and back', () => {
      const source = '한글 😀 test';
      const map = createRisuLuaUtf8ByteStringMap(source);

      const jsRange = { startIndex: 3, endIndex: 8 };
      const byteRange = map.jsRangeToByteRange(jsRange);
      const backToJs = map.byteRangeToJsRange(byteRange);

      expect(backToJs).toEqual(jsRange);
    });

    it('converts byte ranges to JS ranges correctly', () => {
      const source = '한글 😀';
      const map = createRisuLuaUtf8ByteStringMap(source);

      const byteRange = { startByte: 0, endByte: 6 };
      const jsRange = map.byteRangeToJsRange(byteRange);

      expect(jsRange.startIndex).toBe(0);
      expect(jsRange.endIndex).toBe(2);
      expect(source.slice(jsRange.startIndex, jsRange.endIndex)).toBe('한글');
    });

    it('handles byte ranges spanning surrogate pairs', () => {
      const source = 'a😀b';
      const map = createRisuLuaUtf8ByteStringMap(source);

      const byteRange = { startByte: 1, endByte: 5 };
      const jsRange = map.byteRangeToJsRange(byteRange);

      expect(jsRange.startIndex).toBe(1);
      expect(jsRange.endIndex).toBe(3);
      expect(source.slice(jsRange.startIndex, jsRange.endIndex)).toBe('😀');
    });
  });

  describe('Edge cases', () => {
    it('handles string with only surrogate pairs', () => {
      const source = '🌍🌎🌏';
      const map = createRisuLuaUtf8ByteStringMap(source);

      expect(map.byteLength).toBe(12);
      expect(map.jsIndexToByteIndex(0)).toBe(0);
      expect(map.jsIndexToByteIndex(2)).toBe(4);
      expect(map.jsIndexToByteIndex(4)).toBe(8);
      expect(map.jsIndexToByteIndex(6)).toBe(12);
    });

    it('handles high code points (CJK extension, 4 bytes)', () => {
      const source = '𠜎';
      const map = createRisuLuaUtf8ByteStringMap(source);

      expect(map.byteLength).toBe(4);
      expect(source.length).toBe(2);
    });

    it('preserves exact mapping for parser-like source with comments', () => {
      const source = '-- 한글 😀 prefix\nlocal M = {}';
      const map = createRisuLuaUtf8ByteStringMap(source);

      // Derive positions dynamically to avoid hardcoded offset errors
      // 'local' starts at index 16 (after '\n' at index 15)
      const localKeywordStart = source.indexOf('local');
      const localKeywordEnd = localKeywordStart + 'local'.length;
      const byteRange = map.jsRangeToByteRange({
        startIndex: localKeywordStart,
        endIndex: localKeywordEnd,
      });

      expect(map.byteIndexToJsIndex(byteRange.startByte)).toBe(localKeywordStart);
      expect(map.byteIndexToJsIndex(byteRange.endByte)).toBe(localKeywordEnd);
    });
  });
});
