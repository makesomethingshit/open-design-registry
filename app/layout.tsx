import type { Metadata } from "next";
import "./globals.css";
import AuthNav from "./auth-nav";

export const metadata: Metadata = { title: "Open Design Registry", description: "공개 디자인 프로젝트 저장소" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><a className="skip-link" href="#main">Skip to content</a><header className="site-header"><div className="site-header-inner"><a href="/" className="brand"><span className="brand-mark" aria-hidden="true">O</span><span>Open Design Registry</span></a><form className="global-search" action="/" role="search"><label className="sr-only" htmlFor="global-search-input">Search projects</label><span className="search-icon" aria-hidden="true">⌕</span><input id="global-search-input" name="q" type="search" placeholder="Search projects…" /></form><AuthNav /></div></header><main id="main">{children}</main></body></html>;
}
