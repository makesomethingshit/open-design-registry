import exploreStyles from "../page.module.css";
import styles from "./stars.module.css";

export default function LoadingStars() {
  return <div className={styles.page}>
    <header className={styles.hero}>
      <p className={styles.eyebrow}>Workspace</p>
      <h1>Starred projects</h1>
      <p className={styles.subtitle}>Projects you want to revisit.</p>
    </header>
    <section aria-busy="true" aria-labelledby="starred-projects-heading" className={styles.projects}>
      <header className={styles.sectionHeader}>
        <h2 id="starred-projects-heading">Projects</h2>
        <p>Most recently starred first</p>
      </header>
      <div aria-hidden="true" className={exploreStyles.gallery}>
        {Array.from({ length: 4 }, (_, index) => <article className={styles.skeletonCard} key={index}>
          <div className={styles.skeletonMedia} />
          <div className={styles.skeletonLine} />
          <div className={styles.skeletonShortLine} />
        </article>)}
      </div>
      <p className="sr-only" role="status">Loading starred projects...</p>
    </section>
  </div>;
}
