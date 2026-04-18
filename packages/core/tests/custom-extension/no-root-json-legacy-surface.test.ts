/**
 * T16: No Root JSON Legacy Surface Guard Test
 *
 * This test scans the codebase for forbidden active dependencies on root JSON files
 * (charx.json, module.json, preset.json) and fails if they are found in active
 * runtime surfaces outside of allowed exceptions.
 *
 * Allowed exceptions:
 * - Binary output serialization (pack workflows writing to .charx/.risum files)
 * - Archival documentation (docs/custom-extension-design.md)
 * - Test fixtures and test data setup
 * - Active docs mentioning deferred T16 status (legacy/fallback/deferred wording)
 * 
 * NOTE: T16 strict root-JSON eradication is DEFERRED / out of current approval scope.
 * The analyze workflow uses canonical-first detection exclusively in runtime code.
 * Active docs may acknowledge the deferred status but must not present root JSON
 * as the current standard or source of truth.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const SRC_DIR = path.join(ROOT, 'src');
const DOCS_DIR = path.join(ROOT, '..', '..', 'docs');

/** Patterns that indicate forbidden active root-JSON dependencies */
const FORBIDDEN_PATTERNS = [
  // Require/dependency on root JSON files as primary source
  { pattern: /require.*charx\.json/, desc: 'Require charx.json' },
  { pattern: /require.*module\.json/, desc: 'Require module.json' },
  { pattern: /require.*preset\.json/, desc: 'Require preset.json' },
  // Reading root JSON as primary input (not fallback)
  { pattern: /readJson.*charx\.json.*primary/i, desc: 'Primary charx.json read' },
  { pattern: /readJson.*module\.json.*primary/i, desc: 'Primary module.json read' },
  { pattern: /readJson.*preset\.json.*primary/i, desc: 'Primary preset.json read' },
  // Any active runtime code reading root JSON (except allowed paths)
  { pattern: /readFile.*charx\.json/, desc: 'Read charx.json file' },
  { pattern: /readFile.*module\.json/, desc: 'Read module.json file' },
  { pattern: /readFile.*preset\.json/, desc: 'Read preset.json file' },
];

/** Allowed exception paths */
const ALLOWED_PATHS = [
  // Archival documentation (explicitly allowed by T16)
  'docs/custom-extension-design.md',
  'docs/custom-extension-design.backup.md',
  // Binary output serialization is allowed (charx.json inside .charx files)
  'src/cli/pack/character/workflow.ts', // Lines 580, 626 write charx.json to zip
  // Test files are allowed to reference root JSON for test data
  'tests/',
  // Extract workflow output structures doc is archival/spec (will be updated separately)
  // but we check it has the right canonical-first language
];

/** Files that MUST be updated to canonical language */
const ACTIVE_DOC_PATHS = [
  'src/cli/CLI.md',
  'src/cli/extract/workflow-output-structures.md',
  'packages/cbs-lsp/README.md',
];

function* walkFiles(dir: string, extension: string): Generator<string> {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.includes('node_modules')) {
      yield* walkFiles(fullPath, extension);
    } else if (entry.isFile() && entry.name.endsWith(extension)) {
      yield fullPath;
    }
  }
}

