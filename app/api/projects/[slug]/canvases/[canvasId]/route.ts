import { canvasRequest } from "@/src/lib/canvas/handlers";
type Context = { params: Promise<{ slug: string; canvasId: string }> };
export async function GET(request: Request, { params }: Context) { return canvasRequest(request, await params); }
export async function PATCH(request: Request, { params }: Context) { return canvasRequest(request, await params); }
