import { auth } from "../auth";
import { canvasFailure } from "./service";
import { createCanvasComment, editCanvasLayout, readCanvasComments } from "./feedback";

type Scope = { slug: string; canvasId: string };
// Comment and layout payloads are small. Bound measured bytes before JSON.parse:
// Content-Length alone is insufficient for chunked/streamed uploads.
const maxFeedbackJsonBytes = 64 * 1024;

async function readFeedbackJson(request: Request): Promise<{ oversized: boolean; input: unknown }> {
  const length = request.headers.get("content-length");
  if (length !== null && /^\d+$/.test(length) && Number(length) > maxFeedbackJsonBytes) {
    void request.body?.cancel("Canvas feedback request exceeds 64 KiB").catch(() => {});
    return { oversized: true, input: null };
  }
  if (!request.body) return { oversized: false, input: null };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxFeedbackJsonBytes) {
        void reader.cancel("Canvas feedback request exceeds 64 KiB").catch(() => {});
        return { oversized: true, input: null };
      }
      chunks.push(value);
    }
  } finally {
    try { reader.releaseLock(); } catch { /* Cancellation may still be settling. */ }
  }
  try {
    return { oversized: false, input: JSON.parse(Buffer.concat(chunks, size).toString("utf8")) as unknown };
  } catch {
    return { oversized: false, input: null };
  }
}

export async function canvasFeedbackRequest(request: Request, { slug, canvasId }: Scope) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (request.method !== "GET" && !session) return Response.json({ error: "Sign-in required" }, { status: 401 });
  try {
    if (request.method === "GET") {
      const itemId = new URL(request.url).searchParams.get("itemId");
      if (!itemId || itemId.length > 200) return Response.json({ error: "Item ID required" }, { status: 400 });
      return Response.json(await readCanvasComments(slug, canvasId, itemId, session?.user.id ?? null));
    }
    const { oversized, input } = await readFeedbackJson(request);
    if (oversized) return Response.json({ error: "Canvas feedback request exceeds the 64 KiB limit" }, { status: 413 });
    return request.method === "PATCH"
      ? Response.json(await editCanvasLayout(slug, canvasId, session!.user.id, input))
      : Response.json(await createCanvasComment(slug, canvasId, session!.user.id, input), { status: 201 });
  } catch (error) {
    const response = canvasFailure(error);
    if (response) return response;
    throw error;
  }
}
