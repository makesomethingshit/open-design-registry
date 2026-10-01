import { renderProjectDocument } from "@/src/lib/project-document";
import ProjectDocumentEditLink from "./project-document-edit-link";
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
              {" "}
              <ProjectDocumentEditLink>Add one in Owner tools</ProjectDocumentEditLink>.
            </>
          ) : null}
        </p>
      )}
    </section>
  );
}
