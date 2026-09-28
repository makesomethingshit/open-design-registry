"use client";

import { useState } from "react";
import styles from "./page.module.css";

export function RequestCardImage({ alt, src }: { alt: string; src: string }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  if (failed) {
    return <div className={styles.noPreview}><p>Preview couldn{"'"}t load. Open the request for details.</p></div>;
  }
  return <div className={styles.imageFrame}>
    {!loaded && <div aria-hidden="true" className={styles.skeleton} />}
    <img alt={alt} className={loaded ? undefined : styles.imageLoading} loading="lazy" onError={() => setFailed(true)} onLoad={() => setLoaded(true)} src={src} />
  </div>;
}
