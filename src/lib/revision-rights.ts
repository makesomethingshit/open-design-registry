import type { Prisma } from "@prisma/client";
import { readRevisionBundle, type RevisionBundle } from "./revision-bundle";
import type { RightsDeclarationInput } from "./rights";

function validateRightsSourceFilesInBundle(bundle: RevisionBundle | null, items: RightsDeclarationInput["items"]) {
  const ids = items.map((item) => item.sourceFileId).filter((id): id is string => Boolean(id));
  if (!ids.length) return null;
  if (new Set(ids).size !== ids.length) return "Each source file can be referenced only once";
  const available = new Set(bundle?.files.map((file) => file.id) ?? []);
  return ids.every((id) => available.has(id)) ? null : "A rights item references a source file that is not in this revision bundle";
}

export async function validateRightsSourceFiles(revision: { sourceKey?: string | null }, items: RightsDeclarationInput["items"]) {
  return validateRightsSourceFilesInBundle(await readRevisionBundle(revision.sourceKey), items);
}

export { validateRightsSourceFilesInBundle };

export async function createRightsDeclaration(
  tx: Prisma.TransactionClient,
  revisionId: string,
  createdById: string,
  input: RightsDeclarationInput,
) {
  await tx.$queryRaw`SELECT id FROM "Revision" WHERE id = ${revisionId} FOR UPDATE`;
  const previous = await tx.revisionRightsDeclaration.findFirst({ where: { revisionId }, orderBy: { version: "desc" } });
  return tx.revisionRightsDeclaration.create({
    data: {
      revisionId,
      version: (previous?.version ?? 0) + 1,
      sourceRightsMode: input.sourceRightsMode,
      sourceLicenseName: input.sourceLicenseName,
      sourceLicenseUrl: input.sourceLicenseUrl,
      sourceRightsHolder: input.sourceRightsHolder,
      notes: input.notes,
      createdById,
      supersedesId: previous?.id,
      items: { create: input.items.map((item) => ({ ...item })) },
    },
    include: { items: true },
  });
}
