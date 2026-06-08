"use client";

import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import { Button, TextField } from "@shopify/polaris";

const initialFields = [
  { id: "sku", label: "SKU", x: 16, y: 16 },
  { id: "name", label: "Name", x: 16, y: 48 },
  { id: "barcode", label: "Barcode", x: 16, y: 84 },
  { id: "price", label: "Price", x: 180, y: 16 },
  { id: "location", label: "Location", x: 180, y: 48 },
  { id: "expiry", label: "Expiry", x: 180, y: 84 }
];

export function LabelDesigner() {
  const [name, setName] = useState("Retail shelf label");
  const [fields, setFields] = useState(initialFields);

  function onDragEnd(event: DragEndEvent) {
    setFields((current) =>
      current.map((field) =>
        field.id === event.active.id
          ? { ...field, x: Math.max(0, field.x + event.delta.x), y: Math.max(0, field.y + event.delta.y) }
          : field
      )
    );
  }

  async function save() {
    await fetch("/api/barcodes/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopId: "demo-shop", name, widthMm: 90, heightMm: 45, fields })
    });
  }

  return (
    <div className="space-y-4">
      <TextField label="Template name" value={name} onChange={setName} autoComplete="off" />
      <DndContext onDragEnd={onDragEnd}>
        <div className="relative h-64 overflow-hidden rounded-lg border border-dashed border-gray-300 bg-white">
          {fields.map((field) => (
            <DraggableField field={field} key={field.id} />
          ))}
        </div>
      </DndContext>
      <div className="flex flex-wrap gap-2">
        <Button onClick={save}>Save template</Button>
        <Button onClick={() => window.print()}>Print</Button>
      </div>
    </div>
  );
}

function DraggableField({ field }: { field: { id: string; label: string; x: number; y: number } }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: field.id });
  const style = {
    left: field.x + (transform?.x ?? 0),
    top: field.y + (transform?.y ?? 0)
  };

  return (
    <button
      ref={setNodeRef}
      style={style}
      className="absolute rounded border border-gray-300 bg-gray-50 px-2 py-1 text-xs font-semibold text-ink shadow-sm"
      {...listeners}
      {...attributes}
    >
      {field.label}
    </button>
  );
}
