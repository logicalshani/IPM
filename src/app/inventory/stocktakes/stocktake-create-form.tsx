"use client";

import { useState } from "react";
import { Button, Modal, Select, TextField } from "@shopify/polaris";
import { Plus } from "lucide-react";

export function StocktakeCreateForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [mode, setMode] = useState("FULL");

  async function submit() {
    await fetch("/api/stocktakes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopId: "demo-shop", name, mode })
    });
    setOpen(false);
    window.location.reload();
  }

  return (
    <>
      <Button icon={<Plus size={16} />} variant="primary" onClick={() => setOpen(true)}>
        New count
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create stocktake"
        primaryAction={{ content: "Create", onAction: submit, disabled: name.trim().length === 0 }}
        secondaryActions={[{ content: "Cancel", onAction: () => setOpen(false) }]}
      >
        <Modal.Section>
          <div className="space-y-4">
            <TextField label="Session name" value={name} onChange={setName} autoComplete="off" />
            <Select
              label="Counting mode"
              value={mode}
              onChange={setMode}
              options={[
                { label: "Full count", value: "FULL" },
                { label: "Partial count", value: "PARTIAL" },
                { label: "Blind count", value: "BLIND" },
                { label: "Cycle count", value: "CYCLE" }
              ]}
            />
          </div>
        </Modal.Section>
      </Modal>
    </>
  );
}
