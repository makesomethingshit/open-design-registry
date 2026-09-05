import { applyProposal } from "@/src/lib/proposal-handlers";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return applyProposal(request, await params);
}
