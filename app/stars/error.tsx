"use client";

import { Banner } from "@/src/components/ui/banner";
import { Button } from "@/src/components/ui/button";
import styles from "./stars.module.css";

export default function ErrorStars({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className={styles.page}>
    <header className={styles.hero}>
      <p className={styles.eyebrow}>Workspace</p>
      <h1>Starred projects</h1>
      <p className={styles.subtitle}>Projects you want to revisit.</p>
    </header>
    <section aria-labelledby="starred-projects-heading" className={styles.projects}>
      <header className={styles.sectionHeader}>
        <h2 id="starred-projects-heading">Projects</h2>
      </header>
      <Banner action={<Button onClick={reset} variant="secondary">Retry</Button>} title="Could not load your starred projects." tone="error">Please try again. Your saved projects have not changed.</Banner>
    </section>
  </div>;
}