function isAllowedPath(filePath: string): boolean {
  const relativePath = path.relative(ROOT, filePath);
  return ALLOWED_PATHS.some((allowed) =>
    relativePath.includes(allowed.replace(/\//g, path.sep)),
  );
}

describe('T16: No Root JSON Legacy Surface', () => {
  describe('Active runtime code', () => {
    it('should not have forbidden root-JSON dependency patterns', () => {
      const violations: Array<{ file: string; line: number; match: string }> = [];

      for (const filePath of walkFiles(SRC_DIR, '.ts')) {
        // Skip allowed paths
        if (isAllowedPath(filePath)) continue;

        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          // Skip comments
          if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

          for (const { pattern, desc } of FORBIDDEN_PATTERNS) {
            if (pattern.test(line)) {
              violations.push({
                file: path.relative(ROOT, filePath),
                line: i + 1,
                match: `${desc}: ${line.trim().slice(0, 80)}`,
              });
            }
          }
        }
      }

      if (violations.length > 0) {
        console.error('\n🚫 Forbidden root-JSON dependencies found:\n');
        violations.forEach((v) => {
          console.error(`  ${v.file}:${v.line}`);
          console.error(`    ${v.match}\n`);
        });
      }

      expect(violations).toHaveLength(0);
    });

    it('should use canonical-first detection in analyze workflow', () => {
      const workflowPath = path.join(SRC_DIR, 'cli/analyze/workflow.ts');
      const content = fs.readFileSync(workflowPath, 'utf-8');

      // Should detect canonical markers (canonical-first is the active standard)
      expect(content).toContain("fs.existsSync(path.join(targetDir, 'metadata.json'))");
      expect(content).toContain("fs.existsSync(path.join(targetDir, 'character'))");
      expect(content).toContain("fs.existsSync(path.join(targetDir, 'lorebooks'))");

      // T16 strict root-JSON eradication is deferred - runtime uses canonical-first exclusively
      // Docs may acknowledge deferred status, but runtime doesn't implement root-JSON fallback
      expect(content).not.toMatch(/module\.json.*fallback|preset\.json.*fallback|charx\.json.*fallback/i);
    });
  });

  describe('Active documentation', () => {
    it('CLI.md should describe canonical workspace detection as primary', () => {
      const cliDocPath = path.join(SRC_DIR, 'cli/CLI.md');
      const content = fs.readFileSync(cliDocPath, 'utf-8');

      // Should mention canonical markers
      expect(content).toMatch(/canonical.*marker|character\/.*lorebooks\//i);

      // Should NOT present root JSON as the current standard/source of truth
      // But MAY acknowledge deferred T16 fallback status (legacy/fallback/deferred wording)
      const hasRootJsonMention = content.match(/module\.json|preset\.json|charx\.json/);
      if (hasRootJsonMention) {
        // If root JSON is mentioned, it must be in context of legacy/fallback/deferred
        const surroundingContext = content.substring(
          Math.max(0, hasRootJsonMention.index! - 200),
          Math.min(content.length, hasRootJsonMention.index! + 200),
        );
        expect(surroundingContext).toMatch(/legacy|fallback|deferred|deferred.*T16|T16.*deferred/i);
      }
    });

    it('cbs-lsp README should show canonical workspace structure only', () => {
      const lspReadmePath = path.join(ROOT, '..', 'cbs-lsp', 'README.md');
      if (!fs.existsSync(lspReadmePath)) {
        console.warn('cbs-lsp README not found, skipping');
        return;
      }

      const content = fs.readFileSync(lspReadmePath, 'utf-8');

      // Should show canonical directories
      expect(content).toMatch(/lorebooks\//);
      expect(content).toMatch(/regex\//);
      expect(content).toMatch(/lua\//);

      // Should NOT mention root JSON files at all
      expect(content).not.toMatch(/charx\.json|module\.json|preset\.json/);
    });
  });

  describe('Allowed exceptions', () => {
    it('exempts archival docs from root-JSON restrictions', () => {
      const archivalDocPath = path.join(DOCS_DIR, 'custom-extension-design.md');
      if (!fs.existsSync(archivalDocPath)) {
        console.warn('Archival doc not found, skipping');
        return;
      }

      const content = fs.readFileSync(archivalDocPath, 'utf-8');

      // Archival doc CAN mention root JSON freely
      expect(content).toMatch(/charx\.json|module\.json|preset\.json/);
    });

    it('allows binary output serialization in pack workflows', () => {
      const packWorkflowPath = path.join(SRC_DIR, 'cli/pack/character/workflow.ts');
      const content = fs.readFileSync(packWorkflowPath, 'utf-8');

      // Should write charx.json to zip output (binary serialization)
      expect(content).toContain("zipEntries['charx.json']");

      // Should document that this is binary output, not workspace sidecar
      expect(content).toMatch(/binary|output|\.charx|\.risum/i);
    });
  });

  describe('Strict legacy rejection', () => {
    it('should not normalize legacy root-JSON as valid approach in active docs', () => {
      // Scan active docs for any language that presents root JSON as acceptable/current standard
      const activeDocs = [
        path.join(SRC_DIR, 'cli/CLI.md'),
        path.join(SRC_DIR, 'cli/extract/workflow-output-structures.md'),
      ];

      const problematicPatterns = [
        // Patterns that suggest root JSON is still a valid/current approach (NOT deferred/fallback)
        { pattern: /root.*json.*valid|valid.*root.*json/i, desc: 'Root JSON presented as valid' },
        { pattern: /still.*support.*charx\.json|still.*support.*module\.json/i, desc: 'Legacy presented as current support' },
        { pattern: /may.*use.*charx\.json|may.*use.*module\.json/i, desc: 'Root JSON presented as optional' },
      ];

      const violations: Array<{ file: string; line: number; match: string }> = [];

      for (const docPath of activeDocs) {
        if (!fs.existsSync(docPath)) continue;
        
        const content = fs.readFileSync(docPath, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          // Skip lines that explicitly mark as legacy/fallback/deferred/T16
          if (line.match(/legacy|fallback|deferred|deferred.*T16|T16.*deferred|하위호환|구.*방식/i)) continue;

          for (const { pattern, desc } of problematicPatterns) {
            if (pattern.test(line)) {
              violations.push({
                file: path.relative(ROOT, docPath),
                line: i + 1,
                match: `${desc}: ${line.trim().slice(0, 80)}`,
              });
            }
          }
        }
      }

      if (violations.length > 0) {
        console.error('\n🚫 Active docs presenting root-JSON as valid approach:\n');
        violations.forEach((v) => {
          console.error(`  ${v.file}:${v.line}`);
          console.error(`    ${v.match}\n`);
        });
      }

      expect(violations).toHaveLength(0);
    });

    it('active runtime must use canonical-first detection exclusively', () => {
      // T16 strict root-JSON eradication is deferred - runtime uses canonical-first
      // but docs may acknowledge the deferred status
      const analyzeWorkflowPath = path.join(SRC_DIR, 'cli/analyze/workflow.ts');
      
      if (fs.existsSync(analyzeWorkflowPath)) {
        const content = fs.readFileSync(analyzeWorkflowPath, 'utf-8');
        
        // Should check canonical markers exclusively
        const hasCanonicalMarkers = content.includes('metadata.json') && 
          (content.includes('character') || content.includes('lorebooks'));
        
        // Runtime code should not implement root-JSON fallback logic
        // (docs may mention it as deferred, but runtime doesn't use it)
        const hasRootJsonFallbackLogic = 
          (content.includes('module.json') || content.includes('preset.json')) &&
          !content.includes('Root JSON fallback removed');
        
        expect(hasCanonicalMarkers).toBe(true);
        expect(hasRootJsonFallbackLogic).toBe(false);
      }
    });
  });

  describe('Canonical workspace contract', () => {
    it('verify canonical file discovery exists', () => {
      // File discovery moved to node layer (it uses node:fs/node:path)
      const discoveryPath = path.join(
        SRC_DIR,
        'node/custom-extension-file-discovery.ts',
      );
      expect(fs.existsSync(discoveryPath)).toBe(true);

      const content = fs.readFileSync(discoveryPath, 'utf-8');

      // Should discover .risu* files (uses suffix parsing)
      expect(content).toMatch(/\.risu|parseCustomExtensionArtifactFromSuffix/);
    });

    it('verify canonical adapters exist for all extensions', () => {
      const extensionsDir = path.join(SRC_DIR, 'domain/custom-extension/extensions');
      expect(fs.existsSync(extensionsDir)).toBe(true);

      const requiredExtensions = [
        'toggle.ts',
        'lua.ts',
        'html.ts',
        'variable.ts',
        'prompt-template.ts',
        'lorebook.ts',
      ];

      for (const ext of requiredExtensions) {
        expect(
          fs.existsSync(path.join(extensionsDir, ext)),
          `Extension adapter ${ext} should exist`,
        ).toBe(true);
      }

      const regexAdapterPath = path.join(SRC_DIR, 'domain/regex/adapter.ts');
      expect(
        fs.existsSync(regexAdapterPath),
        'Regex adapter should exist at domain/regex/adapter.ts after refactor',
      ).toBe(true);
    });
  });
});
