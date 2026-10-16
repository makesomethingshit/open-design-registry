import { canvasItemRequest } from "@/src/lib/canvas/item-handlers";
type Context = { params: Promise<{ slug: string; canvasId: string; itemId: string }> };
export async function DELETE(request: Request, { params }: Context) { return canvasItemRequest(request, await params); }
