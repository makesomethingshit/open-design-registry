import { closeProposal, getProposal } from "@/src/lib/proposal-handlers";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return getProposal(request, await params);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return closeProposal(request, await params);
}
