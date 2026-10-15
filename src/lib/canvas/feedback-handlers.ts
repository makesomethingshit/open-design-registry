import { auth } from "../auth";
import { canvasFailure } from "./service";
import { createCanvasComment, editCanvasLayout, readCanvasComments } from "./feedback";

type Scope = { slug: string; canvasId: string };
export async function canvasFeedbackRequest(request: Request, { slug, canvasId }: Scope) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (request.method !== "GET" && !session) return Response.json({ error: "Sign-in required" }, { status: 401 });
  try {
    if (request.method === "GET") {
      const itemId = new URL(request.url).searchParams.get("itemId");
      if (!itemId || itemId.length > 200) return Response.json({ error: "Item ID required" }, { status: 400 });
      return Response.json(await readCanvasComments(slug, canvasId, itemId, session?.user.id ?? null));
    }
    const input = await request.json().catch(() => null);
    return request.method === "PATCH"
      ? Response.json(await editCanvasLayout(slug, canvasId, session!.user.id, input))
      : Response.json(await createCanvasComment(slug, canvasId, session!.user.id, input), { status: 201 });
  } catch (error) {
    const response = canvasFailure(error);
    if (response) return response;
    throw error;
  }
}
