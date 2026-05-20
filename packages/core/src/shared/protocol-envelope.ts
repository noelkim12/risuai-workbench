/**
 * Protocol envelope type definitions and guard utilities shared by
 * VS Code extension host and webview bundle.
 *
 * Browser/node neutral — no platform imports, no DOM types, no VS Code APIs.
 *
 * @file packages/core/src/shared/protocol-envelope.ts
 */

interface ProtocolEnvelope<
  TProtocol extends string,
  TVersion extends number,
  TType extends string,
> {
  protocol: TProtocol;
  version: TVersion;
  type: TType;
  payload: unknown;
}

interface ProtocolMessageEnvelope<TProtocol extends string, TVersion extends number> {
  protocol: TProtocol;
  version: TVersion;
  type: string;
  payload: unknown;
}

/**
 * isPlainRecord.
 * message guard에서 배열과 null을 제외한 plain object만 통과시킴.
 * Object.prototype 상속 또는 null-prototype 객체만 허용함.
 *
 * @param value - record 여부를 확인할 unknown 값
 * @returns Object.prototype 또는 null prototype의 plain record이면 true
 */
export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * isProtocolMessageEnvelope.
 * protocol/version이 일치하는 bridge message envelope인지 확인함.
 *
 * @param message - bridge에서 받은 unknown message
 * @param protocol - 비교할 protocol literal
 * @param version - 비교할 protocol version literal
 * @returns protocol/version이 일치하는 envelope 여부
 */
export function isProtocolMessageEnvelope<TProtocol extends string, TVersion extends number>(
  message: unknown,
  protocol: TProtocol,
  version: TVersion,
): message is ProtocolMessageEnvelope<TProtocol, TVersion> {
  return (
    isPlainRecord(message) &&
    message.protocol === protocol &&
    message.version === version &&
    typeof message.type === 'string' &&
    'payload' in message
  );
}

/**
 * isProtocolEnvelope.
 * protocol/version/type이 모두 일치하는 bridge message envelope인지 확인함.
 *
 * @param message - bridge에서 받은 unknown message
 * @param protocol - 비교할 protocol literal
 * @param version - 비교할 protocol version literal
 * @param type - 비교할 message type literal
 * @returns protocol/version/type이 일치하는 envelope 여부
 */
export function isProtocolEnvelope<
  TProtocol extends string,
  TVersion extends number,
  TType extends string,
>(
  message: unknown,
  protocol: TProtocol,
  version: TVersion,
  type: TType,
): message is ProtocolEnvelope<TProtocol, TVersion, TType> {
  return isProtocolMessageEnvelope(message, protocol, version) && message.type === type;
}
