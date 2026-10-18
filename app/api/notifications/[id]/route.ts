import { NextResponse } from "next/server";
import { auth } from "@/src/lib/auth";
import { prisma } from "@/src/lib/prisma";
import { visibleNotificationWhere } from "@/src/lib/notification-visibility";
import { maxSmallJsonBytes, readBoundedJson } from "@/src/lib/request-body";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  const bodyResult = await readBoundedJson(request, maxSmallJsonBytes);
  if (bodyResult.tooLarge) return NextResponse.json({ error: "Request body is too large" }, { status: 413 });
  const body = bodyResult.value as { read?: unknown } | null;
  if (body?.read !== true) return NextResponse.json({ error: "read must be true" }, { status: 400 });
  const { id } = await params;
  const notification = await prisma.notification.findFirst({ where: { id, ...visibleNotificationWhere(session.user.id) }, select: { id: true } });
  if (!notification) return NextResponse.json({ error: "Notification not found" }, { status: 404 });
  const updated = await prisma.notification.update({ where: { id: notification.id }, data: { readAt: new Date() }, select: { id: true, readAt: true } });
  return NextResponse.json(updated);
}
