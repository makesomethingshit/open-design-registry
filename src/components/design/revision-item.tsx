import type { ReactNode } from "react";
import Link from "next/link";
import { Tag } from "@/src/components/ui/badge";
import styles from "./revision-item.module.css";

type RevisionItemProps = {
  capability?: ReactNode;
  changeDescription: string;
  createdAt: Date;
  href: string;
  id: string;
  number: number;
  publisher?: string | null;
  tags: readonly string[];
  title: string;
  tool?: string | null;
};

export function RevisionItem({ capability, changeDescription, createdAt, href, id, number, publisher, tags, title, tool }: RevisionItemProps) {
  return <li className={styles.item}>
    <div aria-hidden="true" className={styles.marker}>r{number}</div>
    <div className={styles.content}>
      <h3><Link href={href}>{title}</Link></h3>
      {changeDescription && changeDescription !== title && <p className={styles.description}>{changeDescription}</p>}
      {capability}
      <div className={styles.metadata}>
        <span>{publisher ? `Published by ${publisher}` : "Publisher not recorded"}</span><code>{id.slice(0, 8)}</code>{tool && <span>{tool}</span>}
        {tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}
      </div>
    </div>
    <time className={styles.time} dateTime={createdAt.toISOString()}>{formatDate(createdAt)}</time>
  </li>;
}

function formatDate(value: Date) {
  return value.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}
