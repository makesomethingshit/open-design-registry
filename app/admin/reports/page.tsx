import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { getAdminSession } from "@/src/lib/moderation";
import { assetKeyFromStoredUrl } from "@/src/lib/storage";
import { PageGrid, PageHeader, ReadingColumn } from "@/src/components/ui/layout";
import ReportList from "./report-list";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  if (!await getAdminSession()) redirect("/");
  const reports = await prisma.report.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      reporter: { select: { name: true, email: true } },
      project: { select: { id: true, slug: true, title: true, coverUrl: true } },
      revision: { select: { number: true, project: { select: { id: true, slug: true, title: true, coverUrl: true } } } },
    },
  });

  const sourceProjects = reports.map((report) => report.project ?? report.revision?.project).filter((value) => value !== null && value !== undefined);
  const projectIds = [...new Set(sourceProjects.map((project) => project.id))];
  const urls = [...new Set(sourceProjects.map((project) => project.coverUrl))];
  const keys = [...new Set(sourceProjects.map((project) => assetKeyFromStoredUrl(project.coverUrl)).filter((key): key is string => Boolean(key)))];
  const [coverCounts, holds, blocks] = await Promise.all([
    urls.length ? prisma.project.groupBy({ by: ["coverUrl"], where: { coverUrl: { in: urls } }, _count: { _all: true } }) : [],
    projectIds.length ? prisma.moderationProjectHold.findMany({ where: { projectId: { in: projectIds }, active: true }, select: { projectId: true, reportId: true } }) : [],
    keys.length ? prisma.moderationAssetBlock.findMany({ where: { key: { in: keys }, blocked: true }, select: { key: true, reportId: true } }) : [],
  ]);
  const counts = new Map(coverCounts.map((row) => [row.coverUrl, row._count._all]));
  const activeHolds = new Map(holds.map((row) => [row.projectId, row.reportId]));
  const activeBlocks = new Set(blocks.map((row) => `${row.reportId}:${row.key}`));

  const items = reports.map((report) => {
    const project = report.project ?? report.revision?.project;
    const key = assetKeyFromStoredUrl(project?.coverUrl);
    return {
      ...report,
      coverSharedCount: project ? counts.get(project.coverUrl) ?? 0 : 0,
      projectHidden: Boolean(project && activeHolds.get(project.id) === report.id),
      coverBlocked: Boolean(key && activeBlocks.has(`${report.id}:${key}`)),
    };
  });

  return <PageGrid aria-labelledby="reports-heading">
    <ReadingColumn>
      <PageHeader eyebrow="MODERATION" id="reports-heading" title="Review reports" description="Project visibility and shared asset removal are separate moderation actions." />
      <ReportList reports={items} />
    </ReadingColumn>
  </PageGrid>;
}
