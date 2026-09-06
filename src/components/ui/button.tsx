import type { ComponentPropsWithoutRef, ReactNode } from "react";
import styles from "./button.module.css";

type ButtonProps = ComponentPropsWithoutRef<"button"> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  loadingLabel?: string;
};

export function Button({ children, className, disabled, loading = false, loadingLabel = "Working…", size = "md", type = "button", variant = "primary", ...props }: ButtonProps) {
  return <button {...props} aria-busy={loading || undefined} className={`${styles.button} ${styles[variant]} ${styles[size]}${className ? ` ${className}` : ""}`} disabled={disabled || loading} type={type}>
    {loading && <span aria-hidden="true" className={styles.spinner} />}
    <span>{children}</span>
    {loading && <span className="sr-only">{loadingLabel}</span>}
  </button>;
}

type IconButtonProps = Omit<ComponentPropsWithoutRef<"button">, "children"> & {
  children: ReactNode;
  label: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
};

export function IconButton({ children, className, label, loading, size = "md", type = "button", variant = "ghost", ...props }: IconButtonProps) {
  return <button {...props} aria-busy={loading || undefined} aria-label={label} className={`${styles.button} ${styles.iconButton} ${styles[variant]} ${styles[size]}${className ? ` ${className}` : ""}`} disabled={props.disabled || loading} title={label} type={type}>
    {loading ? <span aria-hidden="true" className={styles.spinner} /> : children}
    {loading && <span className="sr-only">{label} in progress</span>}
  </button>;
}

type TextLinkProps = ComponentPropsWithoutRef<"a"> & { children: ReactNode };

export function TextLink({ children, className, ...props }: TextLinkProps) {
  return <a {...props} className={`${styles.textLink}${className ? ` ${className}` : ""}`}>{children}</a>;
}
