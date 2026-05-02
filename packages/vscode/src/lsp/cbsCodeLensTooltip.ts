/**
 * CBS CodeLens tooltip metadata를 VS Code client에서 읽는 순수 helper 모음.
 * @file packages/vscode/src/lsp/cbsCodeLensTooltip.ts
 */

const CBS_AGENT_CONTRACT_SCHEMA = 'cbs-lsp-agent-contract';

export interface CbsCodeLensTooltipCarrier {
  command?: {
    tooltip?: string;
  };
  data?: unknown;
}

/**
 * extractCbsCodeLensActivationTooltip 함수.
 * LSP CodeLens.data에 담긴 activation tooltip plain text를 추출함.
 *
 * @param data - languageclient가 보존한 ProtocolCodeLens data payload
 * @returns tooltip plain text가 있으면 문자열, 없으면 null
 */
export function extractCbsCodeLensActivationTooltip(data: unknown): string | null {
  if (!isRecord(data) || data.schema !== CBS_AGENT_CONTRACT_SCHEMA) {
    return null;
  }

  const lens = data.lens;
  if (!isRecord(lens)) {
    return null;
  }

  const activation = lens.activation;
  if (!isRecord(activation) || typeof activation.plainText !== 'string') {
    return null;
  }

  const tooltip = activation.plainText.trim();
  return tooltip.length > 0 ? tooltip : null;
}

/**
 * applyCbsCodeLensActivationTooltip 함수.
 * CodeLens-like 객체의 data에서 tooltip을 읽어 command tooltip로 복원함.
 *
 * @param codeLens - command와 data를 가진 CodeLens-like 객체
 * @returns tooltip이 있으면 command를 보강한 원본 객체
 */
export function applyCbsCodeLensActivationTooltip<T extends CbsCodeLensTooltipCarrier>(
  codeLens: T,
): T {
  const tooltip = extractCbsCodeLensActivationTooltip(codeLens.data);
  if (!tooltip || !codeLens.command) {
    return codeLens;
  }

  codeLens.command = {
    ...codeLens.command,
    tooltip,
  };
  return codeLens;
}

/**
 * isRecord 함수.
 * unknown payload가 string key object인지 좁힘.
 *
 * @param value - 검사할 임의 값
 * @returns record처럼 안전하게 field를 읽을 수 있으면 true
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
