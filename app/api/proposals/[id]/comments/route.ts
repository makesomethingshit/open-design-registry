import { postProposalComment } from "@/src/lib/proposal-handlers";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return postProposalComment(request, await params);
}
