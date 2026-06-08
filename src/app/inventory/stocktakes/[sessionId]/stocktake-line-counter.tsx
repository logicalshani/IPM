"use client";

import { useState, useTransition } from "react";
import { Button, TextField } from "@shopify/polaris";

export function StocktakeLineCounter({
  sessionId,
  productId,
  defaultValue
}: {
  sessionId: string;
  productId: string;
  defaultValue: number;
}) {
  const [value, setValue] = useState(String(defaultValue));
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      await fetch(`/api/stocktakes/${sessionId}/lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId: "demo-shop",
          productId,
          countedQuantity: Number(value),
          countSource: "manual"
        })
      });
      window.location.reload();
    });
  }

  return (
    <div className="flex min-w-40 items-end gap-2">
      <TextField label="Count" labelHidden type="number" value={value} onChange={setValue} autoComplete="off" />
      <Button loading={pending} onClick={save}>
        Save
      </Button>
    </div>
  );
}
