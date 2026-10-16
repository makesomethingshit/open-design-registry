import { auth } from "../auth";
import { archiveCanvasItem, assertCanvasItemWritable, createCanvasItem, readCanvasItems } from "./items";
import { canvasFailure } from "./service";
import { maxCanvasMultipartRequestBytes } from "./item-input";

type Scope = { slug: string; canvasId: string; itemId?: string };

async function readBoundedMultipartBody(request: Request) {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > maxCanvasMultipartRequestBytes) {
    void request.body?.cancel("Canvas multipart body exceeds the request limit").catch(() => {});
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
      if (size > maxCanvasMultipartRequestBytes) {
        void reader.cancel("Canvas multipart body exceeds the request limit").catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } finally {
    try { reader.releaseLock(); } catch { /* Cancellation may still be settling. */ }
  }
}

export async function canvasItemRequest(request: Request, { slug, canvasId, itemId }: Scope) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (request.method !== "GET" && !session) return Response.json({ error: "Sign-in required" }, { status: 401 });
  try {
    if (request.method === "GET") return Response.json(await readCanvasItems(slug, canvasId, session?.user.id ?? null));
    if (itemId) return Response.json(await archiveCanvasItem(slug, canvasId, itemId, session!.user.id));
    let input: unknown, file: File | undefined;
    if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
      // Authorize and release the Project→Canvas locks before consuming an
      // attacker-controlled body; createCanvasItem checks again before upload.
      await assertCanvasItemWritable(slug, canvasId, session!.user.id);
      const bytes = await readBoundedMultipartBody(request);
      if (!bytes) return Response.json({ error: "Multipart request exceeds the 10 MiB image plus 64 KiB metadata limit" }, { status: 413 });
      const contentType = request.headers.get("content-type")!;
      const boundedRequest = new Request(request.url, { method: "POST", headers: { "content-type": contentType }, body: bytes });
      const form = await boundedRequest.formData().catch(() => null);
      if (!form || !(form.get("file") instanceof File)) return Response.json({ error: "Image file required" }, { status: 400 });
      file = form.get("file") as File;
      input = Object.fromEntries([...form.entries()].filter(([key]) => key !== "file"));
    } else {
      await assertCanvasItemWritable(slug, canvasId, session!.user.id);
      input = await request.json().catch(() => null);
    }
    return Response.json(await createCanvasItem(slug, canvasId, session!.user.id, input, file), { status: 201 });
  } catch (error) {
    const response = canvasFailure(error);
    if (response) return response;
    throw error;
  }
}
