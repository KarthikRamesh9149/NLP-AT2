export const MAX_BODY_BYTES = 48_000;
export const MAX_HISTORY = 200;
export const MAX_MESSAGES = 30;
export const MAX_MESSAGE_LENGTH = 1000;
export const utf8Bytes = (value: string) => new TextEncoder().encode(value).length;

export function assertRequestSize(body: unknown): void {
  if (utf8Bytes(JSON.stringify(body)) > MAX_BODY_BYTES) throw new Error('This conversation is too large. Shorten it before updating the brief.');
}
