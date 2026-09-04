import type { Prisma } from "@prisma/client";
import { publicAssetUrl } from "./storage";

type RevisionWithPreviews = Prisma.RevisionGetPayload<{ include: { previews: true } }>;
type PublicRevision = Omit<RevisionWithPreviews, "sourceKey" | "isPublished" | "previews"> & {
  previews: Array<Omit<RevisionWithPreviews["previews"][number], "url"> & { url: string }>;
};

export function toPublicRevision(revision: RevisionWithPreviews): PublicRevision {
  const { sourceKey, isPublished: _isPublished, previews, ...publicRevision } = revision;
  return {
    ...publicRevision,
    sourceUrl: revision.sourceUrl ?? (sourceKey ? publicAssetUrl(sourceKey) : null),
    previews: previews.map((preview) => ({ ...preview, url: publicAssetUrl(preview.url) })),
  };
}
