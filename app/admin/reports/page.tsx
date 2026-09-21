import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { getAdminSession } from "@/src/lib/moderation";
import { PageGrid, PageHeader, ReadingColumn } from "@/src/components/ui/layout";
import ReportList from "./report-list";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  if (!await getAdminSession()) redirect("/");
  const reports = await prisma.report.findMany({ orderBy: { createdAt: "desc" }, include: { reporter: { select: { name: true, email: true } }, project: { select: { slug: true, title: true } }, revision: { select: { number: true, project: { select: { slug: true, title: true } } } } } });
  return <PageGrid aria-labelledby="reports-heading">
    <ReadingColumn>
      <PageHeader eyebrow="MODERATION" id="reports-heading" title="신고 검토" description="공개 콘텐츠 신고를 행 단위로 검토하고 처리합니다." />
      <ReportList reports={reports} />
    </ReadingColumn>
  </PageGrid>;
}
