import { createProjectProposal, listProjectProposals } from "@/src/lib/proposal-handlers";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return listProjectProposals(request, await params);
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return createProjectProposal(request, await params);
}
