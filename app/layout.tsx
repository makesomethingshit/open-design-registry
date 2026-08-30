import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Open Design Registry", description: "공개 디자인 프로젝트 저장소" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body><header><a href="/" className="brand">Open Design Registry</a><nav><a href="/projects/new">프로젝트 만들기</a><a href="/login">로그인</a></nav></header><main>{children}</main></body></html>;
}
