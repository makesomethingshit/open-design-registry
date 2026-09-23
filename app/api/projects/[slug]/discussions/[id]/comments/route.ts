import { postProjectDiscussionComment } from "@/src/lib/discussion-handlers";

type Context = { params: Promise<{ slug: string; id: string }> };

export async function POST(request: Request, { params }: Context) {
  return postProjectDiscussionComment(request, await params);
}
