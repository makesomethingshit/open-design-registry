import { z } from "zod";
import { auth } from "../auth";
import { applyForCanvas, canvasFailure, changeCanvasAccess, readCanvases } from "./service";

type Scope = { slug: string; canvasId?: string };
const accessInput = z.object({ action: z.enum(["approve", "reject", "revoke", "withdraw"]) }).strict();

export async function canvasRequest(request: Request, { slug, canvasId }: Scope) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (request.method !== "GET" && !session) return Response.json({ error: "Sign-in required" }, { status: 401 });
  try {
    if (request.method === "GET") {
      const rows = await readCanvases(slug, session?.user.id ?? null, canvasId);
      return Response.json(canvasId ? rows[0] : rows);
    }
    if (!canvasId) return Response.json(await applyForCanvas(slug, session!.user.id), { status: 200 });
    const parsed = accessInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Invalid access action" }, { status: 400 });
    return Response.json(await changeCanvasAccess(slug, canvasId, session!.user.id, parsed.data.action));
  } catch (error) {
    const response = canvasFailure(error);
    if (response) return response;
    throw error;
  }
}
