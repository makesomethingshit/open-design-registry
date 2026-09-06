export type DesignPreviewAsset = {
  id: string;
  position: number;
  url: string;
  mimeType: string;
  altText: string;
};

export type ReviewRevision = {
  id: string;
  number: number;
  title: string;
  previews: DesignPreviewAsset[];
};

export type ReviewHistoryEntry = {
  id: string;
  status: string;
  eventType: "REVIEW" | "INVALIDATED_UPSTREAM" | "PARTIAL_APPLICATION_RESET";
  comment: string | null;
  reason: string | null;
  createdAt: Date | string;
  author: { name: string } | null;
  checkedLatestRevisionId: string | null;
  causedByRevision: { id: string; number: number } | null;
};

export type ReviewChange = {
  id: string;
  type: string;
  action: string;
  target: string;
  targetFileId: string | null;
  name: string | null;
  newName: string | null;
  kind: string | null;
  mimeType: string | null;
  size: number | null;
  reviewStatus: "PENDING" | "APPROVED" | "CHANGES_REQUESTED";
  reviewComment: string | null;
  reviewedBy: { name: string } | null;
  appliedRevision: { id: string; number: number; title: string } | null;
  latestAvailable: boolean;
  latestName: string | null;
  conflictStatus: "NO_CONFLICT" | "CONFLICT" | "CHECK_UNAVAILABLE" | null;
  conflictReason: string | null;
  checkedLatestRevisionId: string;
  reviewHistory: ReviewHistoryEntry[];
  sourcePreviews: DesignPreviewAsset[];
  basePreviews: DesignPreviewAsset[];
  latestPreviews: DesignPreviewAsset[];
};

export type ReviewComment = {
  id: string;
  body: string;
  author: { name: string };
  createdAt: Date | string;
};
