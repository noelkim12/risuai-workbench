import { describe, it, expect } from 'vitest'
import {
  isCbsBearingFile,
  getArtifactTypeFromPath,
  shouldRouteForDiagnostics,
  SUPPORTED_CBS_EXTENSIONS,
  EXPLICITLY_IGNORED_EXTENSIONS,
} from '../src/document-router'

describe('custom-extension routing', () => {
  describe('supported CBS-bearing files', () => {
    it('recognizes .risulorebook as CBS-bearing', () => {
      expect(isCbsBearingFile('/path/to/entry.risulorebook')).toBe(true)
      expect(isCbsBearingFile('C:\\path\\to\\entry.risulorebook')).toBe(true)
    })

    it('recognizes .risuregex as CBS-bearing', () => {
      expect(isCbsBearingFile('/path/to/script.risuregex')).toBe(true)
    })

    it('recognizes .risuprompt as CBS-bearing', () => {
      expect(isCbsBearingFile('/path/to/prompt.risuprompt')).toBe(true)
    })

    it('recognizes .risuhtml as CBS-bearing', () => {
      expect(isCbsBearingFile('/path/to/background.risuhtml')).toBe(true)
    })

    it('recognizes .risulua as CBS-bearing', () => {
      expect(isCbsBearingFile('/path/to/triggerscript.risulua')).toBe(true)
    })

    it('is case-insensitive for extensions', () => {
      expect(isCbsBearingFile('/path/to/entry.RISULOREBOOK')).toBe(true)
      expect(isCbsBearingFile('/path/to/entry.Risuregex')).toBe(true)
    })
  })

  describe('explicitly ignored files', () => {
    it('ignores .risutoggle files', () => {
      expect(isCbsBearingFile('/path/to/toggle.risutoggle')).toBe(false)
      expect(EXPLICITLY_IGNORED_EXTENSIONS).toContain('.risutoggle')
    })

    it('ignores .risuvar files', () => {
      expect(isCbsBearingFile('/path/to/vars.risuvar')).toBe(false)
      expect(EXPLICITLY_IGNORED_EXTENSIONS).toContain('.risuvar')
    })

    it('shouldRouteForDiagnostics returns false for ignored files', () => {
      expect(shouldRouteForDiagnostics('/path/to/toggle.risutoggle')).toBe(false)
      expect(shouldRouteForDiagnostics('/path/to/vars.risuvar')).toBe(false)
    })
  })

  describe('unsupported files', () => {
    it('returns false for unknown extensions', () => {
      expect(isCbsBearingFile('/path/to/file.txt')).toBe(false)
      expect(isCbsBearingFile('/path/to/file.json')).toBe(false)
      expect(isCbsBearingFile('/path/to/file.js')).toBe(false)
    })

    it('returns false for files without extensions', () => {
      expect(isCbsBearingFile('/path/to/file')).toBe(false)
    })
  })

  describe('artifact type resolution', () => {
    it('resolves lorebook artifact from path', () => {
      expect(getArtifactTypeFromPath('/path/to/entry.risulorebook')).toBe('lorebook')
    })

    it('resolves regex artifact from path', () => {
      expect(getArtifactTypeFromPath('/path/to/script.risuregex')).toBe('regex')
    })

    it('resolves prompt artifact from path', () => {
      expect(getArtifactTypeFromPath('/path/to/prompt.risuprompt')).toBe('prompt')
    })

    it('resolves html artifact from path', () => {
      expect(getArtifactTypeFromPath('/path/to/background.risuhtml')).toBe('html')
    })

    it('resolves lua artifact from path', () => {
      expect(getArtifactTypeFromPath('/path/to/script.risulua')).toBe('lua')
    })

    it('returns null for ignored extensions', () => {
      expect(getArtifactTypeFromPath('/path/to/toggle.risutoggle')).toBeNull()
      expect(getArtifactTypeFromPath('/path/to/vars.risuvar')).toBeNull()
    })

    it('returns null for unknown extensions', () => {
      expect(getArtifactTypeFromPath('/path/to/file.txt')).toBeNull()
    })
  })

  describe('supported extensions list', () => {
    it('contains all CBS-bearing extensions', () => {
      expect(SUPPORTED_CBS_EXTENSIONS).toContain('.risulorebook')
      expect(SUPPORTED_CBS_EXTENSIONS).toContain('.risuregex')
      expect(SUPPORTED_CBS_EXTENSIONS).toContain('.risuprompt')
      expect(SUPPORTED_CBS_EXTENSIONS).toContain('.risuhtml')
      expect(SUPPORTED_CBS_EXTENSIONS).toContain('.risulua')
    })

    it('does not contain ignored extensions', () => {
      expect(SUPPORTED_CBS_EXTENSIONS).not.toContain('.risutoggle')
      expect(SUPPORTED_CBS_EXTENSIONS).not.toContain('.risuvar')
    })
  })
})
