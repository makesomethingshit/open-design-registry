import { Panel, PageGrid, Stack, WideColumn } from "@/src/components/ui/layout";
import styles from "../../project.module.css";

export default function DiscussionLoading() {
  return <PageGrid aria-busy="true" aria-label="Loading discussion">
    <WideColumn className={styles.discussionDetailPage}>
      <p aria-live="polite" className="meta" role="status">Loading discussion…</p>
      <Panel className={styles.discussionLoading}>
        <span className={styles.discussionSkeleton} />
        <span className={styles.discussionSkeleton} />
        <span className={styles.discussionSkeleton} />
      </Panel>
      <Panel><Stack gap={4}><span className={styles.discussionSkeleton} /><span className={styles.discussionSkeleton} /></Stack></Panel>
    </WideColumn>
  </PageGrid>;
}
