"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/src/components/ui/badge";
import { Banner, EmptyState } from "@/src/components/ui/banner";
import { Button } from "@/src/components/ui/button";
import { Stack } from "@/src/components/ui/layout";
import { setRowBusy, setRowMessage } from "@/src/lib/ui/task-state";

type Notification = {
  id: string;
  type: "ISSUE_CREATED" | "DISCUSSION_CREATED" | "FORK_CREATED" | "REVISION_PUBLISHED" | "RELEASE_PUBLISHED";
  readAt: string | null;
  createdAt: string;
  actor: { name: string };
  project: { slug: string; title: string };
  issue: { id: string; title: string } | null;
  discussion: { id: string; title: string } | null;
  forkedProject: { slug: string; title: string } | null;
  revision: { id: string; number: number; title: string } | null;
  release: { id: string; number: number; title: string } | null;
};

export default function NotificationList({ notifications: initialNotifications, unreadCount: initialUnreadCount }: { notifications: Notification[]; unreadCount: number }) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [pendingById, setPendingById] = useState<Record<string, boolean>>({});
  const [errorsById, setErrorsById] = useState<Record<string, string>>({});
  const [successesById, setSuccessesById] = useState<Record<string, string>>({});

  async function markRead(id: string) {
    if (pendingById[id]) return;
    setPendingById((current) => setRowBusy(current, id, true));
    setErrorsById((current) => setRowMessage(current, id, ""));
    setSuccessesById((current) => setRowMessage(current, id, ""));
    try {
      const response = await fetch(`/api/notifications/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ read: true }) });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        setErrorsById((current) => setRowMessage(current, id, payload?.error ?? "알림을 읽음 처리하지 못했습니다."));
        return;
      }
      setNotifications((current) => current.map((notification) => notification.id === id ? { ...notification, readAt: new Date().toISOString() } : notification));
      setUnreadCount((current) => Math.max(0, current - 1));
      setSuccessesById((current) => setRowMessage(current, id, "알림을 읽음 처리했습니다."));
      window.dispatchEvent(new Event("notifications-state-changed"));
    } catch {
      setErrorsById((current) => setRowMessage(current, id, "알림을 읽음 처리하지 못했습니다. 다시 시도해 주세요."));
    } finally {
      setPendingById((current) => setRowBusy(current, id, false));
    }
  }

  if (!notifications.length) return <EmptyState title="새 알림이 없습니다." icon="clock">새로운 Issue와 Fork가 생기면 이곳에서 알려드립니다.</EmptyState>;
  return <Stack gap={3}>
    <p className="meta" aria-live="polite">미확인 알림 <Badge tone={unreadCount ? "warning" : "success"}>{unreadCount}</Badge>개</p>
    <ul className="notifications">{notifications.map((notification) => {
      const issue = notification.type === "ISSUE_CREATED";
      const discussion = notification.type === "DISCUSSION_CREATED";
       const revision = notification.type === "REVISION_PUBLISHED";
       const release = notification.type === "RELEASE_PUBLISHED";
       const href = issue ? `/projects/${notification.project.slug}#issues` : discussion ? notification.discussion ? `/projects/${notification.project.slug}/discussions/${notification.discussion.id}` : `/projects/${notification.project.slug}#discussions` : revision ? `/projects/${notification.project.slug}#revisions` : release ? `/projects/${notification.project.slug}#releases` : `/projects/${notification.forkedProject?.slug ?? notification.project.slug}`;
       const message = issue ? `${notification.actor.name}님이 ${notification.project.title}에 Issue${notification.issue ? ` “${notification.issue.title}”` : ""}를 만들었습니다.` : discussion ? `${notification.actor.name}님이 ${notification.project.title}에서 토론${notification.discussion ? ` “${notification.discussion.title}”` : ""}을 시작했습니다.` : revision ? `${notification.actor.name}님이 ${notification.project.title}에 Revision${notification.revision ? ` ${notification.revision.number} “${notification.revision.title}”` : ""}을 발행했습니다.` : release ? `${notification.actor.name}님이 ${notification.project.title}에 Release${notification.release ? ` ${notification.release.number} “${notification.release.title}”` : ""}을 발행했습니다.` : `${notification.actor.name}님이 ${notification.project.title}을 Fork했습니다.`;
      const id = notification.id;
      return <li aria-busy={Boolean(pendingById[id])} className={`notification ${notification.readAt ? "read" : "unread"}`} key={id}><div><Link href={href}>{message}</Link><time className="meta" dateTime={notification.createdAt}>{new Date(notification.createdAt).toLocaleString("ko-KR")}</time></div>{!notification.readAt && <Button loading={Boolean(pendingById[id])} loadingLabel="처리 중" onClick={() => { void markRead(id); }} size="sm" type="button" variant="secondary">읽음 처리</Button>}{errorsById[id] && <Banner tone="error" title="읽음 처리 실패">{errorsById[id]}</Banner>}{successesById[id] && <Banner tone="success" title="처리 완료">{successesById[id]}</Banner>}</li>;
    })}</ul>
  </Stack>;
}
