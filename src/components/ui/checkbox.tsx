"use client";

import { useEffect, useId, useRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import styles from "./field.module.css";

type CheckboxProps = Omit<ComponentPropsWithoutRef<"input">, "type"> & {
  label: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  indeterminate?: boolean;
};

export function Checkbox({ className, description, error, id, indeterminate = false, label, ...props }: CheckboxProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const descriptionId = description ? `${controlId}-description` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (input.current) input.current.indeterminate = indeterminate; }, [indeterminate]);

  return <div className={styles.checkbox}>
    <input {...props} ref={input} aria-describedby={[props["aria-describedby"], descriptionId, errorId].filter(Boolean).join(" ") || undefined} aria-invalid={error ? true : props["aria-invalid"]} className={`${styles.checkboxInput}${className ? ` ${className}` : ""}`} id={controlId} type="checkbox" />
    <div>
      <label className={styles.checkboxLabel} htmlFor={controlId}>{label}</label>
      {description && <p className={styles.description} id={descriptionId}>{description}</p>}
      {error && <p className={styles.error} id={errorId} role="alert">{error}</p>}
    </div>
  </div>;
}
