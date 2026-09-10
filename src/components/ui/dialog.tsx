"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "./icon";
import { IconButton } from "./button";
import styles from "./dialog.module.css";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  initialFocus?: "close" | "action";
  className?: string;
  busy?: boolean;
};

export function Dialog({ actions, busy, children, className, initialFocus = "close", onClose, open, title }: DialogProps) {
  return <DialogSurface actions={actions} busy={busy} className={className} initialFocus={initialFocus} onClose={onClose} open={open} title={title}>{children}</DialogSurface>;
}

export function Drawer({ actions, busy, children, className, initialFocus = "close", onClose, open, title }: DialogProps) {
  return <DialogSurface actions={actions} busy={busy} className={`${styles.drawer}${className ? ` ${className}` : ""}`} initialFocus={initialFocus} onClose={onClose} open={open} title={title}>{children}</DialogSurface>;
}

function DialogSurface({ actions, busy = false, children, className, initialFocus, onClose, open, title }: DialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      element.showModal();
      requestAnimationFrame(() => {
        const target = initialFocus === "action"
          ? element.querySelector<HTMLElement>("[data-dialog-initial-focus]")
          : element.querySelector<HTMLElement>("[data-dialog-close]");
        target?.focus();
      });
    }
    if (!open && element.open) {
      element.close();
      returnFocus.current?.focus();
    }
  }, [initialFocus, open]);

  return <dialog aria-busy={busy || undefined} aria-labelledby={titleId} className={`${styles.dialog}${className ? ` ${className}` : ""}`} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} ref={dialog}>
    <header className={styles.header}>
      <h2 id={titleId}>{title}</h2>
      <IconButton data-dialog-close disabled={busy} label="Close dialog" onClick={onClose}><Icon name="close" /></IconButton>
    </header>
    <div className={styles.body}>{children}</div>
    {actions && <footer className={styles.actions}>{actions}</footer>}
  </dialog>;
}
