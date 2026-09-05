import { NextResponse } from "next/server";
import { auth } from "@/src/lib/auth";
import { createContribution, listContributions } from "@/src/lib/contributions";

import { failure } from "@/src/lib/contribution-response";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    const result = await listContributions((await params).slug, session?.user.id, new URL(request.url).searchParams.get("cursor") || undefined);
    return NextResponse.json({ items: result.items, nextCursor: result.nextCursor });
  } catch (cause) { return failure(cause); }
}
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  try {
    return NextResponse.json(await createContribution((await params).slug, session.user, await request.json().catch(() => null)), { status: 201 });
  } catch (cause) { return failure(cause); }
}
