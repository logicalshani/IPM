"use client";

import { Button } from "@shopify/polaris";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="imp-band p-6">
      <p className="text-sm font-semibold uppercase tracking-[0.12em] text-red-700">Compliance error</p>
      <h1 className="mt-2 text-2xl font-bold">Compliance console could not load</h1>
      <p className="mt-2 text-sm text-steel">{error.message}</p>
      <div className="mt-4">
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
