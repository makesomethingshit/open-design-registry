import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/src/lib/session";
import { prisma } from "@/src/lib/prisma";
import { CanvasError, canvasView, readCanvasPage } from "@/src/lib/canvas/service";
import { PrivateProjectWrite } from "@/src/lib/project-visibility-lock";
import { CanvasMembership } from "./canvas-membership";
import styles from "./canvas-membership.module.css";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ cursor?: string }> };

export default async function CanvasesPage({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const [session, project] = await Promise.all([getSession(), prisma.project.findUnique({ where: { slug }, select: { isPublic: true, ownerId: true } })]);
  if (!project?.isPublic) notFound();
  const viewerId = session?.user.id ?? null;
  const cursor = query.cursor && query.cursor.length <= 128 ? query.cursor : undefined;
  let page;
  try {
    page = await readCanvasPage(slug, viewerId, cursor);
  } catch (error) {
    if (error instanceof PrivateProjectWrite || error instanceof CanvasError && error.status === 404) notFound();
    throw error;
  }
  return <>
    <p className={styles.muted}><Link href={`/projects/${slug}/discussions`}>Back to Discussions</Link></p>
    <CanvasMembership canvases={page.items.map((canvas) => canvasView(canvas, viewerId))} isProjectOwner={viewerId === project.ownerId} nextCursor={page.nextCursor} signedIn={Boolean(session)} slug={slug} />
  </>;
}
