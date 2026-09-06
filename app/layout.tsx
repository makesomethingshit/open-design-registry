import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import AuthNav from "./auth-nav";
import { Icon } from "@/src/components/ui/icon";
import { ThemeSelect } from "@/src/components/ui/theme-select";
import { themeCookieName, themeFromCookie } from "@/src/lib/ui/theme";

export const metadata: Metadata = { title: "Open Design Registry", description: "A public registry for reusable design work." };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const theme = themeFromCookie((await cookies()).get(themeCookieName)?.value);
  return <html data-theme={theme} lang="en"><body><a className="skip-link" href="#main">Skip to content</a><header className="site-header"><div className="site-header-inner"><a href="/" className="brand"><span className="brand-wordmark">ODR</span><span>Open Design Registry</span></a><form className="global-search" action="/" role="search"><label className="sr-only" htmlFor="global-search-input">Search projects</label><Icon className="search-icon" name="search" size={16} /><input id="global-search-input" name="q" type="search" placeholder="Search projects" /></form><ThemeSelect initialTheme={theme} /><AuthNav /></div></header><main id="main">{children}</main></body></html>;
}
