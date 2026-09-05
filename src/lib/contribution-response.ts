import { NextResponse } from "next/server";
import { ContributionError } from "./contributions";

export function failure(cause: unknown) {
  if (cause instanceof ContributionError) return NextResponse.json({ error: cause.message }, { status: cause.status });
  console.error("contribution operation failed", cause);
  return NextResponse.json({ error: "The operation could not be completed" }, { status: 500 });
}
