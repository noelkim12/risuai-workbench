export interface RegexWorkerLimits {
  maxInputLength: number;
  maxMatches: number;
  maxOutputLength: number;
}

export interface RegexWorkerRequest {
  requestId: string;
  pattern: string;
  flags: string;
  replacement: string;
  sampleInput: string;
  limits: RegexWorkerLimits;
}

export interface RegexWorkerCaptureDto {
  name: string;
  text: string | null;
}

export interface RegexWorkerMatchDto {
  text: string;
  index: number;
  length: number;
  captures: RegexWorkerCaptureDto[];
  namedCaptures: RegexWorkerCaptureDto[];
}

export interface RegexWorkerPerformanceDto {
  compileMs: number;
  matchMs: number;
  replacementMs: number;
  totalMs: number;
  timedOut: boolean;
  timeoutMs: number;
  inputLength: number;
  matchCount: number;
}

export interface RegexWorkerDiagnosticDto {
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export interface RegexWorkerResult {
  requestId: string;
  status: 'ok' | 'partial' | 'aborted' | 'error' | 'timeout';
  output: string;
  matches: RegexWorkerMatchDto[];
  diagnostics: RegexWorkerDiagnosticDto[];
  performance: RegexWorkerPerformanceDto;
}
