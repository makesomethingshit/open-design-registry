import type { ReactNode } from "react";
import Link from "next/link";
import { Tag } from "@/src/components/ui/badge";
import { Icon } from "@/src/components/ui/icon";
import type { ProjectActivityStatus } from "@prisma/client";
import styles from "./project-header.module.css";

type ProjectHeaderProps = {
  actions?: ReactNode;
  activityStatus: ProjectActivityStatus;
  description: string;
  lineage?: ReactNode;
  license: string;
  owner: string;
  revisionCount: number;
  slug: string;
  title: string;
  visibility: "public" | "private";
};

export function ProjectHeader({ actions, activityStatus, description, lineage, license, owner, revisionCount, slug, title, visibility }: ProjectHeaderProps) {
  const isPublic = visibility === "public";
  const introduction = projectIntroduction(description);
  return <header className={styles.header}>
    <div className={styles.content}>
      <p className={styles.path}><Link href="/">Open Design Registry</Link> <span aria-hidden="true">/</span> {slug}</p>
      <div className={styles.titleRow}><h1 id="project-title">{title}</h1><Tag><Icon name={isPublic ? "globe" : "lock"} size={16} />{isPublic ? "Public" : "Private"}</Tag></div>
      {introduction && <p className={styles.description}>{introduction}</p>}
      {lineage && <p className={styles.lineage}>{lineage}</p>}
      <dl className={styles.meta}>
        <div><dt>Owner</dt><dd>{owner}</dd></div>
        <div><dt>Activity</dt><dd>{activityStatus.charAt(0) + activityStatus.slice(1).toLowerCase()}</dd></div>
        <div><dt>License</dt><dd>{license}</dd></div>
        <div><dt>Revisions</dt><dd>{revisionCount}</dd></div>
      </dl>
    </div>
    {actions && <div className={styles.actions}>{actions}</div>}
  </header>;
}

function projectIntroduction(description: string) {
  const sentenceEnd = description.search(/[.!?。！？](?:\s|$)/);
  const firstSentence = sentenceEnd >= 0 ? description.slice(0, sentenceEnd + 1) : description;
  if (firstSentence.length <= 160) return firstSentence;
  const wordEnd = firstSentence.lastIndexOf(" ", 159);
  return `${firstSentence.slice(0, wordEnd > 0 ? wordEnd : 159).trimEnd()}…`;
}
