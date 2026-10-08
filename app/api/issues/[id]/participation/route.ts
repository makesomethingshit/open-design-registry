import { deleteDesignRequestParticipation, postDesignRequestParticipation } from "@/src/lib/design-request-participation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return postDesignRequestParticipation(request, await params);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return deleteDesignRequestParticipation(request, await params);
}
