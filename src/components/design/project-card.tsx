import Link from "next/link";
import { Tag } from "@/src/components/ui/badge";
import { projectActivityStatusLabel, type ProjectActivityStatus } from "@/src/lib/project-activity-status";
import styles from "./project-card.module.css";

export type ProjectCardProps = {
  coverUrl: string;
  description: string;
  href: string;
  license: string;
  owner: string;
  priority?: boolean;
  tags: readonly string[];
  title: string;
  updatedAt: Date;
  activityStatus: ProjectActivityStatus;
};

export function ProjectCard({ activityStatus, coverUrl, description, href, license, owner, priority = false, tags, title, updatedAt }: ProjectCardProps) {
  return <article className={styles.card}>
    <Link aria-label={`View ${title}`} className={styles.mediaLink} href={href}>
      <div className={styles.media}>
        <span aria-hidden="true" className={styles.skeleton} />
        <img alt={`${title} cover`} decoding="async" fetchPriority={priority ? "high" : undefined} loading={priority ? "eager" : "lazy"} src={coverUrl} />
      </div>
    </Link>
    <div className={styles.content}>
      <h2><Link href={href}>{title}</Link></h2>
      {description && <p className={styles.description}>{description}</p>}
      <p className={styles.byline}>By {owner} <span aria-hidden="true">·</span> <time dateTime={updatedAt.toISOString()}>Updated {formatDate(updatedAt)}</time></p>
      <div className={styles.metadata}>
        <span>{license}</span>
        <Tag>{projectActivityStatusLabel(activityStatus)}</Tag>
        {tags.slice(0, 3).map((tag) => <Tag key={tag}>{tag}</Tag>)}
      </div>
    </div>
  </article>;
}

function formatDate(value: Date) {
  return value.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
