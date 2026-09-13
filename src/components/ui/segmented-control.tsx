"use client";

import { useId, type ReactNode } from "react";
import styles from "./navigation.module.css";

type Segment = { value: string; label: ReactNode; disabled?: boolean };
type SegmentedControlProps = { label: string; items: Segment[]; value: string; onChange: (value: string) => void; className?: string };

export function SegmentedControl({ className, items, label, onChange, value }: SegmentedControlProps) {
  const id = useId();
  return <fieldset aria-label={label} className={`${styles.segmented}${className ? ` ${className}` : ""}`}>
    <legend className="sr-only">{label}</legend>
    {items.map((item) => {
      const controlId = `${id}-${item.value}`;
      return <label className={styles.segment} key={item.value} htmlFor={controlId}>
        <input checked={value === item.value} className={styles.segmentInput} disabled={item.disabled} id={controlId} name={id} onChange={() => onChange(item.value)} type="radio" value={item.value} />
        <span>{item.label}</span>
      </label>;
    })}
  </fieldset>;
}
