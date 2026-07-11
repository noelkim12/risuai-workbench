import type { AnalysisShowcase } from 'risu-workbench-core';
import { isAnalysisShowcase } from './showcaseGuard';

export const ANALYSIS_SHOWCASE_PROTOCOL = 'risu-workbench.analysis-showcase' as const;
export const ANALYSIS_SHOWCASE_PROTOCOL_VERSION = 1 as const;

export type AnalysisShowcaseFreshness = 'fresh' | 'outdated';

export type AnalysisShowcaseEnvelope<TType extends string, TPayload> = {
  readonly protocol: typeof ANALYSIS_SHOWCASE_PROTOCOL;
  readonly version: typeof ANALYSIS_SHOWCASE_PROTOCOL_VERSION;
  readonly type: TType;
  readonly payload: TPayload;
};

export type AnalysisShowcaseReadyMessage = AnalysisShowcaseEnvelope<'analysis-showcase/ready', Record<string, never>>;
export type AnalysisShowcaseOpenFullReportMessage = AnalysisShowcaseEnvelope<
  'analysis-showcase/openFullReport',
  Record<string, never>
>;
export type AnalysisShowcaseSavePngMessage = AnalysisShowcaseEnvelope<
  'analysis-showcase/savePng',
  { readonly dataUrl: string }
>;
export type AnalysisShowcasePngCaptureFailedMessage = AnalysisShowcaseEnvelope<
  'analysis-showcase/pngCaptureFailed',
  { readonly message: string }
>;

export type AnalysisShowcaseLoadedPayload = {
  readonly showcase: AnalysisShowcase;
  readonly freshness: AnalysisShowcaseFreshness;
  readonly reportAvailable: boolean;
  readonly captureOnReady: boolean;
};
export type AnalysisShowcaseLoadedMessage = AnalysisShowcaseEnvelope<
  'analysis-showcase/loaded',
  AnalysisShowcaseLoadedPayload
>;
export type AnalysisShowcaseSaveCompletedMessage = AnalysisShowcaseEnvelope<
  'analysis-showcase/saveCompleted',
  Record<string, never>
>;
export type AnalysisShowcaseErrorMessage = AnalysisShowcaseEnvelope<
  'analysis-showcase/error',
  { readonly message: string }
>;

export type AnalysisShowcaseWebviewMessage =
  | AnalysisShowcaseReadyMessage
  | AnalysisShowcaseOpenFullReportMessage
  | AnalysisShowcaseSavePngMessage
  | AnalysisShowcasePngCaptureFailedMessage;

export type AnalysisShowcaseExtensionMessage =
  | AnalysisShowcaseLoadedMessage
  | AnalysisShowcaseSaveCompletedMessage
  | AnalysisShowcaseErrorMessage;

type AnalysisShowcasePayloadGuard<TPayload> = (payload: unknown) => payload is TPayload;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(payload: Record<string, unknown>, keys: readonly string[]): boolean {
  const actualKeys = Object.keys(payload);
  return actualKeys.length === keys.length && actualKeys.every((key) => keys.includes(key));
}

function isEmptyPayload(payload: unknown): payload is Record<string, never> {
  return isPlainRecord(payload) && hasOnlyKeys(payload, []);
}

function isLoadedPayload(payload: unknown): payload is AnalysisShowcaseLoadedPayload {
  return (
    isPlainRecord(payload) &&
    hasOnlyKeys(payload, ['showcase', 'freshness', 'reportAvailable', 'captureOnReady']) &&
    isAnalysisShowcase(payload.showcase) &&
    (payload.freshness === 'fresh' || payload.freshness === 'outdated') &&
    typeof payload.reportAvailable === 'boolean' &&
    typeof payload.captureOnReady === 'boolean'
  );
}

function isErrorPayload(payload: unknown): payload is AnalysisShowcaseErrorMessage['payload'] {
  return isPlainRecord(payload) && hasOnlyKeys(payload, ['message']) && typeof payload.message === 'string';
}

function isAnalysisShowcaseEnvelope<TMessage extends AnalysisShowcaseExtensionMessage>(
  message: unknown,
  type: TMessage['type'],
  payloadGuard: AnalysisShowcasePayloadGuard<TMessage['payload']>,
): message is TMessage {
  return (
    isPlainRecord(message) &&
    hasOnlyKeys(message, ['protocol', 'version', 'type', 'payload']) &&
    message.protocol === ANALYSIS_SHOWCASE_PROTOCOL &&
    message.version === ANALYSIS_SHOWCASE_PROTOCOL_VERSION &&
    message.type === type &&
    payloadGuard(message.payload)
  );
}

export function createAnalysisShowcaseReadyMessage(): AnalysisShowcaseReadyMessage {
  return {
    protocol: ANALYSIS_SHOWCASE_PROTOCOL,
    version: ANALYSIS_SHOWCASE_PROTOCOL_VERSION,
    type: 'analysis-showcase/ready',
    payload: {},
  };
}

export function createAnalysisShowcaseOpenFullReportMessage(): AnalysisShowcaseOpenFullReportMessage {
  return {
    protocol: ANALYSIS_SHOWCASE_PROTOCOL,
    version: ANALYSIS_SHOWCASE_PROTOCOL_VERSION,
    type: 'analysis-showcase/openFullReport',
    payload: {},
  };
}

export function createAnalysisShowcaseSavePngMessage(dataUrl: string): AnalysisShowcaseSavePngMessage {
  return {
    protocol: ANALYSIS_SHOWCASE_PROTOCOL,
    version: ANALYSIS_SHOWCASE_PROTOCOL_VERSION,
    type: 'analysis-showcase/savePng',
    payload: { dataUrl },
  };
}

export function createAnalysisShowcasePngCaptureFailedMessage(
  message: string,
): AnalysisShowcasePngCaptureFailedMessage {
  return {
    protocol: ANALYSIS_SHOWCASE_PROTOCOL,
    version: ANALYSIS_SHOWCASE_PROTOCOL_VERSION,
    type: 'analysis-showcase/pngCaptureFailed',
    payload: { message },
  };
}

export function isAnalysisShowcaseLoadedMessage(message: unknown): message is AnalysisShowcaseLoadedMessage {
  return isAnalysisShowcaseEnvelope(message, 'analysis-showcase/loaded', isLoadedPayload);
}

export function isAnalysisShowcaseSaveCompletedMessage(
  message: unknown,
): message is AnalysisShowcaseSaveCompletedMessage {
  return isAnalysisShowcaseEnvelope(message, 'analysis-showcase/saveCompleted', isEmptyPayload);
}

export function isAnalysisShowcaseErrorMessage(message: unknown): message is AnalysisShowcaseErrorMessage {
  return isAnalysisShowcaseEnvelope(message, 'analysis-showcase/error', isErrorPayload);
}
