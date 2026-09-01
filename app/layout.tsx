import type { Metadata } from "next";
import "./globals.css";
import AuthNav from "./auth-nav";

export const metadata: Metadata = { title: "Open Design Registry", description: "공개 디자인 프로젝트 저장소" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body><header><a href="/" className="brand">Open Design Registry</a><AuthNav /></header><main>{children}</main></body></html>;
}
