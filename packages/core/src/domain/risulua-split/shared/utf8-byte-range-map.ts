export interface RisuLuaUtf8ByteRange {
  startByte: number;
  endByte: number;
}

export interface RisuLuaStringIndexRange {
  startIndex: number;
  endIndex: number;
}

export interface RisuLuaUtf8ByteStringMap {
  readonly byteLength: number;
  jsIndexToByteIndex(index: number): number;
  byteIndexToJsIndex(byteIndex: number): number;
  byteRangeToJsRange(range: RisuLuaUtf8ByteRange): RisuLuaStringIndexRange;
  jsRangeToByteRange(range: RisuLuaStringIndexRange): RisuLuaUtf8ByteRange;
}

function utf8ByteLength(codePoint: number): number {
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

export function createRisuLuaUtf8ByteStringMap(source: string): RisuLuaUtf8ByteStringMap {
  const jsIndexToByte = new Array<number>(source.length + 1);
  const byteIndexToJs: number[] = [];
  let byteCursor = 0;

  for (let jsIndex = 0; jsIndex < source.length;) {
    jsIndexToByte[jsIndex] = byteCursor;
    const codePoint = source.codePointAt(jsIndex);
    if (codePoint === undefined) {
      break;
    }

    const characterByteLength = utf8ByteLength(codePoint);
    for (let byteOffset = 0; byteOffset < characterByteLength; byteOffset += 1) {
      byteIndexToJs[byteCursor + byteOffset] = jsIndex;
    }

    byteCursor += characterByteLength;
    const charLength = codePoint > 0xffff ? 2 : 1;
    const nextJsIndex = jsIndex + charLength;
    for (let fillIndex = jsIndex + 1; fillIndex <= nextJsIndex; fillIndex += 1) {
      jsIndexToByte[fillIndex] = byteCursor;
    }
    jsIndex = nextJsIndex;
  }

  jsIndexToByte[source.length] = byteCursor;
  byteIndexToJs[byteCursor] = source.length;

  function clampJsIndex(index: number): number {
    return Math.max(0, Math.min(source.length, index));
  }

  function clampByteIndex(byteIndex: number): number {
    return Math.max(0, Math.min(byteCursor, byteIndex));
  }

  return {
    byteLength: byteCursor,
    jsIndexToByteIndex(index: number): number {
      return jsIndexToByte[clampJsIndex(index)] ?? byteCursor;
    },
    byteIndexToJsIndex(byteIndex: number): number {
      const clamped = clampByteIndex(byteIndex);
      return byteIndexToJs[clamped] ?? source.length;
    },
    byteRangeToJsRange(range: RisuLuaUtf8ByteRange): RisuLuaStringIndexRange {
      return {
        startIndex: this.byteIndexToJsIndex(range.startByte),
        endIndex: this.byteIndexToJsIndex(range.endByte),
      };
    },
    jsRangeToByteRange(range: RisuLuaStringIndexRange): RisuLuaUtf8ByteRange {
      return {
        startByte: this.jsIndexToByteIndex(range.startIndex),
        endByte: this.jsIndexToByteIndex(range.endIndex),
      };
    },
  };
}
