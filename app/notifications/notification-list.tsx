"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/src/components/ui/badge";
import { Banner, EmptyState } from "@/src/components/ui/banner";
import { Button } from "@/src/components/ui/button";
import { Stack } from "@/src/components/ui/layout";

type Notification = {
  id: string;
  type: "ISSUE_CREATED" | "FORK_CREATED";
  readAt: string | null;
  createdAt: string;
  actor: { name: string };
  project: { slug: string; title: string };
  issue: { id: string; title: string } | null;
  forkedProject: { slug: string; title: string } | null;
};

export default function NotificationList({ notifications: initialNotifications, unreadCount: initialUnreadCount }: { notifications: Notification[]; unreadCount: number }) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function markRead(id: string) {
    if (pendingId) return;
    setPendingId(id);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/notifications/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ read: true }) });
      if (!response.ok) {
        setError((await response.json().catch(() => null))?.error ?? "알림을 읽음 처리하지 못했습니다.");
        return;
      }
      setNotifications((current) => current.map((notification) => notification.id === id ? { ...notification, readAt: new Date().toISOString() } : notification));
      setUnreadCount((current) => Math.max(0, current - 1));
      setSuccess("알림을 읽음 처리했습니다.");
      window.dispatchEvent(new Event("notifications-state-changed"));
    } catch {
      setError("알림을 읽음 처리하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setPendingId(null);
    }
  }

  if (!notifications.length) return <EmptyState title="새 알림이 없습니다." icon="clock">새로운 Issue와 Fork가 생기면 이곳에서 알려드립니다.</EmptyState>;
  return <Stack aria-busy={Boolean(pendingId)} gap={3}>
    <p className="meta" aria-live="polite">미확인 알림 <Badge tone={unreadCount ? "warning" : "success"}>{unreadCount}</Badge>개</p>
    <ul className="notifications">{notifications.map((notification) => {
      const issue = notification.type === "ISSUE_CREATED";
      const href = issue ? `/projects/${notification.project.slug}#issues` : `/projects/${notification.forkedProject?.slug ?? notification.project.slug}`;
      const message = issue ? `${notification.actor.name}님이 ${notification.project.title}에 Issue${notification.issue ? ` “${notification.issue.title}”` : ""}를 만들었습니다.` : `${notification.actor.name}님이 ${notification.project.title}을 Fork했습니다.`;
      return <li className={`notification ${notification.readAt ? "read" : "unread"}`} key={notification.id}><div><Link href={href}>{message}</Link><time className="meta" dateTime={notification.createdAt}>{new Date(notification.createdAt).toLocaleString("ko-KR")}</time></div>{!notification.readAt && <Button disabled={Boolean(pendingId && pendingId !== notification.id)} loading={pendingId === notification.id} loadingLabel="처리 중" onClick={() => { void markRead(notification.id); }} size="sm" type="button" variant="secondary">읽음 처리</Button>}</li>;
    })}</ul>
    {error && <Banner tone="error" title="읽음 처리 실패">{error}</Banner>}
    {success && <Banner tone="success" title="처리 완료">{success}</Banner>}
  </Stack>;
}
