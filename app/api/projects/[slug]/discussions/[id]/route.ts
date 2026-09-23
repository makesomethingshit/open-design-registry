import { getProjectDiscussion } from "@/src/lib/discussion-handlers";

type Context = { params: Promise<{ slug: string; id: string }> };

export async function GET(request: Request, { params }: Context) {
  return getProjectDiscussion(request, await params);
}
