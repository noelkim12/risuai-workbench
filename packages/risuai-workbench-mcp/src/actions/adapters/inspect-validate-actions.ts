/**
 * Phase 2 read-only action adapters for inspect/validate tools.
 * Thin wrappers over existing handlers; no handler logic rewritten.
 * @file packages/risuai-workbench-mcp/src/actions/adapters/inspect-validate-actions.ts
 */

import { ActionRegistry } from '../registry';
import type { WorkbenchAction } from '../types';
import type { DiagnosticEnvelope } from '../../contracts/diagnostics';

import {
  InspectPathInputSchema,
  InspectArtifactInputSchema,
  ValidateArtifactInputSchema,
  ValidatePathInputSchema,
  ValidateMetadataInputSchema,
  ValidateFrontmatterInputSchema,
  ValidateOrderInputSchema,
  ValidateRootMarkersInputSchema,
  ValidateCbsSyntaxInputSchema,
  BuildPathInputSchema,
  SuggestTestsInputSchema,
} from '../schemas/inspect-validate-schemas';

import type { InspectPathInput } from '../../tools/inspect/inspect-path';
import type { InspectArtifactInput } from '../../tools/inspect/inspect-artifact';

import type { ValidateArtifactInput } from '../../tools/validate/validate-artifact';
import type { ValidatePathInput } from '../../tools/validate/validate-path';
import type { ValidateMetadataInput } from '../../tools/validate/validate-metadata';
import type { ValidateFrontmatterInput } from '../../tools/validate/validate-frontmatter';
import type { ValidateOrderInput } from '../../tools/validate/validate-order';
import type { ValidateRootMarkersInput } from '../../tools/validate/validate-root-markers';
import type { ValidateCbsSyntaxInput } from '../../tools/validate/validate-cbs-syntax';
import type { BuildPathInput } from '../../tools/validate/build-path';
import type { SuggestTestsInput } from '../../tools/validate/suggest-tests';

import {
  handleInspectPath,
  handleInspectArtifact,
} from '../../tools/inspect';

import {
  handleValidateArtifact,
  handleValidatePath,
  handleValidateMetadata,
  handleValidateFrontmatter,
  handleValidateOrder,
  handleValidateRootMarkers,
  handleValidateCbsSyntax,
  handleBuildPath,
  handleSuggestTests,
} from '../../tools/validate';

/**
 * registerInspectValidateActions 함수.
 * Populates the ActionRegistry with read-only inspect/validate actions.
 *
 * @param registry - the ActionRegistry to populate
 */
