"use client";

import Link from "next/link";
import { useState } from "react";

type Notification = {
  id: string;
  type: "ISSUE_CREATED" | "FORK_CREATED" | "CONTRIBUTION_ACTIVITY";
  readAt: string | null;
  createdAt: string;
  actor: { name: string };
  project: { slug: string; title: string };
  issue: { id: string; title: string } | null;
  forkedProject: { slug: string; title: string } | null;
  contribution?: { id: string; title: string } | null;
};

export default function NotificationList({ notifications: initialNotifications, unreadCount: initialUnreadCount }: { notifications: Notification[]; unreadCount: number }) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [error, setError] = useState("");

  async function markRead(id: string) {
    setError("");
    const response = await fetch(`/api/notifications/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ read: true }) });
    if (!response.ok) {
      setError((await response.json().catch(() => null))?.error ?? "알림을 읽음 처리하지 못했습니다.");
      return;
    }
    setNotifications((current) => current.map((notification) => notification.id === id ? { ...notification, readAt: new Date().toISOString() } : notification));
    setUnreadCount((current) => Math.max(0, current - 1));
    window.dispatchEvent(new Event("notifications-state-changed"));
  }

  if (!notifications.length) return <p className="meta">새 알림이 없습니다.</p>;
  return <div><p className="meta" aria-live="polite">미확인 알림 {unreadCount}개</p><ul className="notifications">{notifications.map((notification) => {
    const issue = notification.type === "ISSUE_CREATED";
    const contribution = notification.type === "CONTRIBUTION_ACTIVITY" ? notification.contribution : null;
    const href = contribution ? `/projects/${notification.project.slug}/contributions/${contribution.id}` : issue ? `/projects/${notification.project.slug}#issues` : `/projects/${notification.forkedProject?.slug ?? notification.project.slug}`;
    const message = contribution ? `${notification.actor.name}님이 기여 제안 “${contribution.title}”에 새 활동을 남겼습니다.` : issue ? `${notification.actor.name}님이 ${notification.project.title}에 Issue${notification.issue ? ` “${notification.issue.title}”` : ""}를 만들었습니다.` : `${notification.actor.name}님이 ${notification.project.title}을 Fork했습니다.`;
    return <li className={`notification ${notification.readAt ? "read" : "unread"}`} key={notification.id}><div><Link href={href}>{message}</Link><time className="meta" dateTime={notification.createdAt}>{notification.createdAt.slice(0, 16).replace("T", " ") + " UTC"}</time></div>{!notification.readAt && <button type="button" className="button secondary" onClick={() => markRead(notification.id)}>읽음 처리</button>}</li>;
  })}</ul>{error && <p className="error" role="alert">{error}</p>}</div>;
}
