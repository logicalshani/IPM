"use client";

import { RouteError } from "@/components/RouteError";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return <RouteError title="Stocky migration could not load" error={error} reset={reset} />;
}
