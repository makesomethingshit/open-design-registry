import type { ComponentPropsWithoutRef, ReactNode } from "react";
import type { StatusTone } from "@/src/lib/ui/status-presentation";
import { Icon, type IconName } from "./icon";
import styles from "./badge.module.css";

type BadgeProps = ComponentPropsWithoutRef<"span"> & { children: ReactNode; tone?: StatusTone };

export function Badge({ children, className, tone = "neutral", ...props }: BadgeProps) {
  return <span {...props} className={`${styles.badge}${className ? ` ${className}` : ""}`} data-tone={tone}>{children}</span>;
}

type StatusBadgeProps = BadgeProps & { icon?: IconName };

export function StatusBadge({ children, icon, ...props }: StatusBadgeProps) {
  return <Badge {...props}>{icon && <Icon name={icon} size={16} />}{children}</Badge>;
}

type TagProps = ComponentPropsWithoutRef<"span"> & { children: ReactNode };

export function Tag({ children, className, ...props }: TagProps) {
  return <span {...props} className={`${styles.tag}${className ? ` ${className}` : ""}`}>{children}</span>;
}

type TagLinkProps = ComponentPropsWithoutRef<"a"> & { children: ReactNode; href: string };

export function TagLink({ children, className, ...props }: TagLinkProps) {
  return <a {...props} className={`${styles.tag}${styles.tagLink}${className ? ` ${className}` : ""}`}>{children}</a>;
}
