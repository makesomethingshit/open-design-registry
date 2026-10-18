import { NextResponse } from "next/server";
import { auth } from "@/src/lib/auth";
import { prisma } from "@/src/lib/prisma";
import { createRightsDeclaration, validateRightsAgainstRevision, validateRightsSourceFiles } from "@/src/lib/revision-rights";
import { parseRightsDeclaration } from "@/src/lib/rights";
import { ExpiredDocumentImageError, imageReferenceTransactionOptions } from "@/src/lib/project-document-save";
import { maxRightsJsonBytes, readBoundedJson } from "@/src/lib/request-body";

function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function scope(slug: string, numberValue: string, request: Request, requireOwner = false) {
  const project = await prisma.project.findUnique({ where: { slug }, select: { id: true, ownerId: true, isPublic: true } });
  if (!project) return { response: error("Project not found", 404) } as const;
  const session = await auth.api.getSession({ headers: request.headers });
  if (!project.isPublic && session?.user.id !== project.ownerId) return { response: error("Project not found", 404) } as const;
  if (requireOwner && !session) return { response: error("Sign-in required", 401) } as const;
  if (requireOwner && session?.user.id !== project.ownerId) return { response: error("Only the project owner can change rights information", project.isPublic ? 403 : 404) } as const;
  const number = Number(numberValue);
  if (!Number.isInteger(number) || number < 1) return { response: error("Revision not found", 404) } as const;
  const revision = await prisma.revision.findUnique({
    where: { projectId_number: { projectId: project.id, number } },
    select: { id: true, sourceKey: true, isPublished: true, license: true },
  });
  if (!revision?.isPublished) return { response: error("Revision not found", 404) } as const;
  return { project, revision, session } as const;
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string; number: string }> }) {
  const { slug, number } = await params;
  const result = await scope(slug, number, request);
  if ("response" in result) return result.response;
  const declaration = await prisma.revisionRightsDeclaration.findFirst({ where: { revisionId: result.revision.id }, orderBy: { version: "desc" }, include: { items: true } });
  return NextResponse.json({ revisionId: result.revision.id, revisionLicense: result.revision.license, declaration });
}

async function save(request: Request, { params }: { params: Promise<{ slug: string; number: string }> }) {
  const { slug, number } = await params;
  const result = await scope(slug, number, request, true);
  if ("response" in result) return result.response;
  if (!result.session) return error("Sign-in required", 401);
  const userId = result.session.user.id;
  const body = await readBoundedJson(request, maxRightsJsonBytes);
  if (body.tooLarge) return error("Request body is too large", 413);
  const parsed = parseRightsDeclaration(body.value);
  if ("error" in parsed) return error("Rights declaration is invalid", 400);
  try {
    const revisionRightsError = validateRightsAgainstRevision(result.revision, parsed.data);
    if (revisionRightsError) return error(revisionRightsError, 400);
    const sourceError = await validateRightsSourceFiles(result.revision, parsed.data.items);
    if (sourceError) return error(sourceError, 400);
    const declaration = await prisma.$transaction((tx) => createRightsDeclaration(tx, result.revision.id, userId, parsed.data), imageReferenceTransactionOptions);
    return NextResponse.json({ revisionId: result.revision.id, revisionLicense: result.revision.license, declaration }, { status: 201 });
  } catch (cause) {
    if (cause instanceof ExpiredDocumentImageError) return error(cause.message, 409);
    console.error("rights declaration save failed", cause);
    return error("Rights declaration could not be saved", 500);
  }
}

export const POST = save;
export const PATCH = save;
export const PUT = save;
