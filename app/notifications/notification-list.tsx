"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/src/components/ui/badge";
import { Banner, EmptyState } from "@/src/components/ui/banner";
import { Button } from "@/src/components/ui/button";
import { Stack } from "@/src/components/ui/layout";
import { setRowBusy, setRowMessage } from "@/src/lib/ui/task-state";
import type { NotificationType } from "@prisma/client";

type Notification = {
  id: string;
  type: NotificationType;
  readAt: string | null;
  createdAt: string;
  actor: { name: string };
  project: { slug: string; title: string };
  issue: { id: string; title: string } | null;
  discussion: { id: string; title: string } | null;
  forkedProject: { slug: string; title: string } | null;
  revision: { id: string; number: number; title: string } | null;
  release: { id: string; number: number; title: string } | null;
  proposal: { id: string; proposalNumber: number; title: string } | null;
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
        setErrorsById((current) => setRowMessage(current, id, payload?.error ?? "Could not mark notification as read."));
        return;
      }
      setNotifications((current) => current.map((notification) => notification.id === id ? { ...notification, readAt: new Date().toISOString() } : notification));
      setUnreadCount((current) => Math.max(0, current - 1));
      setSuccessesById((current) => setRowMessage(current, id, "Notification marked as read."));
      window.dispatchEvent(new Event("notifications-state-changed"));
    } catch {
      setErrorsById((current) => setRowMessage(current, id, "Could not mark notification as read. Please try again."));
    } finally {
      setPendingById((current) => setRowBusy(current, id, false));
    }
  }

  if (!notifications.length) return <EmptyState title="No new notifications." icon="clock">Notifications about Issues, Discussions, Forks, Proposal submissions, reviews, and applied changes, plus Revisions and Releases from projects you watch will appear here.</EmptyState>;
  return <Stack gap={3}>
    <p className="meta" aria-live="polite">Unread notifications <Badge tone={unreadCount ? "warning" : "success"}>{unreadCount}</Badge></p>
    <ul className="notifications">{notifications.map((notification) => {
      const issue = notification.type === "ISSUE_CREATED";
      const discussion = notification.type === "DISCUSSION_CREATED";
      const revision = notification.type === "REVISION_PUBLISHED";
      const release = notification.type === "RELEASE_PUBLISHED";
      const proposal = notification.proposal;
      const href = proposal ? `/proposals/${proposal.id}` : issue ? `/projects/${notification.project.slug}#issues` : discussion ? notification.discussion ? `/projects/${notification.project.slug}/discussions/${notification.discussion.id}` : `/projects/${notification.project.slug}#discussions` : revision ? notification.revision ? `/projects/${notification.project.slug}/revisions/${notification.revision.number}` : `/projects/${notification.project.slug}#revisions` : release ? notification.release ? `/projects/${notification.project.slug}/releases/${notification.release.number}` : `/projects/${notification.project.slug}#releases` : `/projects/${notification.forkedProject?.slug ?? notification.project.slug}`;
      const proposalAction = notification.type === "PROPOSAL_CREATED" ? "proposed changes in" : notification.type === "PROPOSAL_CHANGES_REQUESTED" ? "requested changes on" : notification.type === "PROPOSAL_APPROVED" ? "approved" : "applied changes from";
      const message = proposal ? `${notification.actor.name} ${proposalAction} Proposal #${proposal.proposalNumber} in ${notification.project.title}: “${proposal.title}”${notification.type === "PROPOSAL_APPLIED" && notification.revision ? ` to Revision ${notification.revision.number}` : ""}.` : issue ? `${notification.actor.name} created an Issue in ${notification.project.title}${notification.issue ? `: “${notification.issue.title}”` : ""}.` : discussion ? `${notification.actor.name} started a Discussion in ${notification.project.title}${notification.discussion ? `: “${notification.discussion.title}”` : ""}.` : revision ? `${notification.actor.name} published Revision${notification.revision ? ` ${notification.revision.number} in ${notification.project.title}${notification.revision.title ? `: “${notification.revision.title}”` : ""}` : ` in ${notification.project.title}`}.` : release ? `${notification.actor.name} published Release${notification.release ? ` ${notification.release.number} in ${notification.project.title}${notification.release.title ? `: “${notification.release.title}”` : ""}` : ` in ${notification.project.title}`}.` : `${notification.actor.name} forked ${notification.project.title}.`;
      const id = notification.id;
      return <li aria-busy={Boolean(pendingById[id])} className={`notification ${notification.readAt ? "read" : "unread"}`} key={id}><div><Link href={href}>{message}</Link><time className="meta" dateTime={notification.createdAt}>{new Date(notification.createdAt).toLocaleString("en-US")}</time></div>{!notification.readAt && <Button loading={Boolean(pendingById[id])} loadingLabel="Marking as read" onClick={() => { void markRead(id); }} size="sm" type="button" variant="secondary">Mark as read</Button>}{errorsById[id] && <Banner tone="error" title="Could not mark as read">{errorsById[id]}</Banner>}{successesById[id] && <Banner tone="success" title="Marked as read">{successesById[id]}</Banner>}</li>;
    })}</ul>
  </Stack>;
}
