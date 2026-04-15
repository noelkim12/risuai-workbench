import { describe, it, expect } from 'vitest'
import {
  mapDocumentToCbsFragments,
  createDiagnosticForFragment,
  routeDiagnosticsForDocument,
} from '../src/diagnostics-router'
import type { CbsFragment } from 'risu-workbench-core'

describe('custom-extension diagnostics', () => {
  describe('mapDocumentToCbsFragments', () => {
    it('maps lorebook CONTENT section to fragments', () => {
      const content = `---
name: test_entry
---
@@@ KEYS
key1
@@@ CONTENT
Hello {{user}}, welcome!
`
      const result = mapDocumentToCbsFragments('/path/to/entry.risulorebook', content)

      expect(result).not.toBeNull()
      expect(result?.artifact).toBe('lorebook')
      expect(result?.fragments).toHaveLength(1)
      expect(result?.fragments[0].section).toBe('CONTENT')
      expect(result?.fragments[0].content).toContain('{{user}}')
    })

    it('maps regex IN and OUT sections to fragments', () => {
      const content = `---
comment: test regex
type: plain
---
@@@ IN
Hello {{user}}
@@@ OUT
Hi there!
`
      const result = mapDocumentToCbsFragments('/path/to/script.risuregex', content)

      expect(result).not.toBeNull()
      expect(result?.artifact).toBe('regex')
      expect(result?.fragments).toHaveLength(2)

      const inFragment = result?.fragments.find(f => f.section === 'IN')
      const outFragment = result?.fragments.find(f => f.section === 'OUT')

      expect(inFragment).toBeDefined()
      expect(inFragment?.content).toContain('{{user}}')
      expect(outFragment).toBeDefined()
      expect(outFragment?.content).toBe('Hi there!')
    })

    it('maps prompt TEXT section to fragments', () => {
      const content = `---
variant: plain
---
@@@ TEXT
System: {{system_prompt}}
User: {{input}}
`
      const result = mapDocumentToCbsFragments('/path/to/prompt.risuprompt', content)

      expect(result).not.toBeNull()
      expect(result?.artifact).toBe('prompt')
      expect(result?.fragments).toHaveLength(1)
      expect(result?.fragments[0].section).toBe('TEXT')
    })

    it('maps html full file to single fragment', () => {
      const content = `<div class="character">
  <h1>{{char}}</h1>
  <p>{{description}}</p>
</div>`
      const result = mapDocumentToCbsFragments('/path/to/background.risuhtml', content)

      expect(result).not.toBeNull()
      expect(result?.artifact).toBe('html')
      expect(result?.fragments).toHaveLength(1)
      expect(result?.fragments[0].section).toBe('full')
      expect(result?.fragments[0].content).toBe(content)
    })

    it('maps lua full file to single fragment', () => {
      const content = `local name = "{{char}}"
local greeting = "Hello, " .. name
return greeting`
      const result = mapDocumentToCbsFragments('/path/to/script.risulua', content)

      expect(result).not.toBeNull()
      expect(result?.artifact).toBe('lua')
      expect(result?.fragments).toHaveLength(1)
      expect(result?.fragments[0].section).toBe('full')
    })

    it('returns null for toggle files (non-CBS)', () => {
      const content = 'toggle_setting = true'
      const result = mapDocumentToCbsFragments('/path/to/toggle.risutoggle', content)

      expect(result).toBeNull()
    })

    it('returns null for variable files (non-CBS)', () => {
      const content = 'key1=value1\nkey2=value2'
      const result = mapDocumentToCbsFragments('/path/to/vars.risuvar', content)

      expect(result).toBeNull()
    })

    it('returns null for unknown extensions', () => {
      const result = mapDocumentToCbsFragments('/path/to/file.txt', 'content')
      expect(result).toBeNull()
    })

    it('handles empty content gracefully', () => {
      const result = mapDocumentToCbsFragments('/path/to/entry.risulorebook', '')
      expect(result).not.toBeNull()
      expect(result?.fragments).toHaveLength(0)
    })

    it('handles lorebook without CONTENT section', () => {
      const content = `---
name: test_entry
---
@@@ KEYS
key1
`
      const result = mapDocumentToCbsFragments('/path/to/entry.risulorebook', content)

      expect(result).not.toBeNull()
      expect(result?.fragments).toHaveLength(0)
    })

    it('handles regex with only IN section', () => {
      const content = `---
comment: test
type: plain
---
@@@ IN
Hello {{user}}
`
      const result = mapDocumentToCbsFragments('/path/to/script.risuregex', content)

      expect(result).not.toBeNull()
      expect(result?.fragments).toHaveLength(1)
      expect(result?.fragments[0].section).toBe('IN')
    })
  })

  describe('createDiagnosticForFragment', () => {
    it('creates diagnostic with correct range', () => {
      // Document: line 0-3 are headers, line 4 is the actual content
      const documentContent = '---\nname: test\n---\n@@@ CONTENT\nHello {{user}}'
      // Fragment starts at position 31 (after "---\nname: test\n---\n@@@ CONTENT\n")
      const fragment: CbsFragment = {
        section: 'CONTENT',
        start: 31,
        end: 45,
        content: 'Hello {{user}}',
      }

      const diagnostic = createDiagnosticForFragment(
        documentContent,
        fragment,
        'Test message',
        'error',
        'CBS001',
        6, // offset within fragment content - points to "{{user}}"
        14 // end offset within fragment content
      )

      expect(diagnostic.message).toBe('Test message')
      expect(diagnostic.code).toBe('CBS001')
      expect(diagnostic.range.start.line).toBe(4) // Line 4 in document (0-indexed)
      expect(diagnostic.range.start.character).toBe(6) // "{{user}}" starts at char 6 in line
      expect(diagnostic.range.end.line).toBe(4)
      expect(diagnostic.range.end.character).toBe(14)
    })

    it('defaults to error severity', () => {
      const documentContent = 'test content'
      const fragment: CbsFragment = {
        section: 'CONTENT',
        start: 0,
        end: 12,
        content: 'test content',
      }

      const diagnostic = createDiagnosticForFragment(
        documentContent,
        fragment,
        'Warning message',
        undefined,
        'CBS100'
      )

      expect(diagnostic.severity).toBe(1) // DiagnosticSeverity.Error = 1
    })
  })

  describe('routeDiagnosticsForDocument', () => {
    it('routes diagnostics for lorebook with CBS content', () => {
      const content = `---
name: test
---
@@@ KEYS
key
@@@ CONTENT
{{unknown_function::arg}}
`
      const diagnostics = routeDiagnosticsForDocument(
        '/path/to/entry.risulorebook',
        content,
        { checkUnknownFunctions: true }
      )

      expect(diagnostics).toBeDefined()
      expect(Array.isArray(diagnostics)).toBe(true)
    })

    it('returns empty array for toggle files', () => {
      const diagnostics = routeDiagnosticsForDocument(
        '/path/to/toggle.risutoggle',
        'toggle = true',
        {}
      )

      expect(diagnostics).toEqual([])
    })

    it('returns empty array for variable files', () => {
      const diagnostics = routeDiagnosticsForDocument(
        '/path/to/vars.risuvar',
        'key=value',
        {}
      )

      expect(diagnostics).toEqual([])
    })

    it('returns empty array for unknown extensions', () => {
      const diagnostics = routeDiagnosticsForDocument(
        '/path/to/file.txt',
        'content',
        {}
      )

      expect(diagnostics).toEqual([])
    })
  })
})
