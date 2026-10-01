"use client";

import { type ReactNode } from "react";

export default function ProjectDocumentEditLink({ children, className }: { children: ReactNode; className?: string }) {
  return <a className={className} href="#owner-tools" onClick={(event) => {
    const field = document.getElementById("settings-document");
    if (!field) return;
    event.preventDefault();
    for (let parent = field.parentElement; parent; parent = parent.parentElement) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
    }
    field.focus();
    field.scrollIntoView({ block: "center" });
  }}>{children}</a>;
}
