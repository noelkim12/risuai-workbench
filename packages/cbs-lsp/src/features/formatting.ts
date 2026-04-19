import { TextEdit, DocumentFormattingParams } from 'vscode-languageserver/node';

import {
  createAgentMetadataAvailability,
  type AgentMetadataAvailabilityContract,
} from '../core';

export const FORMATTING_PROVIDER_AVAILABILITY = createAgentMetadataAvailability(
  'deferred',
  'formatting-provider:host-fragment-patch-semantics',
  'Formatting stays deferred until host-fragment patch semantics are safe for embedded CBS artifacts.',
);

/**
 * Formatting Provider - Phase 4~5 Deferral Contract
 *
 * Formatting is explicitly deferred until a later plan defines safe host-fragment
 * patch semantics for the following artifact types:
 * - .risulorebook (lorebook entries with CBS in CONTENT)
 * - .risuregex (regex scripts with CBS in IN/OUT)
 * - .risuprompt (prompt templates with CBS in TEXT/DEFAULT_TEXT)
 * - .risuhtml (background HTML with CBS fragments)
 * - .risulua (Lua scripts with embedded CBS macros)
 *
 * Rationale: These artifacts contain CBS embedded within host documents (JSON, HTML, Lua).
 * Safe formatting requires:
 * 1. Precise fragment boundary tracking (already implemented in Layer 2 providers)
 * 2. Host-document-aware patch generation (deferred)
 * 3. Validation that formatting does not corrupt non-CBS host content
 *
 * Until then, this provider returns an empty array (no-op) for all documents,
 * which is the conservative and correct behavior per LSP spec.
 *
 * Phase 4~5 Contract: This module MUST return [] for all formatting requests.
 * Future phases will implement actual formatting when host-fragment safety is guaranteed.
 */
export class FormattingProvider {
  readonly availability: AgentMetadataAvailabilityContract = FORMATTING_PROVIDER_AVAILABILITY;

  provide(_params: DocumentFormattingParams): TextEdit[] {
    // Phase 4~5: Formatting deferred - return no edits (no-op)
    // This is the conservative contract until host-fragment patch semantics are defined.
    return [];
  }
}
