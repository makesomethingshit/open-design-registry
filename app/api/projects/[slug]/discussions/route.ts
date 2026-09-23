import { getProjectDiscussions, postProjectDiscussion } from "@/src/lib/discussion-handlers";

type Context = { params: Promise<{ slug: string }> };

export async function GET(request: Request, { params }: Context) {
  return getProjectDiscussions(request, await params);
}

export async function POST(request: Request, { params }: Context) {
  return postProjectDiscussion(request, await params);
}
