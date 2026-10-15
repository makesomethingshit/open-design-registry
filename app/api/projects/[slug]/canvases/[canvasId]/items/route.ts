import { canvasItemRequest } from "@/src/lib/canvas/item-handlers";
type Context = { params: Promise<{ slug: string; canvasId: string }> };
export async function GET(request: Request, { params }: Context) { return canvasItemRequest(request, await params); }
export async function POST(request: Request, { params }: Context) { return canvasItemRequest(request, await params); }
