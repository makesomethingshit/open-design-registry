import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { getSession } from "@/src/lib/session";
import { putObject } from "@/src/lib/storage";
import { maxImageBytes } from "@/src/lib/project-validation";
import { maxImageFormBytes, readBoundedFormData } from "@/src/lib/request-body";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  const { slug } = await params;
  const project = await prisma.project.findUnique({ where: { slug }, select: { id: true, ownerId: true } });
  if (!project || project.ownerId !== session.user.id) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (Number(request.headers.get("content-length")) > maxImageBytes + 65536) {
    return NextResponse.json({ error: "Choose a PNG or JPG image up to 10MB." }, { status: 400 });
  }
  const body = await readBoundedFormData(request, maxImageFormBytes);
  if (body.tooLarge) return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
  const form = body.form;
  const file = form?.get("image");
  if (!(file instanceof File) || !file.size || file.size > maxImageBytes || !["image/png", "image/jpeg"].includes(file.type)) {
    return NextResponse.json({ error: "Choose a PNG or JPG image up to 10MB." }, { status: 400 });
  }
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const valid = file.type === "image/png"
    ? [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!valid) return NextResponse.json({ error: "The file is not a valid PNG or JPG image." }, { status: 400 });
  const key = `project-documents/${project.id}/${randomUUID()}.${file.type === "image/png" ? "png" : "jpg"}`;
  try {
    const url = await putObject(file, key);
    return NextResponse.json({ url, name: file.name }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not upload the image. Try again." }, { status: 500 });
  }
}
