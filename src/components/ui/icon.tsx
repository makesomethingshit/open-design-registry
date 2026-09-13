import type { ComponentPropsWithoutRef } from "react";

export type IconName = "search" | "chevron" | "plus" | "pencil" | "minus" | "rename" | "check" | "clock" | "warning" | "close" | "lock" | "globe" | "fork" | "file" | "image" | "zoom";

type IconProps = Omit<ComponentPropsWithoutRef<"svg">, "children"> & { name: IconName; size?: 16 | 20 | 24; title?: string };

export function Icon({ name, size = 20, title, ...props }: IconProps) {
  return <svg {...props} aria-hidden={title ? undefined : true} aria-label={title} role={title ? "img" : undefined} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    {title && <title>{title}</title>}
    <IconPaths name={name} />
  </svg>;
}

function IconPaths({ name }: { name: IconName }) {
  switch (name) {
    case "search": return <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>;
    case "chevron": return <path d="m6 9 6 6 6-6" />;
    case "plus": return <path d="M12 5v14M5 12h14" />;
    case "pencil": return <><path d="m4 20 4.2-1 10.6-10.6a2.1 2.1 0 0 0-3-3L5.2 16z" /><path d="m14.5 6.7 3 3" /></>;
    case "minus": return <path d="M5 12h14" />;
    case "rename": return <><path d="M4 7h13" /><path d="m14 4 3 3-3 3" /><path d="M20 17H7" /><path d="m10 14-3 3 3 3" /></>;
    case "check": return <path d="m5 12 4.2 4.2L19 6.5" />;
    case "clock": return <><circle cx="12" cy="12" r="8" /><path d="M12 7.5V12l3 2" /></>;
    case "warning": return <><path d="m12 4 8 15H4z" /><path d="M12 9v4" /><path d="M12 16.5h.01" /></>;
    case "close": return <path d="m6 6 12 12M18 6 6 18" />;
    case "lock": return <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>;
    case "globe": return <><circle cx="12" cy="12" r="8" /><path d="M4 12h16M12 4a12 12 0 0 1 0 16M12 4a12 12 0 0 0 0 16" /></>;
    case "fork": return <><circle cx="7" cy="5" r="2" /><circle cx="17" cy="5" r="2" /><circle cx="12" cy="19" r="2" /><path d="M7 7v2a5 5 0 0 0 5 5v3M17 7v2a5 5 0 0 1-5 5" /></>;
    case "file": return <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5M9 13h6M9 16h6" /></>;
    case "image": return <><rect x="4" y="5" width="16" height="14" rx="1" /><circle cx="9" cy="10" r="1.5" /><path d="m5 18 5-5 3.5 3.5 2-2 3.5 3.5" /></>;
    case "zoom": return <><circle cx="10.5" cy="10.5" r="5.5" /><path d="m15 15 4 4M10.5 8v5M8 10.5h5" /></>;
  }
}
