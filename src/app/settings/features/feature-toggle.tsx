"use client";

import { useState } from "react";
import { Button } from "@shopify/polaris";

export function FeatureToggle({ featureKey, status }: { featureKey: string; status: string }) {
  const [current, setCurrent] = useState(status);

  async function toggle() {
    const next = current === "ENABLED" ? "DISABLED" : "ENABLED";
    await fetch("/api/features", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopId: "demo-shop", key: featureKey, plan: "growth", status: next })
    });
    setCurrent(next);
  }

  return (
    <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 className="font-semibold">{featureKey}</h2>
        <p className="text-sm text-steel">{current === "ENABLED" ? "Available to this billing plan." : "Hidden and API-gated."}</p>
      </div>
      <Button onClick={toggle}>{current === "ENABLED" ? "Disable" : "Enable"}</Button>
    </div>
  );
}
