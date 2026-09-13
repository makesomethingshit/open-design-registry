import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { getAdminSession } from "@/src/lib/moderation";

export async function GET() {
  if (!await getAdminSession()) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  return NextResponse.json(await prisma.report.findMany({ orderBy: { createdAt: "desc" }, include: { reporter: { select: { name: true, email: true } }, project: { select: { slug: true, title: true } }, revision: { select: { number: true, project: { select: { slug: true, title: true } } } } } }));
}
