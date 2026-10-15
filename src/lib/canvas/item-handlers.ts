import { auth } from "../auth";
import { archiveCanvasItem, createCanvasItem, readCanvasItems } from "./items";
import { canvasFailure } from "./service";

type Scope = { slug: string; canvasId: string; itemId?: string };
export async function canvasItemRequest(request: Request, { slug, canvasId, itemId }: Scope) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (request.method !== "GET" && !session) return Response.json({ error: "Sign-in required" }, { status: 401 });
  try {
    if (request.method === "GET") return Response.json(await readCanvasItems(slug, canvasId, session?.user.id ?? null));
    if (itemId) return Response.json(await archiveCanvasItem(slug, canvasId, itemId, session!.user.id));
    let input: unknown, file: File | undefined;
    if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
      const form = await request.formData().catch(() => null);
      if (!form || !(form.get("file") instanceof File)) return Response.json({ error: "Image file required" }, { status: 400 });
      file = form.get("file") as File;
      input = Object.fromEntries([...form.entries()].filter(([key]) => key !== "file"));
    } else input = await request.json().catch(() => null);
    return Response.json(await createCanvasItem(slug, canvasId, session!.user.id, input, file), { status: 201 });
  } catch (error) {
    const response = canvasFailure(error);
    if (response) return response;
    throw error;
  }
}
