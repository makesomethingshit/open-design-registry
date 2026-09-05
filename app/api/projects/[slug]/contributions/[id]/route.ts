import { NextResponse } from "next/server";
import { auth } from "@/src/lib/auth";
import { actOnContribution, getContribution } from "@/src/lib/contributions";
import { failure } from "@/src/lib/contribution-response";

type Params = { params: Promise<{ slug: string; id: string }> };
export async function GET(request: Request, { params }: Params) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    const { slug, id } = await params;
    const { project: _project, ...result } = await getContribution(slug, id, session?.user.id, new URL(request.url).searchParams.get("before") || undefined);
    return NextResponse.json(result);
  } catch (cause) { return failure(cause); }
}
export async function PATCH(request: Request, { params }: Params) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  try {
    const { slug, id } = await params;
    return NextResponse.json(await actOnContribution(slug, id, session.user, await request.json().catch(() => null)));
  } catch (cause) { return failure(cause); }
}
