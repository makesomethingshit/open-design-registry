import { z } from "zod";
import { auth } from "../auth";
import { applyForCanvas, canvasFailure, canvasView, changeCanvasAccess, readCanvasPage, readCanvases } from "./service";

type Scope = { slug: string; canvasId?: string };
const accessInput = z.object({ action: z.enum(["approve", "reject", "revoke", "withdraw"]) }).strict();

export async function canvasRequest(request: Request, { slug, canvasId }: Scope) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (request.method !== "GET" && !session) return Response.json({ error: "Sign-in required" }, { status: 401 });
  try {
    if (request.method === "GET") {
      if (canvasId) {
        const rows = await readCanvases(slug, session?.user.id ?? null, canvasId);
        return Response.json(canvasView(rows[0], session?.user.id ?? null));
      }
      const cursor = new URL(request.url).searchParams.get("cursor");
      const page = await readCanvasPage(slug, session?.user.id ?? null, cursor);
      const headers = page.nextCursor ? { "X-Next-Cursor": page.nextCursor } : undefined;
      return Response.json(page.items.map((canvas) => canvasView(canvas, session?.user.id ?? null)), { headers });
    }
    if (!canvasId) {
      const canvas = await applyForCanvas(slug, session!.user.id);
      const view = (await readCanvases(slug, session!.user.id, canvas.id)).map((row) => canvasView(row, session!.user.id))[0];
      return Response.json(view, { status: 200 });
    }
    const parsed = accessInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Invalid access action" }, { status: 400 });
    await changeCanvasAccess(slug, canvasId, session!.user.id, parsed.data.action);
    const view = (await readCanvases(slug, session!.user.id, canvasId)).map((row) => canvasView(row, session!.user.id))[0];
    return Response.json(view);
  } catch (error) {
    const response = canvasFailure(error);
    if (response) return response;
    throw error;
  }
}
