import Link from "next/link";
import buttonStyles from "@/src/components/ui/button.module.css";
import styles from "./page.module.css";

const primaryLink = `${buttonStyles.button} ${buttonStyles.primary} ${buttonStyles.lg}`;
const secondaryLink = `${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.lg}`;

export default function HomePage() {
  return <div className={styles.explore}>
    <section aria-labelledby="landing-heading" className={styles.hero}>
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}>Open design registry</p>
        <h1 id="landing-heading">Design projects you can trace and build on.</h1>
        <p className={styles.intro}>Explore public design projects with their source files, published revisions, and a clear path to contribute.</p>
        <div className={styles.heroActions}>
          <Link className={primaryLink} href="/explore">Explore projects</Link>
          <Link className={secondaryLink} href="/projects/new">Create a project</Link>
        </div>
        <p className={styles.heroNote}>Browse first. Open a project to inspect its source, history, and contribution options.</p>
      </div>
      <aside aria-labelledby="story-heading" className={styles.story}>
        <p className={styles.eyebrow}>How a project moves</p>
        <h2 id="story-heading">Open work keeps its context.</h2>
        <p className={styles.storyIntro}>A shared project can carry its origin and each change forward.</p>
        <ol className={styles.storySteps}>
          <li><span aria-hidden="true">01</span><div><strong>Start with the source</strong><p>Open the project and its published files.</p></div></li>
          <li><span aria-hidden="true">02</span><div><strong>Follow the revisions</strong><p>See how the design changes over time.</p></div></li>
          <li><span aria-hidden="true">03</span><div><strong>Fork, then propose</strong><p>Edit in your own tool; publish a revision for review.</p></div></li>
        </ol>
        <p className={styles.storyNote}>Proposal review happens on the project.</p>
      </aside>
    </section>

  </div>;
}
