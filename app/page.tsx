import Link from "next/link";
import Image from "next/image";
import { Icon } from "@/src/components/ui/icon";
import { TextLink } from "@/src/components/ui/button";
import buttonStyles from "@/src/components/ui/button.module.css";
import styles from "./page.module.css";

const primaryLink = `${buttonStyles.button} ${buttonStyles.primary} ${buttonStyles.lg}`;

export default function HomePage() {
  return <div className={styles.landing}>
    <section aria-labelledby="landing-heading" className={styles.hero}>
      <p className={styles.eyebrow}>Open source. Open possibilities.</p>
      <h1 id="landing-heading">Good design.<br /><span>Built in the open.</span></h1>
      <p className={styles.intro}>A home for design you can open, understand, and build on.<br className={styles.desktopBreak} /> Source files, shared history, and a place to make your next move.</p>
      <div className={styles.heroActions}>
        <Link className={primaryLink} href="/explore">Explore projects <span aria-hidden="true">↗</span></Link>
      </div>
      <p className={styles.heroNote}>Browse freely. Start with what inspires you.</p>
    </section>

    <div className={styles.stage}>
      <figure className={styles.projectWindow}>
        <figcaption className={styles.sampleLabel}>Example project / illustrative content</figcaption>
        <div className={styles.projectHeading}><div><h2><span>studio /</span> Aster coffee identity</h2><p><Icon name="globe" size={16} /> Public <span>·</span> Active <span>·</span> CC BY 4.0</p></div><span className={styles.projectMark} aria-hidden="true">a*</span></div>
        <div className={styles.projectSections} aria-hidden="true"><span>Overview</span><span>Revisions</span><span>Releases</span><span>Proposals</span><span>Discussions</span></div>
        <div className={styles.projectBody}>
          <Image className={styles.projectArtwork} src="/landing-aster.svg" width={960} height={600} unoptimized loading="eager" alt="Original Aster sample identity: green and cream coffee packaging with a botanical print." />
          <aside className={styles.context} aria-label="Example source and revision history">
            <p className={styles.panelLabel}>Published source</p>
            <strong className={styles.sourceName}><Icon name="file" />aster-identity.zip</strong>
            <p className={styles.contextNote}>Editable files, with their origin attached.</p>
            <div className={styles.history}><p className={styles.panelLabel}>Revision history</p><ol>
              <li><span>r3</span><div><strong>Packaging exploration</strong><small>A new direction, same project.</small></div></li>
              <li><span>r2</span><div>Color and typography</div></li>
              <li><span>r1</span><div>Initial identity</div></li>
            </ol></div>
            <p className={styles.contextNote}>Every revision keeps a starting point.</p>
          </aside>
        </div>
      </figure>
    </div>

    <aside className={styles.createCallout} aria-label="Start a project"><div><strong>Have work to share?</strong><p>Publish your source, credit its origin, and invite the next contribution.</p></div><TextLink href="/projects/new">Create a project <span aria-hidden="true">→</span></TextLink></aside>

    <div className={styles.tools}><p className={styles.panelLabel}>Keep the source. Move the work forward.</p><ul aria-label="What you can share"><li>Editable files</li><li>Assets</li><li>Source links</li></ul></div>

    <section aria-labelledby="workflow-heading" className={styles.features}>
      <p className={styles.eyebrow}>The work, and everything behind it.</p>
      <h2 id="workflow-heading">A file is only the beginning.</h2>
      <div className={styles.featureGrid}>
        <article className={styles.progress}>
          <p className={styles.panelLabel}>01 / Keep the work moving</p>
          <h3>One idea.<br />Room for the next.</h3>
          <p className={styles.featureDescription}>Fork the source. Explore a direction. Propose a change.<br className={styles.desktopBreak} /> The project carries the context forward.</p>
          <div className={styles.contributionExample}>
            <Image src="/landing-aster.svg" width={960} height={600} unoptimized alt="" loading="lazy" />
            <div className={styles.proposal}><Icon name="fork" /><strong>Packaging exploration</strong><span>Fork → Proposal → Review</span><p>A new revision, with its origin intact.</p></div>
          </div>
          <p className={styles.sampleLabel}>Illustrative workflow</p>
        </article>
        <article className={styles.files}>
          <p className={styles.panelLabel}>02 / Open the source</p>
          <h3>Look beyond the preview.</h3>
          <ul><li><Icon name="file" /><span>aster-identity.zip</span><small>Source</small></li><li><Icon name="image" /><span>packaging.svg</span><small>Asset</small></li></ul>
        </article>
        <article className={styles.contribute}>
          <p className={styles.panelLabel}>03 / Make the next contribution</p>
          <h3>Keep the source.<br />Move the work forward.</h3>
          <p className={styles.featureDescription}>Follow the source and its credit. Publish a revision and propose what comes next.</p>
          <Link href="/contribute">Find a design request <span aria-hidden="true">→</span></Link>
        </article>
      </div>
    </section>

    <section aria-labelledby="start-heading" className={styles.start}>
      <div><h2 id="start-heading">Your next idea<br />has a starting point.</h2><p>Discover open work. Make it your own.</p></div>
      <Link className={primaryLink} href="/explore">Find a project <span aria-hidden="true">↗</span></Link>
    </section>
  </div>;
}
