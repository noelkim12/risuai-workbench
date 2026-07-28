import { isPlainRecord, parseAnalysisShowcase, type AnalysisShowcase } from '@risuai-workbench/core';

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

function hasOnlyKeys(payload: Record<string, unknown>, keys: readonly string[]): boolean {
  const actualKeys = Object.keys(payload);
  return actualKeys.length === keys.length && actualKeys.every((key) => keys.includes(key));
}

function isEmptyPayload(payload: unknown): payload is Record<string, never> {
  return isPlainRecord(payload) && hasOnlyKeys(payload, []);
}

function isSavePngPayload(payload: unknown): payload is AnalysisShowcaseSavePngMessage['payload'] {
  return isPlainRecord(payload) && hasOnlyKeys(payload, ['dataUrl']) && typeof payload.dataUrl === 'string';
}

function isCaptureFailedPayload(
  payload: unknown,
): payload is AnalysisShowcasePngCaptureFailedMessage['payload'] {
  return isPlainRecord(payload) && hasOnlyKeys(payload, ['message']) && typeof payload.message === 'string';
}

function isAnalysisShowcaseEnvelope<TMessage extends AnalysisShowcaseWebviewMessage>(
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

export function isAnalysisShowcaseReadyMessage(message: unknown): message is AnalysisShowcaseReadyMessage {
  return isAnalysisShowcaseEnvelope(message, 'analysis-showcase/ready', isEmptyPayload);
}

export function isAnalysisShowcaseOpenFullReportMessage(
  message: unknown,
): message is AnalysisShowcaseOpenFullReportMessage {
  return isAnalysisShowcaseEnvelope(message, 'analysis-showcase/openFullReport', isEmptyPayload);
}

export function isAnalysisShowcaseSavePngMessage(message: unknown): message is AnalysisShowcaseSavePngMessage {
  return isAnalysisShowcaseEnvelope(message, 'analysis-showcase/savePng', isSavePngPayload);
}

export function isAnalysisShowcasePngCaptureFailedMessage(
  message: unknown,
): message is AnalysisShowcasePngCaptureFailedMessage {
  return isAnalysisShowcaseEnvelope(message, 'analysis-showcase/pngCaptureFailed', isCaptureFailedPayload);
}

export function createAnalysisShowcaseLoadedMessage(
  payload: AnalysisShowcaseLoadedPayload,
): AnalysisShowcaseLoadedMessage {
  return {
    protocol: ANALYSIS_SHOWCASE_PROTOCOL,
    version: ANALYSIS_SHOWCASE_PROTOCOL_VERSION,
    type: 'analysis-showcase/loaded',
    payload,
  };
}

export function createAnalysisShowcaseSaveCompletedMessage(): AnalysisShowcaseSaveCompletedMessage {
  return {
    protocol: ANALYSIS_SHOWCASE_PROTOCOL,
    version: ANALYSIS_SHOWCASE_PROTOCOL_VERSION,
    type: 'analysis-showcase/saveCompleted',
    payload: {},
  };
}

export function createAnalysisShowcaseErrorMessage(message: string): AnalysisShowcaseErrorMessage {
  return {
    protocol: ANALYSIS_SHOWCASE_PROTOCOL,
    version: ANALYSIS_SHOWCASE_PROTOCOL_VERSION,
    type: 'analysis-showcase/error',
    payload: { message },
  };
}

export function isAnalysisShowcaseLoadedPayload(payload: unknown): payload is AnalysisShowcaseLoadedPayload {
  return (
    isPlainRecord(payload) &&
    hasOnlyKeys(payload, ['showcase', 'freshness', 'reportAvailable', 'captureOnReady']) &&
    parseAnalysisShowcase(payload.showcase).kind === 'valid' &&
    (payload.freshness === 'fresh' || payload.freshness === 'outdated') &&
    typeof payload.reportAvailable === 'boolean' &&
    typeof payload.captureOnReady === 'boolean'
  );
}
