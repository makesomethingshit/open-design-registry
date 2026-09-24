import Link from "next/link";
import { StatusBadge, Tag } from "@/src/components/ui/badge";
import { projectActivityStatusPresentation } from "@/src/lib/ui/activity-status";
import styles from "./project-card.module.css";

export type ProjectCardProps = {
  activityStatus?: string;
  coverUrl: string;
  description: string;
  href: string;
  license: string;
  owner: string;
  priority?: boolean;
  tags: readonly string[];
  title: string;
  updatedAt: Date;
};

export function ProjectCard({ activityStatus = "ACTIVE", coverUrl, description, href, license, owner, priority = false, tags, title, updatedAt }: ProjectCardProps) {
  const status = projectActivityStatusPresentation(activityStatus);
  return <article className={styles.card}>
    <Link aria-label={`View ${title}`} className={styles.mediaLink} href={href}>
      <div className={styles.media}>
        <span aria-hidden="true" className={styles.skeleton} />
        <img alt={`${title} cover`} decoding="async" fetchPriority={priority ? "high" : undefined} loading={priority ? "eager" : "lazy"} src={coverUrl} />
      </div>
    </Link>
    <div className={styles.content}>
      <h2><Link href={href}>{title}</Link></h2>
      <StatusBadge icon={status.icon} tone={status.tone}>{status.label}</StatusBadge>
      {description && <p className={styles.description}>{description}</p>}
      <p className={styles.byline}>By {owner} <span aria-hidden="true">·</span> <time dateTime={updatedAt.toISOString()}>Updated {formatDate(updatedAt)}</time></p>
      <div className={styles.metadata}>
        <span>{license}</span>
        {tags.slice(0, 3).map((tag) => <Tag key={tag}>{tag}</Tag>)}
      </div>
    </div>
  </article>;
}

function formatDate(value: Date) {
  return value.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
