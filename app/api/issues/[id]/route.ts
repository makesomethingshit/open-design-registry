import { getIssue, patchIssue } from "@/src/lib/issue-handlers";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return getIssue(request, await params);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return patchIssue(request, await params);
}
