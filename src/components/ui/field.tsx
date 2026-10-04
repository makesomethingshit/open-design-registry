import { cloneElement, isValidElement, type ComponentPropsWithoutRef, type ComponentPropsWithRef, type ReactElement, type ReactNode } from "react";
import styles from "./field.module.css";

type ControlElementProps = { id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean | "true" | "false" };

type FieldProps = {
  id: string;
  label: ReactNode;
  children: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  invalid?: boolean;
  required?: boolean;
  className?: string;
};

export function Field({ children, className, description, error, id, invalid = false, label, required }: FieldProps) {
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;
  const hasError = Boolean(error) || invalid;
  const control = isValidElement<ControlElementProps>(children)
    ? cloneElement(children as ReactElement<ControlElementProps>, {
      id: children.props.id ?? id,
      "aria-describedby": [children.props["aria-describedby"], describedBy].filter(Boolean).join(" ") || undefined,
      "aria-invalid": hasError ? true : children.props["aria-invalid"],
    })
    : children;

  return <div className={`${styles.field}${className ? ` ${className}` : ""}`}>
    <label className={styles.label} htmlFor={id}>{label}{required && <span aria-hidden="true"> *</span>}</label>
    {control}
    {description && <p className={styles.description} id={descriptionId}>{description}</p>}
    {error && <p className={styles.error} id={errorId} role="alert">{error}</p>}
  </div>;
}

type InputProps = ComponentPropsWithoutRef<"input"> & { invalid?: boolean };

export function Input({ className, invalid, ...props }: InputProps) {
  return <input {...props} aria-invalid={invalid || props["aria-invalid"] || undefined} className={`${styles.control}${className ? ` ${className}` : ""}`} />;
}

type TextareaProps = ComponentPropsWithRef<"textarea"> & { invalid?: boolean };

export function Textarea({ className, invalid, ...props }: TextareaProps) {
  return <textarea {...props} aria-invalid={invalid || props["aria-invalid"] || undefined} className={`${styles.control} ${styles.textarea}${className ? ` ${className}` : ""}`} />;
}

type SelectProps = ComponentPropsWithoutRef<"select"> & { invalid?: boolean };

export function Select({ children, className, invalid, ...props }: SelectProps) {
  return <select {...props} aria-invalid={invalid || props["aria-invalid"] || undefined} className={`${styles.control} ${styles.select}${className ? ` ${className}` : ""}`}>{children}</select>;
}
