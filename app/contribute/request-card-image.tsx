"use client";

import { useState } from "react";
import styles from "./page.module.css";

export function RequestCardImage({ alt, src }: { alt: string; src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <div className={styles.noPreview}><p>Preview couldn{"'"}t load. Open the request for details.</p></div>;
  }
  return <div className={styles.imageFrame}>
    <img alt={alt} loading="lazy" onError={() => setFailed(true)} ref={(image) => {
      if (image?.complete && image.naturalWidth === 0) setFailed(true);
    }} src={src} />
  </div>;
}
