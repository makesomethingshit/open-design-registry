import { canvasFeedbackRequest } from "@/src/lib/canvas/feedback-handlers";
type Context = { params: Promise<{ slug: string; canvasId: string }> };
export async function PATCH(request: Request, { params }: Context) { return canvasFeedbackRequest(request, await params); }
