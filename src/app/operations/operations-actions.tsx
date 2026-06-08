"use client";

import { useState } from "react";
import { Button } from "@shopify/polaris";

export function OperationsActions({ sampleProductId }: { sampleProductId?: string }) {
  const [loading, setLoading] = useState(false);

  async function suggestTransfers() {
    setLoading(true);
    await fetch("/api/operations/transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "suggest", shopId: "demo-shop" })
    });
    setLoading(false);
    window.location.reload();
  }

  async function recordSnapshot() {
    setLoading(true);
    await fetch("/api/operations/3pl", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "snapshot",
        shopId: "demo-shop",
        productId: sampleProductId,
        provider: "AMAZON_FBA",
        locationName: "Amazon FBA East",
        externalSku: "TEE-114-FBA",
        threePLQuantity: 88,
        shopifyQuantity: 82,
        fbaFee: 1.75
      })
    });
    setLoading(false);
    window.location.reload();
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="primary" loading={loading} onClick={suggestTransfers}>
        Generate transfers
      </Button>
      <Button loading={loading} disabled={!sampleProductId} onClick={recordSnapshot}>
        Sync 3PL sample
      </Button>
    </div>
  );
}
