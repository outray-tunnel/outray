export class RequestBodyError extends Error {
  constructor(readonly status: 400 | 413, message: string) {
    super(message);
    this.name = "RequestBodyError";
  }
}

/** Bound the actual stream, including requests without a Content-Length. */
export async function readJsonBody(request: Request, maxBytes = 4096): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > maxBytes) {
    throw new RequestBodyError(413, "payload_too_large");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new RequestBodyError(400, "invalid_subscription");
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new RequestBodyError(413, "payload_too_large");
      }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new RequestBodyError(400, "invalid_subscription"); }
}
