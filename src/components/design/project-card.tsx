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
  titleLevel?: 2 | 3;
  updatedAt: Date;
};

export function ProjectCard({ activityStatus = "ACTIVE", coverUrl, description, href, license, owner, priority = false, tags, title, titleLevel = 2, updatedAt }: ProjectCardProps) {
  const status = projectActivityStatusPresentation(activityStatus);
  const Heading = titleLevel === 3 ? "h3" : "h2";
  return <article className={styles.card}>
    <Link aria-label={`View ${title}`} className={styles.mediaLink} href={href}>
      <div className={styles.media}>
        {coverUrl ? <><span aria-hidden="true" className={styles.skeleton} /><img alt={`${title} cover`} decoding="async" fetchPriority={priority ? "high" : undefined} loading={priority ? "eager" : "lazy"} src={coverUrl} /></> : <span className={styles.noPreview}>No preview</span>}
        <span aria-hidden="true" className={styles.openLabel}>Open project <span>→</span></span>
      </div>
    </Link>
    <div className={styles.content}>
      <Heading><Link href={href}>{title}</Link></Heading>
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
