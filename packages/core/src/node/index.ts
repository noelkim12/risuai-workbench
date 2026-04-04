import {
  ensureDir,
  writeBinary,
  writeJson,
  writeText,
  uniquePath,
  readJsonIfExists,
  readTextIfExists,
  dirExists,
} from './fs-helpers';
import {
  decodeCharacterJsonFromChunks,
  parsePngTextChunks,
  stripPngTextChunks,
  PNG_SIGNATURE,
  PNG_1X1_TRANSPARENT,
  JPEG_1X1,
  writePngTextChunks,
  encodeTextChunk,
  encodeChunk,
  crc32,
  isPng,
  isJpeg,
} from './png';
import { parseCardFile, parseCharxFile } from './charx-io';
import { executeLorebookPlan } from './lorebook-io';
import {
  listJsonFilesRecursive,
  listJsonFilesFlat,
  resolveOrderedFiles,
  readJson,
  isDir,
} from './json-listing';
import { encodeModuleRisum, encodeRPack, loadRPackEncodeMap } from './rpack';

const parsePngChunks = parsePngTextChunks;

export {
  parsePngTextChunks,
  stripPngTextChunks,
  decodeCharacterJsonFromChunks,
  parseCharxFile,
  parseCardFile,
  ensureDir,
  writeJson,
  writeText,
  writeBinary,
  uniquePath,
  readJsonIfExists,
  readTextIfExists,
  dirExists,
  parsePngChunks,
  executeLorebookPlan,
  listJsonFilesRecursive,
  listJsonFilesFlat,
  resolveOrderedFiles,
  readJson,
  isDir,
  PNG_SIGNATURE,
  PNG_1X1_TRANSPARENT,
  JPEG_1X1,
  writePngTextChunks,
  encodeTextChunk,
  encodeChunk,
  crc32,
  isPng,
  isJpeg,
  encodeModuleRisum,
  encodeRPack,
  loadRPackEncodeMap,
};
