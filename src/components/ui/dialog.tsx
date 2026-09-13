"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "./icon";
import { IconButton } from "./button";
import styles from "./dialog.module.css";

const focusableSelector = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable=true]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusableWithin(element: HTMLDialogElement) {
  return Array.from(element.querySelectorAll<HTMLElement>(focusableSelector)).filter((candidate) => {
    const style = window.getComputedStyle(candidate);
    return style.display !== "none" && style.visibility !== "hidden" && candidate.getClientRects().length > 0;
  });
}

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
  const lastFocused = useRef<HTMLElement | null>(null);
  const titleId = useId();

  function focusInitial(element: HTMLDialogElement) {
    const preferred = initialFocus === "action"
      ? element.querySelector<HTMLElement>("[data-dialog-initial-focus]")
      : element.querySelector<HTMLElement>("[data-dialog-close]");
    (preferred ?? focusableWithin(element)[0] ?? element).focus();
  }

  function restoreFocus(element: HTMLDialogElement) {
    const focusable = focusableWithin(element);
    const previous = lastFocused.current;
    const target = previous && focusable.includes(previous) ? previous : focusable[0];
    (target ?? element).focus();
  }

  function trapFocus(event: React.KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Tab") return;
    const focusable = focusableWithin(event.currentTarget);
    if (!focusable.length) {
      event.preventDefault();
      event.currentTarget.focus();
      return;
    }
    const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
    if (currentIndex === -1 || (!event.shiftKey && currentIndex === focusable.length - 1) || (event.shiftKey && currentIndex === 0)) {
      event.preventDefault();
      focusable[event.shiftKey ? focusable.length - 1 : 0].focus();
    }
  }

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      element.showModal();
      requestAnimationFrame(() => {
        if (element.open) focusInitial(element);
      });
    }
    if (!open && element.open) {
      element.close();
      const target = returnFocus.current;
      returnFocus.current = null;
      target?.focus();
    }
  }, [initialFocus, open]);

  useEffect(() => {
    const element = dialog.current;
    if (open && element?.open && !element.contains(document.activeElement)) restoreFocus(element);
  });

  return <dialog aria-busy={busy || undefined} aria-labelledby={titleId} className={`${styles.dialog}${className ? ` ${className}` : ""}`} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} onFocusCapture={(event) => { if (event.target instanceof HTMLElement) lastFocused.current = event.target; }} onKeyDown={trapFocus} ref={dialog} tabIndex={-1}>
    <header className={styles.header}>
      <h2 id={titleId}>{title}</h2>
      <IconButton data-dialog-close disabled={busy} label="Close dialog" onClick={onClose}><Icon name="close" /></IconButton>
    </header>
    <div className={styles.body}>{children}</div>
    {actions && <footer className={styles.actions}>{actions}</footer>}
  </dialog>;
}
