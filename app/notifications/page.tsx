import { redirect } from "next/navigation";
import { PageGrid, PageHeader, ReadingColumn } from "@/src/components/ui/layout";
import { prisma } from "@/src/lib/prisma";
import { visibleNotificationWhere } from "@/src/lib/notification-visibility";
import { getSession } from "@/src/lib/session";
import NotificationList from "./notification-list";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const where = visibleNotificationWhere(session.user.id);
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
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
        discussion: { select: { id: true, title: true } },
        forkedProject: { select: { slug: true, title: true } },
        revision: { select: { id: true, number: true, title: true } },
        release: { select: { id: true, number: true, title: true } },
      },
    }),
    prisma.notification.count({ where: { ...where, readAt: null } }),
  ]);

  return <PageGrid aria-labelledby="notifications-heading">
    <ReadingColumn>
      <PageHeader description="프로젝트의 Issue·토론·Fork와 Watch 중인 Revision·Release 발행을 확인하세요." eyebrow="ACTIVITY" id="notifications-heading" title="알림" />
      <NotificationList notifications={notifications.map((notification) => ({ ...notification, createdAt: notification.createdAt.toISOString(), readAt: notification.readAt?.toISOString() ?? null }))} unreadCount={unreadCount} />
    </ReadingColumn>
  </PageGrid>;
}
