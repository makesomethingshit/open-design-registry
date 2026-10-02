import Link from "next/link";
import { Icon } from "@/src/components/ui/icon";
import buttonStyles from "@/src/components/ui/button.module.css";
import styles from "./page.module.css";

const primaryLink = `${buttonStyles.button} ${buttonStyles.primary} ${buttonStyles.lg}`;
const secondaryLink = `${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.lg}`;

export default function HomePage() {
  return <div className={styles.landing}>
    <section aria-labelledby="landing-heading" className={styles.hero}>
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}>Design belongs in the open</p>
        <h1 id="landing-heading">Good design.<br /><span>Built in the open.</span></h1>
        <p className={styles.intro}>Discover the source. Follow the changes.<br />Make something of your own.</p>
        <div className={styles.heroActions}>
          <Link className={primaryLink} href="/explore">Explore projects</Link>
          <Link className={secondaryLink} href="/projects/new">Create a project</Link>
        </div>
        <p className={styles.heroNote}>Open files. Shared history. Your next starting point.</p>
      </div>
      <figure className={styles.showcase}>
        <figcaption className={styles.eyebrow}>An open project, from the inside</figcaption>
        <div className={styles.projectPreview}>
          <div className={styles.previewHeading}><strong>Common Ground</strong><span>Example project</span></div>
          <svg className={styles.artwork} viewBox="0 0 560 192" aria-hidden="true">
            <text x="24" y="66">COMMON</text><text x="24" y="121">GROUND</text>
            <rect x="368" y="24" width="112" height="112" className={styles.artSquare} />
            <circle cx="480" cy="128" r="56" className={styles.artCircle} />
          </svg>
        </div>
        <dl className={styles.projectContext}>
          <div><dt><Icon name="file" size={16} />Source</dt><dd><strong>common-ground.penpot</strong><p>The editable starting point.</p></dd></div>
          <div><dt><Icon name="clock" size={16} />Revision history</dt><dd><p><span>r1</span> Initial design</p><p><span>r2</span> Refined typography</p></dd></div>
        </dl>
      </figure>
    </section>
    <section aria-labelledby="workflow-heading" className={styles.workflow}>
      <p className={styles.eyebrow}>From inspiration to contribution</p>
      <h2 id="workflow-heading">More than a finished picture.</h2>
      <ol className={styles.steps}>
        <li><span>01 / Source</span><h3>Start with the source</h3><p>Inspect the published files and understand where the design began.</p></li>
        <li><span>02 / History</span><h3>Keep the context</h3><p>Follow published revisions, releases, and the decisions behind the work.</p></li>
        <li><span>03 / Contribution</span><h3>Make the next move</h3><p>Fork a project, edit in your own tool, and propose a revision for review.</p></li>
      </ol>
    </section>
    <section aria-labelledby="start-heading" className={styles.start}>
      <div><h2 id="start-heading">Find your next starting point.</h2><p>Browse public work. Build on what inspires you.</p></div>
      <Link className={primaryLink} href="/explore">Find a project</Link>
    </section>
  </div>;
}
