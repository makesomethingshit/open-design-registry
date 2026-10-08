import type { ComponentPropsWithoutRef } from "react";
import { octicons } from "./octicons";

export type IconName = keyof typeof octicons;

type IconProps = Omit<ComponentPropsWithoutRef<"svg">, "children"> & { name: IconName; size?: 16 | 24; title?: string };

export function Icon({ name, size = 24, title, style, ...props }: IconProps) {
  return <svg {...props} aria-hidden={title ? undefined : true} aria-label={title} role={title ? "img" : undefined} focusable="false" width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="currentColor" style={{ flexShrink: 0, ...style }}>
    {title && <title>{title}</title>}
    {octicons[name][size]}
  </svg>;
}
