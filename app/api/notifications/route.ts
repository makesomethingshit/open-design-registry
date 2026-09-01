import { NextResponse } from "next/server";
import { auth } from "@/src/lib/auth";
import { prisma } from "@/src/lib/prisma";

const notificationSelect = {
  id: true,
  type: true,
  readAt: true,
  createdAt: true,
  actor: { select: { name: true } },
  project: { select: { slug: true, title: true } },
  issue: { select: { id: true, title: true } },
  forkedProject: { select: { slug: true, title: true } },
} as const;

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where: { recipientId: session.user.id }, orderBy: { createdAt: "desc" }, take: 50, select: notificationSelect }),
    prisma.notification.count({ where: { recipientId: session.user.id, readAt: null } }),
  ]);
  return NextResponse.json({ notifications, unreadCount });
}
