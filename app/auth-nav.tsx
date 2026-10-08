"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import GlobalSearch from "./global-search";
import { ThemeSelect } from "@/src/components/ui/theme-select";
import type { ThemeValue } from "@/src/lib/ui/theme";
import buttonStyles from "@/src/components/ui/button.module.css";

type User = { name?: string | null; role?: string | null };

export default function AuthNav({ initialTheme }: { initialTheme: ThemeValue }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const account = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function closeOutside(event: PointerEvent) {
      if (!account.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

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
    setOpen(false);
    router.push("/");
    router.refresh();
  }

  const accountActive = ["/projects", "/stars", "/notifications"].includes(pathname) || pathname.startsWith("/admin/reports");
  return <>
    <nav className="public-nav" aria-label="Public">
      <a aria-current={pathname === "/explore" ? "page" : undefined} href="/explore" className="nav-link">Explore</a>
      <a aria-current={pathname === "/contribute" ? "page" : undefined} href="/contribute" className="nav-link">Contribute</a>
      <a aria-current={pathname === "/feed" ? "page" : undefined} href="/feed" className="nav-link">Feed</a>
    </nav>
    <Suspense><GlobalSearch /></Suspense>
    <a aria-current={pathname === "/projects/new" ? "page" : undefined} href="/projects/new" className={`${buttonStyles.button} ${buttonStyles.primary} ${buttonStyles.sm} nav-cta`}>New project</a>
    <ThemeSelect initialTheme={initialTheme} />
    <div className="account-nav" ref={account} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }} onKeyDown={(event) => {
      if (event.key === "Escape" && open) {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    }}>
      {!loaded || !user ? <a href="/login" className="nav-link">Sign in</a> : <>
        <button ref={trigger} type="button" className="nav-button account-trigger" aria-controls="account-panel" aria-expanded={open} data-active={accountActive || undefined} aria-label={unreadCount ? `Account, ${unreadCount} unread notifications` : "Account"} onClick={() => setOpen(!open)}>Account <span aria-hidden="true">⌄</span>{unreadCount > 0 && <span className="notification-badge" aria-hidden="true">{unreadCount > 99 ? "99+" : unreadCount}</span>}</button>
        <nav id="account-panel" className="account-panel" aria-label="Account" hidden={!open}>
          <a aria-current={pathname === "/projects" ? "page" : undefined} href="/projects" className="nav-link">My projects</a>
          <a aria-current={pathname === "/stars" ? "page" : undefined} href="/stars" className="nav-link">Starred</a>
          <a aria-current={pathname === "/notifications" ? "page" : undefined} href="/notifications" className="nav-link" aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}>Notifications{unreadCount > 0 && <span className="notification-badge" aria-hidden="true">{unreadCount > 99 ? "99+" : unreadCount}</span>}</a>
          {user.role === "admin" && <a aria-current={pathname.startsWith("/admin/reports") ? "page" : undefined} href="/admin/reports" className="nav-link">Reports</a>}
          <button type="button" className="nav-button" onClick={signOut}>Sign out</button>
        </nav>
      </>}
    </div>
  </>;
}
