"use client";

import { Button } from "@shopify/polaris";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <section className="imp-band p-6">
      <h2 className="text-lg font-semibold">Invoice parser could not load</h2>
      <p className="mt-2 text-sm text-steel">{error.message}</p>
      <div className="mt-4"><Button onClick={reset}>Try again</Button></div>
    </section>
  );
}
