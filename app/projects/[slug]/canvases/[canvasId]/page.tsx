import { notFound } from "next/navigation";
import { getSession } from "@/src/lib/session";
import { prisma } from "@/src/lib/prisma";
import { CanvasError, canvasView, readCanvases } from "@/src/lib/canvas/service";
import { PrivateProjectWrite } from "@/src/lib/project-visibility-lock";
import { CanvasDetail } from "../canvas-membership";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string; canvasId: string }> };

export default async function CanvasDetailPage({ params }: Props) {
  const { slug, canvasId } = await params;
  const [session, project] = await Promise.all([getSession(), prisma.project.findUnique({ where: { slug }, select: { isPublic: true } })]);
  if (!project?.isPublic) notFound();
  let canvas;
  try { canvas = (await readCanvases(slug, session?.user.id ?? null, canvasId))[0]; }
  catch (error) {
    if (error instanceof PrivateProjectWrite || error instanceof CanvasError && error.status === 404) notFound();
    throw error;
  }
  if (!canvas) notFound();
  return <CanvasDetail canvas={canvasView(canvas, session?.user.id ?? null)} canvasId={canvasId} slug={slug}>
    {/* B/C item components mount here; CanvasView carries canEdit, canComment, and layoutVersion. */}
  </CanvasDetail>;
}