export function registerInspectValidateActions(registry: ActionRegistry): void {
  registry.register({
    id: 'inspect.path',
    legacyToolName: 'workbench.inspect_path',
    title: 'Inspect path',
    summary: 'Describe the role and artifact ownership of a workspace path.',
    capability: 'inspect',
    risk: 'read_only',
    inputSchema: InspectPathInputSchema,
    execute: (input, context) => handleInspectPath(input, context.workspace),
  } as WorkbenchAction<InspectPathInput, DiagnosticEnvelope>);

  registry.register({
    id: 'inspect.artifact',
    legacyToolName: 'workbench.inspect_artifact',
    title: 'Inspect artifact',
    summary: 'Summarize artifact root contracts, marker files, and related docs.',
    capability: 'inspect',
    risk: 'read_only',
    inputSchema: InspectArtifactInputSchema,
    execute: (input, context) => handleInspectArtifact(input, context.workspace),
  } as WorkbenchAction<InspectArtifactInput, DiagnosticEnvelope>);

  registry.register({
    id: 'validate.artifact',
    legacyToolName: 'workbench.validate_artifact',
    title: 'Validate artifact',
    summary: 'Validate full artifact root structure.',
    capability: 'validate',
    risk: 'read_only',
    inputSchema: ValidateArtifactInputSchema,
    execute: (input, context) => handleValidateArtifact(input, context.workspace),
  } as WorkbenchAction<ValidateArtifactInput, DiagnosticEnvelope>);

  registry.register({
    id: 'validate.path',
    legacyToolName: 'workbench.validate_path',
    title: 'Validate path',
    summary: 'Validate canonical directory, suffix, and stem policy.',
    capability: 'validate',
    risk: 'read_only',
    inputSchema: ValidatePathInputSchema,
    execute: (input, context) => handleValidatePath(input, context.workspace),
  } as WorkbenchAction<ValidatePathInput, DiagnosticEnvelope>);

  registry.register({
    id: 'validate.metadata',
    legacyToolName: 'workbench.validate_metadata',
    title: 'Validate metadata',
    summary: 'Validate structured metadata owner and legacy/deferred surface.',
    capability: 'validate',
    risk: 'read_only',
    inputSchema: ValidateMetadataInputSchema,
    execute: (input, context) => handleValidateMetadata(input, context.workspace),
  } as WorkbenchAction<ValidateMetadataInput, DiagnosticEnvelope>);

  registry.register({
    id: 'validate.frontmatter',
    legacyToolName: 'workbench.validate_frontmatter',
    title: 'Validate frontmatter',
    summary: 'Validate frontmatter delimiter, field schema, and round-trip risk.',
    capability: 'validate',
    risk: 'read_only',
    inputSchema: ValidateFrontmatterInputSchema,
    execute: (input, context) => handleValidateFrontmatter(input, context.workspace),
  } as WorkbenchAction<ValidateFrontmatterInput, DiagnosticEnvelope>);

  registry.register({
    id: 'validate.order',
    legacyToolName: 'workbench.validate_order',
    title: 'Validate order',
    summary: 'Validate _order.json entries against actual canonical files.',
    capability: 'validate',
    risk: 'read_only',
    inputSchema: ValidateOrderInputSchema,
    execute: (input, context) => handleValidateOrder(input, context.workspace),
  } as WorkbenchAction<ValidateOrderInput, DiagnosticEnvelope>);

  registry.register({
    id: 'validate.root_markers',
    legacyToolName: 'workbench.validate_root_markers',
    title: 'Validate root markers',
    summary: 'Validate .risuchar/.risumodule conflicts and schema.',
    capability: 'validate',
    risk: 'read_only',
    inputSchema: ValidateRootMarkersInputSchema,
    execute: (input, context) => handleValidateRootMarkers(input, context.workspace),
  } as WorkbenchAction<ValidateRootMarkersInput, DiagnosticEnvelope>);

  registry.register({
    id: 'validate.cbs_syntax',
    legacyToolName: 'workbench.validate_cbs_syntax',
    title: 'Validate CBS syntax',
    summary: 'Validate CBS syntax, tag usage, and bracket balance in CBS content.',
    capability: 'validate',
    risk: 'read_only',
    inputSchema: ValidateCbsSyntaxInputSchema,
    execute: (input) => handleValidateCbsSyntax(input),
  } as WorkbenchAction<ValidateCbsSyntaxInput, DiagnosticEnvelope<unknown>>);

  registry.register({
    id: 'validate.build_path',
    legacyToolName: 'workbench.build_path',
    title: 'Build path',
    summary: 'Build canonical relative path from target/artifact/stem components.',
    capability: 'validate',
    risk: 'read_only',
    inputSchema: BuildPathInputSchema,
    execute: (input) => handleBuildPath(input),
  } as WorkbenchAction<BuildPathInput, DiagnosticEnvelope>);

  registry.register({
    id: 'validate.suggest_tests',
    legacyToolName: 'workbench.suggest_tests',
    title: 'Suggest tests',
    summary: 'Suggest focused tests for a planned path change.',
    capability: 'validate',
    risk: 'read_only',
    inputSchema: SuggestTestsInputSchema,
    execute: (input) => handleSuggestTests(input),
  } as WorkbenchAction<SuggestTestsInput, DiagnosticEnvelope>);
}
