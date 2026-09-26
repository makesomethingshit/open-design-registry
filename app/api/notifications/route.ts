import { NextResponse } from "next/server";
import { auth } from "@/src/lib/auth";
import { prisma } from "@/src/lib/prisma";
import { visibleNotificationWhere } from "@/src/lib/notification-visibility";

const notificationSelect = {
  id: true,
  type: true,
  readAt: true,
  createdAt: true,
  actor: { select: { name: true } },
  project: { select: { slug: true, title: true } },
  issue: { select: { id: true, title: true } },
  discussion: { select: { id: true, title: true } },
  forkedProject: { select: { slug: true, title: true } },
  revision: { select: { id: true, number: true, title: true } },
  release: { select: { id: true, number: true, title: true } },
} as const;

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  const where = visibleNotificationWhere(session.user.id);

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: 50, select: notificationSelect }),
    prisma.notification.count({ where: { ...where, readAt: null } }),
  ]);
  return NextResponse.json({ notifications, unreadCount });
}
