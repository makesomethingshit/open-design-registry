"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/src/components/ui/icon";
import { RouteNav } from "@/src/components/ui/section-nav";
import styles from "./project.module.css";
import navigationStyles from "./project-navigation.module.css";

const sections = ["revisions", "releases", "discussions", "issues", "proposals", "contributors", "forks"] as const;
type Counts = Record<typeof sections[number], number>;

export function legacyProjectDestination(base: string, search: string, hash: string) {
  const section = hash.slice(1);
  const query = new URLSearchParams(search);
  const baseRevision = Number(query.get("baseRevision"));
  if (section.startsWith("issue-") && section.length > 6) return `${base}/issues/${encodeURIComponent(section.slice(6))}${search}${hash}`;
  if (section === "owner-tools") return `${base}/revisions${search}${hash}`;
  if (sections.some((value) => value === section)) return `${base}/${section}${search}${hash}`;
  if (query.get("contributionTarget")?.match(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i) && Number.isInteger(baseRevision) && baseRevision > 0) return `${base}/revisions${search}`;
  if (query.has("proposalStatus")) return `${base}/proposals${search}`;
  return null;
}

export default function ProjectNavigation({ slug, counts, isOwner, proposalDetail = false }: { slug: string; counts: Counts; isOwner: boolean; proposalDetail?: boolean }) {
  const base = `/projects/${slug}`;
  const pathname = usePathname();
  const router = useRouter();
  const navigation = useRef<HTMLDivElement>(null);
  const section = pathname.slice(base.length + 1).split("/")[0];
  const currentHref = proposalDetail || section === "contribute" ? `${base}/proposals` : sections.includes(section as typeof sections[number]) || section === "settings" ? `${base}/${section}` : base;
  useEffect(() => {
    navigation.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
  }, [currentHref]);
  useEffect(() => {
    if (pathname !== base) return;
    function followLegacyLink() {
      const destination = legacyProjectDestination(base, window.location.search, window.location.hash);
      if (destination) router.replace(destination);
    }
    followLegacyLink();
    window.addEventListener("hashchange", followLegacyLink);
    return () => window.removeEventListener("hashchange", followLegacyLink);
  }, [base, pathname, router]);
  const items = [{ href: base, label: <>Overview</> }, ...sections.map((value) => ({ href: `${base}/${value}`, label: <>{value[0].toUpperCase() + value.slice(1)} <span className={styles.navCount}>{counts[value]}</span></> })), ...(isOwner ? [{ href: `${base}/settings`, label: <><Icon name="settings" size={16} />Settings</> }] : [])];
  return <div className={navigationStyles.navigation} ref={navigation}><RouteNav currentHref={currentHref} items={items} label="Project sections" /></div>;
}
