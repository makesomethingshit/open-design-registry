import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from "react";
import styles from "./layout.module.css";

type Gap = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
type SpacedProps = ComponentPropsWithoutRef<"div"> & { children: ReactNode; gap?: Gap };
type GapStyle = CSSProperties & { "--odr-layout-gap": string };

function gapStyle(gap: Gap, style?: CSSProperties): GapStyle {
  return { ...style, "--odr-layout-gap": `var(--odr-space-${gap})` };
}

export function Stack({ children, className, gap = 4, style, ...props }: SpacedProps) {
  return <div {...props} className={`${styles.stack}${className ? ` ${className}` : ""}`} style={gapStyle(gap, style)}>{children}</div>;
}

export function Inline({ children, className, gap = 2, style, ...props }: SpacedProps) {
  return <div {...props} className={`${styles.inline}${className ? ` ${className}` : ""}`} style={gapStyle(gap, style)}>{children}</div>;
}

type HeaderProps = { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string; id?: string };

export function SectionHeader({ actions, className, description, eyebrow, id, title }: HeaderProps) {
  return <header className={`${styles.sectionHeader}${className ? ` ${className}` : ""}`}><div>{eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}<h2 id={id}>{title}</h2>{description && <p className={styles.description}>{description}</p>}</div>{actions && <div className={styles.actions}>{actions}</div>}</header>;
}

export function PageHeader({ actions, className, description, eyebrow, id, title }: HeaderProps) {
  return <header className={`${styles.pageHeader}${className ? ` ${className}` : ""}`}><div>{eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}<h1 id={id}>{title}</h1>{description && <p className={styles.description}>{description}</p>}</div>{actions && <div className={styles.actions}>{actions}</div>}</header>;
}

type PanelProps = ComponentPropsWithoutRef<"section"> & { children: ReactNode };

export function Panel({ children, className, ...props }: PanelProps) {
  return <section {...props} className={`${styles.panel}${className ? ` ${className}` : ""}`}>{children}</section>;
}

export function Divider({ className, ...props }: ComponentPropsWithoutRef<"hr">) {
  return <hr {...props} className={`${styles.divider}${className ? ` ${className}` : ""}`} />;
}
