"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type User = { name?: string | null; role?: string | null };

export default function AuthNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function loadSession() {
      try {
        const response = await fetch("/api/auth/get-session", { cache: "no-store" });
        const payload = response.ok ? await response.json() as { user?: User } : null;
        const nextUser = payload?.user ?? null;
        setUser(nextUser);
        if (!nextUser) {
          setUnreadCount(0);
          return;
        }
        try {
          const notificationsResponse = await fetch("/api/notifications", { cache: "no-store" });
          const notifications = notificationsResponse.ok ? await notificationsResponse.json() as { unreadCount?: number } : null;
          setUnreadCount(typeof notifications?.unreadCount === "number" ? notifications.unreadCount : 0);
        } catch {
          setUnreadCount(0);
        }
      } catch {
        setUser(null);
        setUnreadCount(0);
      } finally {
        setLoaded(true);
      }
    }
    loadSession();
    window.addEventListener("auth-state-changed", loadSession);
    window.addEventListener("notifications-state-changed", loadSession);
    return () => {
      window.removeEventListener("auth-state-changed", loadSession);
      window.removeEventListener("notifications-state-changed", loadSession);
    };
  }, []);

  async function signOut() {
    await fetch("/api/auth/sign-out", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => undefined);
    setUser(null);
    router.push("/");
    router.refresh();
  }

  if (!loaded || !user) return <nav className="auth-nav" aria-label="Account"><a href="/#public-projects-heading" className="nav-link">Explore</a><a aria-current={pathname === "/feed" ? "page" : undefined} href="/feed" className="nav-link">Feed</a><a href="/projects/new" className="nav-link nav-cta">New project</a><a href="/login" className="nav-link">Sign in</a></nav>;
  const initial = (user.name || "A").slice(0, 1).toUpperCase();
  return <nav className="auth-nav" aria-label="Account"><a href="/projects" className="nav-link">My projects</a><a aria-current={pathname === "/stars" ? "page" : undefined} href="/stars" className="nav-link">Starred</a><a aria-current={pathname === "/feed" ? "page" : undefined} href="/feed" className="nav-link">Feed</a><a href="/projects/new" className="nav-link nav-cta">New project</a><a href="/notifications" className="nav-link" aria-label={unreadCount ? `Activity, ${unreadCount} unread` : "Activity"}>Activity{unreadCount > 0 && <span className="notification-badge" aria-hidden="true">{unreadCount > 99 ? "99+" : unreadCount}</span>}</a>{user.role === "admin" && <a href="/admin/reports" className="nav-link">Reports</a>}<span className="nav-profile"><span className="avatar avatar-small" aria-hidden="true">{initial}</span><span className="nav-user">{user.name || "Account"}</span></span><button type="button" className="nav-button" onClick={signOut}>Sign out</button></nav>;
}
