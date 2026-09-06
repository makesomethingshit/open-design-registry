import type { ReactNode } from "react";
import { Icon, type IconName } from "./icon";
import styles from "./banner.module.css";

type BannerTone = "info" | "success" | "warning" | "error";
type BannerProps = { tone: BannerTone; title: string; children?: ReactNode; action?: ReactNode; className?: string };

const bannerIcons: Record<BannerTone, IconName> = { info: "clock", success: "check", warning: "warning", error: "close" };

export function Banner({ action, children, className, title, tone }: BannerProps) {
  return <section aria-live={tone === "error" ? "assertive" : "polite"} className={`${styles.banner}${className ? ` ${className}` : ""}`} data-tone={tone} role={tone === "error" ? "alert" : "status"}>
    <Icon name={bannerIcons[tone]} size={20} />
    <div><strong>{title}</strong>{children && <p>{children}</p>}</div>
    {action && <div className={styles.action}>{action}</div>}
  </section>;
}

type EmptyStateProps = { title: string; children: ReactNode; action?: ReactNode; icon?: IconName; className?: string };

export function EmptyState({ action, children, className, icon = "file", title }: EmptyStateProps) {
  return <section className={`${styles.emptyState}${className ? ` ${className}` : ""}`}>
    <Icon name={icon} size={24} />
    <div><h2>{title}</h2><p>{children}</p>{action && <div className={styles.emptyAction}>{action}</div>}</div>
  </section>;
}
