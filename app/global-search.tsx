"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/src/components/ui/icon";

export function ProjectSearchInput({ id, placeholder }: { id?: string; placeholder: string }) {
  const pathname = usePathname();
  const query = useSearchParams().get("q")?.trim() ?? "";
  const [value, setValue] = useState(query);
  useEffect(() => {
    const syncQuery = () => setValue(new URLSearchParams(window.location.search).get("q")?.trim() ?? "");
    setValue(query);
    window.addEventListener("pageshow", syncQuery);
    return () => window.removeEventListener("pageshow", syncQuery);
  }, [pathname, query]);
  return <input id={id} name="q" onChange={(event) => setValue(event.target.value)} placeholder={placeholder} type="search" value={value} />;
}

export default function GlobalSearch() {
  return <form className="global-search" action="/explore" role="search"><label className="sr-only" htmlFor="global-search-input">Search projects</label><Icon className="search-icon" name="search" size={16} /><ProjectSearchInput id="global-search-input" placeholder="Search projects" /></form>;
}
