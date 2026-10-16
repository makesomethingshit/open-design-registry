import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/src/lib/session";
import { prisma } from "@/src/lib/prisma";
import { canvasView, readCanvases } from "@/src/lib/canvas/service";
import { CanvasMembership } from "./canvas-membership";
import styles from "./canvas-membership.module.css";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };

export default async function CanvasesPage({ params }: Props) {
  const { slug } = await params;
  const [session, project] = await Promise.all([getSession(), prisma.project.findUnique({ where: { slug }, select: { isPublic: true, ownerId: true } })]);
  if (!project?.isPublic) notFound();
  const viewerId = session?.user.id ?? null;
  const rows = await readCanvases(slug, viewerId);
  return <>
    <p className={styles.muted}><Link href={`/projects/${slug}/discussions`}>Back to Discussions</Link></p>
    <CanvasMembership canvases={rows.map((canvas) => canvasView(canvas, viewerId))} isProjectOwner={viewerId === project.ownerId} signedIn={Boolean(session)} slug={slug} />
  </>;
}
