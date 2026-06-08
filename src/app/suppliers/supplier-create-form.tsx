"use client";

import { useState } from "react";
import { Button, Modal, TextField } from "@shopify/polaris";
import { Plus } from "lucide-react";

export function SupplierCreateForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  async function submit() {
    await fetch("/api/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopId: "demo-shop", name, email: email || undefined })
    });
    setOpen(false);
    window.location.reload();
  }

  return (
    <>
      <Button icon={<Plus size={16} />} variant="primary" onClick={() => setOpen(true)}>
        Add supplier
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add supplier"
        primaryAction={{ content: "Save", onAction: submit, disabled: name.trim().length === 0 }}
        secondaryActions={[{ content: "Cancel", onAction: () => setOpen(false) }]}
      >
        <Modal.Section>
          <div className="space-y-4">
            <TextField label="Supplier name" value={name} onChange={setName} autoComplete="organization" />
            <TextField label="Email" value={email} onChange={setEmail} autoComplete="email" />
          </div>
        </Modal.Section>
      </Modal>
    </>
  );
}
