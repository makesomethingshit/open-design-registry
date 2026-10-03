import { renderProjectDocument } from "@/src/lib/project-document";
import ProjectDocumentEditLink from "./project-document-edit-link";
import styles from "./project.module.css";

export default function ProjectDocument({
  document,
  isOwner,
  hasRevision,
}: {
  document: string;
  isOwner: boolean;
  hasRevision: boolean;
  slug: string;
}) {
  const body = document.trim();
  return (
    <section aria-labelledby="project-document-heading" className={`${styles.section} ${styles.projectDocument}`} id="project-document">
      <header className={styles.sectionHeader}>
        <div>
          <p className={styles.eyebrow}>Project guide</p>
          <h2 id="project-document-heading">Project document</h2>
        </div>
        {isOwner && body && (
          <ProjectDocumentEditLink className={styles.secondaryLink}>
            Edit document
          </ProjectDocumentEditLink>
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
              {" "}Share the project's goals, design principles and ways to contribute.{" "}
              <ProjectDocumentEditLink>Add one in Owner tools</ProjectDocumentEditLink>.
            </>
          ) : hasRevision ? (
            <> Read About for a short summary and browse <a href="#revisions">Revisions</a> for the current design.</>
          ) : (
            <> Read About for a short summary. A revision has not been published yet.</>
          )}
        </p>
      )}
    </section>
  );
}
