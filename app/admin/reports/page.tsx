import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { getAdminSession } from "@/src/lib/moderation";
import { PageGrid, PageHeader, ReadingColumn } from "@/src/components/ui/layout";
import ReportList from "./report-list";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  if (!await getAdminSession()) redirect("/");
  const [reports, holds, blocks] = await Promise.all([
    prisma.report.findMany({ orderBy: { createdAt: "desc" }, include: {
      reporter: { select: { name: true, email: true } },
      project: { select: { id: true, slug: true, title: true, coverUrl: true } },
      revision: { select: { number: true, project: { select: { id: true, slug: true, title: true, coverUrl: true } } } },
    } }),
    prisma.moderationProjectHold.findMany({ where: { active: true } }),
    prisma.moderationAssetBlock.findMany({ where: { blocked: true } }),
  ]);
  const urls = [...new Set(reports.map(report => (report.project ?? report.revision?.project)?.coverUrl).filter((url): url is string => Boolean(url)))];
  const coverCounts = urls.length ? await prisma.project.groupBy({ by: ["coverUrl"], where: { coverUrl: { in: urls } }, _count: { _all: true } }) : [];
  const counts = new Map(coverCounts.map(row => [row.coverUrl, row._count._all]));
  const hiddenReports = new Set(holds.map(hold => hold.reportId));
  const blockedReports = new Set(blocks.map(block => block.reportId));
  const items = reports.map(report => ({
    ...report, coverSharedCount: counts.get((report.project ?? report.revision?.project)?.coverUrl ?? "") ?? 0,
    projectHidden: hiddenReports.has(report.id), coverBlocked: blockedReports.has(report.id),
  }));
  const existingIds = new Set(reports.map(report => report.id));
  const retainedIds = [...new Set([...hiddenReports, ...blockedReports])].filter(id => !existingIds.has(id));
  const events = retainedIds.length ? await prisma.moderationEvent.findMany({ where: { reportId: { in: retainedIds } }, orderBy: { createdAt: "desc" } }) : [];
  const retained = retainedIds.map(id => {
    const activeHold = holds.find(hold => hold.reportId === id);
    const savedBlocks = blocks.filter(block => block.reportId === id);
    const relevantEvents = events.filter(event => event.reportId === id);
    // A later restore event must not masquerade as the reason for an
    // independently active hold or asset block.
    const holdEvent = activeHold
      ? relevantEvents.find(event => event.projectId === activeHold.projectId && (event.action === "HIDE_PROJECT" || event.action === "LEGACY_REVIEW_HOLD"))
      : undefined;
    const blockDecisions = savedBlocks.map(block => ({
      block, event: relevantEvents.find(event => event.action === "BLOCK_COVER" && event.assetKey === block.key),
    }));
    const activeEvent = holdEvent ?? blockDecisions.find(({ event }) => event)?.event;
    return {
      id, reason: activeEvent?.reportReason || "Retained moderation decision",
      details: [
        activeEvent?.reportDetails,
        ...(activeHold ? [`Project hide: ${holdEvent?.resolutionNote || "No retained moderation note"}`] : []),
        ...blockDecisions.map(({ block, event }) => `Blocked cover ${block.key}: ${block.reason || event?.resolutionNote || "No retained moderation reason"}`),
      ].filter(Boolean).join("\n"),
      status: "RESOLVED", sourceMissing: true, coverSharedCount: 0,
      projectHidden: hiddenReports.has(id), coverBlocked: blockedReports.has(id),
      reporter: { name: "Source report deleted", email: "" },
    };
  });
  return <PageGrid aria-labelledby="reports-heading"><ReadingColumn>
    <PageHeader eyebrow="MODERATION" id="reports-heading" title="Review reports" description="Project visibility and shared asset removal are separate moderation actions." />
    <ReportList reports={items} />
    {retained.length > 0 && <section aria-labelledby="retained-heading">
      <h2 id="retained-heading">Retained decisions with deleted reports</h2>
      <p>The original report is unavailable. These retained decisions and reasons can still be reviewed and restored.</p>
      <ReportList reports={retained} />
    </section>}
  </ReadingColumn></PageGrid>;
}
