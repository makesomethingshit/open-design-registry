import { createProjectRelease } from "@/src/lib/release-handlers";

type Context = { params: Promise<{ slug: string }> };

export async function POST(request: Request, { params }: Context) {
  return createProjectRelease(request, await params);
}
