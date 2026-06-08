"use client";

import Image from "next/image";
import { useState } from "react";
import { Button, Select, TextField } from "@shopify/polaris";

export function BarcodeGeneratorForm() {
  const [format, setFormat] = useState("CODE_128");
  const [value, setValue] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    const response = await fetch("/api/barcodes/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopId: "demo-shop", value, format })
    });
    const payload = await response.json();
    setImage(payload.data?.imageData ?? null);
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      <Select
        label="Format"
        value={format}
        onChange={setFormat}
        options={[
          { label: "Code-128", value: "CODE_128" },
          { label: "EAN-13", value: "EAN_13" },
          { label: "QR Code", value: "QR_CODE" },
          { label: "DataMatrix", value: "DATA_MATRIX" }
        ]}
      />
      <TextField label="Value" value={value} onChange={setValue} autoComplete="off" />
      <Button variant="primary" onClick={generate} loading={loading} disabled={!value.trim()}>
        Generate
      </Button>
      {image && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <Image alt="Generated barcode" className="max-h-48 w-auto" height={180} src={image} unoptimized width={320} />
        </div>
      )}
    </div>
  );
}
