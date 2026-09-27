import Link from "next/link";
import { renderProjectDocument } from "@/src/lib/project-document";
import styles from "./project.module.css";

export default function ProjectDocument({
  document,
  isOwner,
}: {
  document: string;
  isOwner: boolean;
  slug: string;
}) {
  const body = document.trim();
  return (
    <section aria-labelledby="project-document-heading" className={styles.section} id="project-document">
      <header className={styles.sectionHeader}>
        <div>
          <p className={styles.eyebrow}>Overview</p>
          <h2 id="project-document-heading">Project document</h2>
        </div>
        {isOwner && body && (
          <Link className={styles.secondaryLink} href="#owner-tools">
            Edit document
          </Link>
        )}
      </header>
      {body ? (
        <div
          className={styles.prose}
          // ponytail: rendered HTML is fully escaped + allowlisted by renderProjectDocument (no raw HTML passthrough).
          dangerouslySetInnerHTML={{ __html: renderProjectDocument(body) }}
        />
      ) : (
        <p className={styles.muted}>
          No project document has been added yet.
          {isOwner ? (
            <>
              {" "}
              <Link href="#owner-tools">Add one in Owner tools</Link>.
            </>
          ) : null}
        </p>
      )}
    </section>
  );
}
