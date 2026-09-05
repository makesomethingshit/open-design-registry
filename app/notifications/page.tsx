import { notificationVisibility } from "@/src/lib/notification-visibility";
import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { getSession } from "@/src/lib/session";
import NotificationList from "./notification-list";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: notificationVisibility(session.user.id),
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        type: true,
        readAt: true,
        createdAt: true,
        actor: { select: { name: true } },
        project: { select: { slug: true, title: true } },
        issue: { select: { id: true, title: true } },
        forkedProject: { select: { slug: true, title: true } },
  contribution: { select: { id: true, title: true } },
      },
    }),
    prisma.notification.count({ where: { ...notificationVisibility(session.user.id), readAt: null } }),
  ]);

  return <section><div className="page-heading"><div><p className="meta">ACTIVITY</p><h1>알림</h1><p className="lede">프로젝트의 Issue, Fork와 기여 제안·리뷰를 확인하세요.</p></div></div><NotificationList notifications={notifications.map((notification) => ({ ...notification, createdAt: notification.createdAt.toISOString(), readAt: notification.readAt?.toISOString() ?? null }))} unreadCount={unreadCount} /></section>;
}
