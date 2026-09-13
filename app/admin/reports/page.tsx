import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { getAdminSession } from "@/src/lib/moderation";
import ReportList from "./report-list";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  if (!await getAdminSession()) redirect("/");
  const reports = await prisma.report.findMany({ orderBy: { createdAt: "desc" }, include: { reporter: { select: { name: true, email: true } }, project: { select: { slug: true, title: true } }, revision: { select: { number: true, project: { select: { slug: true, title: true } } } } } });
  return <section><p className="meta">MODERATION</p><h1>신고 검토</h1><ReportList reports={reports} /></section>;
}
