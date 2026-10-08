import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import AuthNav from "./auth-nav";
import { themeCookieName, themeFromCookie } from "@/src/lib/ui/theme";

export const metadata: Metadata = { title: "Open Design Registry", description: "A public registry for reusable design work." };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const theme = themeFromCookie((await cookies()).get(themeCookieName)?.value);
  return <html data-theme={theme} lang="en"><body><a className="skip-link" href="#main">Skip to content</a><header className="site-header"><div className="site-header-inner"><a href="/" className="brand" aria-label="Open Design Registry home"><span className="brand-wordmark">ODR</span></a><AuthNav initialTheme={theme} /></div></header><main id="main">{children}</main></body></html>;
}
