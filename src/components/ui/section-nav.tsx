import type { ReactNode } from "react";
import styles from "./navigation.module.css";

export type NavItem = { href: string; label: ReactNode };

type NavProps = { items: NavItem[]; currentHref?: string; label: string; className?: string };

export function SectionNav({ className, currentHref, items, label }: NavProps) {
  return <nav aria-label={label} className={`${styles.nav}${className ? ` ${className}` : ""}`}>
    {items.map((item) => <a aria-current={item.href === currentHref ? "location" : undefined} className={styles.link} data-current={item.href === currentHref || undefined} href={item.href} key={item.href}>{item.label}</a>)}
  </nav>;
}

export function RouteNav({ className, currentHref, items, label }: NavProps) {
  return <nav aria-label={label} className={`${styles.nav}${className ? ` ${className}` : ""}`}>
    {items.map((item) => <a aria-current={item.href === currentHref ? "page" : undefined} className={styles.link} data-current={item.href === currentHref || undefined} href={item.href} key={item.href}>{item.label}</a>)}
  </nav>;
}
