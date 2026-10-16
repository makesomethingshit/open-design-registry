import { canvasRequest } from "@/src/lib/canvas/handlers";
type Context = { params: Promise<{ slug: string }> };
export async function GET(request: Request, { params }: Context) { return canvasRequest(request, await params); }
export async function POST(request: Request, { params }: Context) { return canvasRequest(request, await params); }
