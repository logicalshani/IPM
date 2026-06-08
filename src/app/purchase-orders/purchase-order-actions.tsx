"use client";

import { useState } from "react";
import { Button } from "@shopify/polaris";

export function PurchaseOrderActions() {
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    await fetch("/api/purchase-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "generate_auto_drafts", shopId: "demo-shop" })
    });
    setLoading(false);
    window.location.reload();
  }

  async function enqueue() {
    setLoading(true);
    await fetch("/api/purchase-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "enqueue_auto_drafts", shopId: "demo-shop" })
    });
    setLoading(false);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="primary" loading={loading} onClick={generate}>
        Generate drafts
      </Button>
      <Button loading={loading} onClick={enqueue}>
        Queue nightly job
      </Button>
    </div>
  );
}
