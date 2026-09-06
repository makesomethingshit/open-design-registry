import type { ReactNode } from "react";
import Link from "next/link";
import { Tag } from "@/src/components/ui/badge";
import { Icon } from "@/src/components/ui/icon";
import styles from "./project-header.module.css";

type ProjectHeaderProps = {
  actions?: ReactNode;
  description: string;
  lineage?: ReactNode;
  license: string;
  owner: string;
  revisionCount: number;
  slug: string;
  title: string;
  visibility: "public" | "private";
};

export function ProjectHeader({ actions, description, lineage, license, owner, revisionCount, slug, title, visibility }: ProjectHeaderProps) {
  const isPublic = visibility === "public";
  return <header className={styles.header}>
    <div className={styles.content}>
      <p className={styles.path}><Link href="/">Open Design Registry</Link> <span aria-hidden="true">/</span> {slug}</p>
      <div className={styles.titleRow}><h1>{title}</h1><Tag><Icon name={isPublic ? "globe" : "lock"} size={16} />{isPublic ? "Public" : "Private"}</Tag></div>
      {description && <p className={styles.description}>{description}</p>}
      {lineage && <p className={styles.lineage}>{lineage}</p>}
      <dl className={styles.meta}>
        <div><dt>Owner</dt><dd>{owner}</dd></div>
        <div><dt>License</dt><dd>{license}</dd></div>
        <div><dt>Revisions</dt><dd>{revisionCount}</dd></div>
      </dl>
    </div>
    {actions && <div className={styles.actions}>{actions}</div>}
  </header>;
}
