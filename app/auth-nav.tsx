"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type User = { name?: string | null; role?: string | null };

export default function AuthNav() {
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

  if (!loaded || !user) return <nav><a href="/projects/new">프로젝트 만들기</a><a href="/login">로그인</a></nav>;
  return <nav><a href="/projects">내 프로젝트</a><a href="/projects/new">프로젝트 만들기</a><a href="/notifications" aria-label={unreadCount ? `알림, 미확인 ${unreadCount}개` : "알림"}>알림{unreadCount > 0 && <span className="notification-badge" aria-hidden="true">{unreadCount > 99 ? "99+" : unreadCount}</span>}</a>{user.role === "admin" && <a href="/admin/reports">신고 검토</a>}<span className="nav-user">{user.name || "회원"}</span><button type="button" className="nav-button" onClick={signOut}>로그아웃</button></nav>;
}
