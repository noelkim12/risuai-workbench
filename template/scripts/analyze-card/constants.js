'use strict';

// Truncation limits for report tables
const MAX_VARS_IN_REPORT = 80;
const MAX_ENTRIES_IN_REPORT = 50;
const MAX_SCRIPTS_IN_REPORT = 40;

// Element type identifiers
const ELEMENT_TYPES = {
  LOREBOOK: 'lorebook',
  REGEX: 'regex',
  LUA: 'lua',
  HTML: 'html',
  VARIABLES: 'variables',
  TYPESCRIPT: 'typescript'
};

// CBS operation types
const CBS_OPS = {
  READ: 'read',
  WRITE: 'write'
};

// JSDoc type definitions (for IDE support)
/**
 * @typedef {Object} ElementCBSData
 * @property {string} elementType - One of ELEMENT_TYPES values
 * @property {string} elementName - Human-readable element identifier
 * @property {Set<string>} reads - Variable names read by this element
 * @property {Set<string>} writes - Variable names written by this element
 */

/**
 * @typedef {Object} UnifiedVarEntry
 * @property {string} varName - Variable name
 * @property {Object} sources - Map of elementType → { readers: string[], writers: string[] }
 * @property {string|null} defaultValue - Initial value from DefaultVariables, or null
 * @property {number} elementCount - Number of distinct element types referencing this var
 * @property {'isolated'|'bridged'} direction - 'bridged' if 2+ element types reference it
 */

/**
 * @typedef {Object} LorebookStructure
 * @property {Array} folders - Folder hierarchy array
 * @property {Array} entries - All lorebook entries with analysis
 * @property {Object} stats - { totalEntries, totalFolders, activationModes, enabledCount, withCBS }
 * @property {Object} keywords - { all: string[], overlaps: Map }
 */

module.exports = { MAX_VARS_IN_REPORT, MAX_ENTRIES_IN_REPORT, MAX_SCRIPTS_IN_REPORT, ELEMENT_TYPES, CBS_OPS };
