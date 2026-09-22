import type { Prisma } from "@prisma/client";
import { publicAssetUrl } from "./storage";

type RevisionWithPreviews = Omit<Prisma.RevisionGetPayload<{ include: { previews: true } }>, "tool" | "toolVersion" | "tags" | "sourceChecksum" | "sourceProposalId" | "publishedById" | "capabilityMode" | "capabilityUnitCount" | "adapterId" | "adapterVersion" | "adapterConfidence" | "adapterMaturity"> & {
  tool?: string | null;
  toolVersion?: string | null;
  tags?: string[];
  sourceChecksum?: string | null;
  sourceProposalId?: string | null;
  publishedById?: string | null;
  capabilityMode?: "STRUCTURED" | "WHOLE_DOCUMENT" | null;
  capabilityUnitCount?: number | null;
  adapterId?: string | null;
  adapterVersion?: string | null;
  adapterConfidence?: "HIGH" | "MEDIUM" | "LOW" | "NOT_ASSESSED" | null;
  adapterMaturity?: string | null;
};
type PublicRevision = Omit<RevisionWithPreviews, "sourceKey" | "isPublished" | "previews"> & {
  previews: Array<Omit<RevisionWithPreviews["previews"][number], "url"> & { url: string }>;
};

export function toPublicRevision(revision: RevisionWithPreviews): PublicRevision {
  const { sourceKey, isPublished: _isPublished, sourceProposalId: _sourceProposalId, publishedById: _publishedById, previews, ...publicRevision } = revision;
  return {
    ...publicRevision,
    sourceUrl: revision.sourceUrl ?? (sourceKey ? publicAssetUrl(sourceKey) : null),
    previews: previews.map((preview) => ({ ...preview, url: publicAssetUrl(preview.url) })),
  };
}
