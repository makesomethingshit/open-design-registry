"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { Icon } from "@/src/components/ui/icon";

export function ProjectSearchInput({ id, placeholder }: { id?: string; placeholder: string }) {
  const pathname = usePathname();
  const query = useSearchParams().get("q")?.trim() ?? "";
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const historyNavigation = performance.getEntriesByType("navigation").some((entry) => (entry as PerformanceNavigationTiming).type === "back_forward");
    const syncQuery = (event?: PageTransitionEvent) => {
      if ((event?.persisted || historyNavigation) && input.current) input.current.value = new URLSearchParams(window.location.search).get("q")?.trim() ?? "";
    };
    syncQuery();
    window.addEventListener("pageshow", syncQuery);
    return () => window.removeEventListener("pageshow", syncQuery);
  }, []);
  return <input key={`${pathname}?${query}`} ref={input} id={id} name="q" placeholder={placeholder} type="search" defaultValue={query} />;
}

export default function GlobalSearch() {
  return <form className="global-search" action="/explore" role="search"><label className="sr-only" htmlFor="global-search-input">Search projects</label><Icon className="search-icon" name="search" size={16} /><ProjectSearchInput id="global-search-input" placeholder="Search projects" /></form>;
}
