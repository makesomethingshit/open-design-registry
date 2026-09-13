import { postIssueComment } from "@/src/lib/issue-handlers";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return postIssueComment(request, await params);
}
