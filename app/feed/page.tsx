import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/src/components/ui/badge";
import { EmptyState } from "@/src/components/ui/banner";
import { PageGrid, PageHeader, ReadingColumn } from "@/src/components/ui/layout";
import { getFeedPage, parseFeedCursor } from "@/src/lib/feed";
import styles from "./feed.module.css";

export const dynamic = "force-dynamic";

export default async function FeedPage({ searchParams }: { searchParams: Promise<{ cursor?: string | string[] }> }) {
  const { cursor: value } = await searchParams;
  let cursor: ReturnType<typeof parseFeedCursor>;
  try {
    cursor = parseFeedCursor(typeof value === "string" ? value : value?.[0]);
  } catch {
    notFound();
  }
  const { items, nextCursor } = await getFeedPage(cursor);

  return <PageGrid aria-labelledby="feed-heading"><ReadingColumn>
    <PageHeader description="Published revisions and releases from public projects, newest first." eyebrow="Explore" id="feed-heading" title="Recent changes" />
    {items.length ? <ol aria-label="Recent project changes" className={styles.list}>{items.map((item) => {
      const href = `/projects/${item.project.slug}/${item.type === "REVISION" ? "revisions" : "releases"}/${item.number}`;
      return <li className={styles.item} key={`${item.type}-${item.id}`}>
        <div className={styles.meta}><Badge tone={item.type === "RELEASE" ? "success" : "neutral"}>{item.type === "RELEASE" ? "Release" : "Revision"}</Badge><time dateTime={item.createdAt.toISOString()}>{item.createdAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</time></div>
        <p className={styles.project}><Link href={`/projects/${item.project.slug}`}>{item.project.title}</Link></p>
        <h2><Link href={href}>{item.title}</Link></h2>
        <p className={styles.detail}>{item.type === "RELEASE" ? `Release ${item.number}` : `Revision ${item.number}`} · {item.publisher ? `Published by ${item.publisher}` : "Publisher not recorded"}</p>
        {item.description && <p className={styles.description}>{item.description}</p>}
      </li>;
    })}</ol> : <EmptyState action={<Link href="/explore">Explore projects</Link>} title="No public changes yet.">Published revisions and releases will appear here.</EmptyState>}
    {nextCursor && <nav aria-label="Feed pages" className={styles.pagination}><Link href={`/feed?cursor=${encodeURIComponent(nextCursor)}`}>Older changes</Link></nav>}
  </ReadingColumn></PageGrid>;
}
