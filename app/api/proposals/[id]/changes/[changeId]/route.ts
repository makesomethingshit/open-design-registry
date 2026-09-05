import { reviewProposalChange } from "@/src/lib/proposal-handlers";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; changeId: string }> }) {
  return reviewProposalChange(request, await params);
}
