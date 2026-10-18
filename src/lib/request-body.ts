export const maxSmallJsonBytes = 64 * 1024;
// A 50,000-code-unit document can expand to about 300 KB when JSON escapes
// every non-ASCII code unit as a backslash-u sequence. Leave room for the
// other project fields.
export const maxDocumentJsonBytes = 512 * 1024;
export const maxRightsJsonBytes = 4 * 1024 * 1024;
export const maxImageFormBytes = 10 * 1024 * 1024 + 64 * 1024;
export const maxRevisionFormBytes = 100 * 1024 * 1024 + 50 * 1024 * 1024 + maxRightsJsonBytes + 1024 * 1024;

async function readBoundedBytes(request: Request, maxBytes: number): Promise<Uint8Array | null> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > maxBytes) {
    void request.body?.cancel("Request body exceeds the limit").catch(() => {});
    return null;
  }
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return Buffer.concat(chunks, size);
      size += value.byteLength;
      if (size > maxBytes) {
        void reader.cancel("Request body exceeds the limit").catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } finally {
    try { reader.releaseLock(); } catch { /* Cancellation may still be settling. */ }
  }
}

export async function readBoundedJson(request: Request, maxBytes: number): Promise<{ tooLarge: boolean; value: unknown }> {
  const bytes = await readBoundedBytes(request, maxBytes);
  if (!bytes) return { tooLarge: true, value: null };
  try {
    return { tooLarge: false, value: JSON.parse(Buffer.from(bytes).toString("utf8")) };
  } catch {
    return { tooLarge: false, value: null };
  }
}

export async function readBoundedFormData(request: Request, maxBytes: number): Promise<{ tooLarge: boolean; form: FormData | null }> {
  const bytes = await readBoundedBytes(request, maxBytes);
  if (!bytes) return { tooLarge: true, form: null };
  const contentType = request.headers.get("content-type");
  if (!contentType) return { tooLarge: false, form: null };
  try {
    // Hand the single bounded buffer to the parser. Do not slice/copy a body
    // that may be near the advertised 150 MiB revision limit.
    const form = await new Request(request.url, { method: "POST", headers: { "content-type": contentType }, body: bytes as unknown as BodyInit }).formData();
    return { tooLarge: false, form };
  } catch {
    return { tooLarge: false, form: null };
  }
}
