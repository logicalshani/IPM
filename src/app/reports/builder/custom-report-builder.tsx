"use client";

import { useMemo, useState } from "react";
import { Button, Select, TextField } from "@shopify/polaris";

const dimensions = ["SKU", "Supplier", "Location", "Category", "Status"];
const metrics = ["Units", "Value", "Velocity", "Margin", "Days remaining", "Capital locked"];

export function CustomReportBuilder() {
  const [name, setName] = useState("Weekly owner report");
  const [selectedDimensions, setSelectedDimensions] = useState(["SKU", "Supplier"]);
  const [selectedMetrics, setSelectedMetrics] = useState(["Value", "Velocity"]);
  const [visualization, setVisualization] = useState("TABLE");
  const [email, setEmail] = useState("owner@example.com");
  const [status, setStatus] = useState("");
  const [dragged, setDragged] = useState<string | null>(null);

  const chosenFields = useMemo(() => [...selectedDimensions, ...selectedMetrics], [selectedDimensions, selectedMetrics]);

  function toggle(value: string, list: string[], setter: (next: string[]) => void) {
    setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  }

  function dropField() {
    if (!dragged) return;
    if (dimensions.includes(dragged) && !selectedDimensions.includes(dragged)) setSelectedDimensions([...selectedDimensions, dragged]);
    if (metrics.includes(dragged) && !selectedMetrics.includes(dragged)) setSelectedMetrics([...selectedMetrics, dragged]);
    setDragged(null);
  }

  async function saveReport() {
    setStatus("Saving");
    const response = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save_custom",
        shopId: "demo-shop",
        name,
        dimensions: selectedDimensions,
        metrics: selectedMetrics,
        visualization
      })
    });
    setStatus(response.ok ? "Saved" : "Save failed");
  }

  async function schedule() {
    setStatus("Scheduling");
    const response = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "schedule",
        shopId: "demo-shop",
        reportKey: "inventory-valuation",
        recipientEmail: email,
        frequency: "WEEKLY",
        dayOfWeek: 1
      })
    });
    setStatus(response.ok ? "Scheduled" : "Schedule failed");
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
      <section className="imp-band p-4">
        <h2 className="font-semibold">Field selector</h2>
        <p className="mt-1 text-sm text-steel">Drag fields into the report canvas or use the checkboxes.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-steel">Dimensions</p>
            <div className="mt-2 space-y-2">
              {dimensions.map((dimension) => (
                <label className="flex cursor-grab items-center gap-2 rounded-md border border-gray-200 p-2 text-sm" draggable onDragStart={() => setDragged(dimension)} key={dimension}>
                  <input checked={selectedDimensions.includes(dimension)} type="checkbox" onChange={() => toggle(dimension, selectedDimensions, setSelectedDimensions)} />
                  {dimension}
                </label>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-steel">Metrics</p>
            <div className="mt-2 space-y-2">
              {metrics.map((metric) => (
                <label className="flex cursor-grab items-center gap-2 rounded-md border border-gray-200 p-2 text-sm" draggable onDragStart={() => setDragged(metric)} key={metric}>
                  <input checked={selectedMetrics.includes(metric)} type="checkbox" onChange={() => toggle(metric, selectedMetrics, setSelectedMetrics)} />
                  {metric}
                </label>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="imp-band p-4">
        <h2 className="font-semibold">Report canvas</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <TextField label="Report name" value={name} onChange={setName} autoComplete="off" />
          <Select
            label="Visualization"
            value={visualization}
            onChange={setVisualization}
            options={[
              { label: "Table", value: "TABLE" },
              { label: "Bar chart", value: "BAR" },
              { label: "Line chart", value: "LINE" },
              { label: "Pie chart", value: "PIE" }
            ]}
          />
        </div>

        <div className="mt-4 min-h-32 rounded-md border border-dashed border-emerald-700 bg-emerald-50 p-4" onDragOver={(event) => event.preventDefault()} onDrop={dropField}>
          <p className="text-sm font-semibold text-emerald-900">Selected fields</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {chosenFields.map((field) => <span className="rounded-md bg-white px-3 py-1 text-sm font-medium text-ink" key={field}>{field}</span>)}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <TextField label="Date range" value="Last 30 days" onChange={() => undefined} autoComplete="off" />
          <TextField label="Location filter" value="All locations" onChange={() => undefined} autoComplete="off" />
          <TextField label="Supplier filter" value="All suppliers" onChange={() => undefined} autoComplete="off" />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
          <TextField label="Schedule email" value={email} onChange={setEmail} autoComplete="email" />
          <Button variant="primary" onClick={saveReport}>Save report</Button>
          <Button onClick={schedule}>Schedule weekly</Button>
        </div>
        {status && <p className="mt-3 text-sm font-semibold text-emerald-700">{status}</p>}
      </section>
    </div>
  );
}
