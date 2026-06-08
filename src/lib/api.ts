import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init);
}

export function apiError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Invalid request", issues: error.flatten() }, { status: 422 });
  }

  const message = error instanceof Error ? error.message : "Unexpected error";
  const status = message.includes("not enabled") ? 403 : 500;
  return NextResponse.json({ error: message }, { status });
}
