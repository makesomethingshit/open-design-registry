import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import CapabilityBadge from "@/app/capability-badge";
import { ProjectHeader } from "@/src/components/design/project-header";
import { PageGrid, WideColumn } from "@/src/components/ui/layout";
import { countVisibleProposals } from "@/src/lib/proposal-handlers";
import { listProjectAttribution } from "@/src/lib/attribution";
import { getSession } from "@/src/lib/session";
import { prisma } from "@/src/lib/prisma";
import ContributeDialog from "./contribute-dialog";
import { ProjectStarButton } from "./project-star-button";
import { ProjectWatchButton } from "./project-watch-button";
import ProjectNavigation from "./project-navigation";
import styles from "./project.module.css";

export default async function ProjectLayout({ params, children, proposalDetail = false }: { params: Promise<{ slug: string }>; children: ReactNode; proposalDetail?: boolean }) {
  const { slug } = await params;
  const session = await getSession();
  const project = await prisma.project.findUnique({ where: { slug }, include: {
    owner: { select: { name: true } },
    revisions: { where: { isPublished: true }, orderBy: { number: "desc" }, take: 1 },
    _count: { select: { revisions: { where: { isPublished: true } }, releases: true, discussions: true, issues: true, forks: { where: { isPublic: true } } } },
    forkedFrom: { select: { slug: true, title: true, owner: { select: { name: true } } } },
    forkedFromRevision: { select: { number: true } },
  } });
  if (!project || (!project.isPublic && session?.user.id !== project.ownerId)) notFound();
  const latestRevision = project.revisions[0];
  const [activeProposalCount, attribution, starCount, watchCount] = await Promise.all([
    countVisibleProposals(project.id, session?.user.id, "open"),
    listProjectAttribution(project.id, session?.user.id),
    project.isPublic && session ? prisma.projectStar.count({ where: { userId: session.user.id, projectId: project.id } }) : Promise.resolve(0),
    project.isPublic && session ? prisma.projectWatch.count({ where: { userId: session.user.id, projectId: project.id } }) : Promise.resolve(0),
  ]);
  const initialStarred = starCount > 0;
  const initialWatched = watchCount > 0;
  return <PageGrid aria-labelledby="project-title"><WideColumn><article className={styles.project}>
    <ProjectHeader
      activityStatus={project.activityStatus}
       actions={<>{latestRevision && <CapabilityBadge adapterConfidence={latestRevision.adapterConfidence} adapterId={latestRevision.adapterId} adapterMaturity={latestRevision.adapterMaturity} adapterVersion={latestRevision.adapterVersion} label="Contribution scope" mode={latestRevision.capabilityMode} unitCount={latestRevision.capabilityUnitCount} />}{project.isPublic && <ProjectStarButton initialStarred={initialStarred} key={project.slug} signedIn={Boolean(session)} slug={project.slug} />}{project.isPublic && <ProjectWatchButton initialWatched={initialWatched} signedIn={Boolean(session)} slug={project.slug} />}<ContributeDialog revisionNumber={latestRevision?.number} signedIn={Boolean(session)} slug={project.slug} /><ContributeDialog initialIntent="fork" revisionNumber={latestRevision?.number} signedIn={Boolean(session)} slug={project.slug} /></>}
      description={project.description}
      license={project.license}
      lineage={project.forkedFrom && <>Forked from <Link href={`/projects/${project.forkedFrom.slug}`}>{project.forkedFrom.title}</Link> <span aria-hidden="true">·</span> Revision {project.forkedFromRevision?.number ?? "unknown"} <span aria-hidden="true">·</span> Original author {project.forkedFrom.owner.name} <span aria-hidden="true">·</span> Original revision license {project.forkedFromLicense ?? "not recorded"}</>}
      owner={project.owner.name}
      revisionCount={project._count.revisions}
      slug={project.slug}
      title={project.title}
      visibility={project.isPublic ? "public" : "private"}
    />

    <ProjectNavigation counts={{ revisions: project._count.revisions, releases: project._count.releases, discussions: project._count.discussions, issues: project._count.issues, proposals: activeProposalCount, contributors: attribution.length, forks: project._count.forks }} isOwner={session?.user.id === project.ownerId} proposalDetail={proposalDetail} slug={slug} />
    {children}
  </article></WideColumn></PageGrid>;
}
