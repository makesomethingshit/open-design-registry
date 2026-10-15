import { canvasFeedbackRequest } from "@/src/lib/canvas/feedback-handlers";
type Context = { params: Promise<{ slug: string; canvasId: string }> };
export async function GET(request: Request, { params }: Context) { return canvasFeedbackRequest(request, await params); }
export async function POST(request: Request, { params }: Context) { return canvasFeedbackRequest(request, await params); }
