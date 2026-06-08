"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Button, Select } from "@shopify/polaris";

type ScanRecord = { mode: string; value: string; scannedAt: string };

export function MobileScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mode, setMode] = useState("stocktake");
  const [active, setActive] = useState(false);
  const [scans, setScans] = useState<ScanRecord[]>([]);

  useEffect(() => {
    if (!active || !videoRef.current) return;

    const reader = new BrowserMultiFormatReader();
    let disposed = false;
    let controls: { stop: () => void } | undefined;
    reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
      if (!result || disposed) return;
      const record = { mode, value: result.getText(), scannedAt: new Date().toISOString() };
      setScans((current) => [record, ...current]);
      navigator.vibrate?.(80);
      localStorage.setItem("imp-offline-scans", JSON.stringify([record, ...scans]));
    }).then((scannerControls) => {
      controls = scannerControls;
    }).catch(() => setActive(false));

    return () => {
      disposed = true;
      controls?.stop();
    };
  }, [active, mode, scans]);

  return (
    <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="imp-band p-4">
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Select
            label="Workflow"
            value={mode}
            onChange={setMode}
            options={[
              { label: "Stocktake via scan", value: "stocktake" },
              { label: "Receiving via scan", value: "receiving" },
              { label: "Transfer verification", value: "transfer" }
            ]}
          />
          <Button variant={active ? undefined : "primary"} onClick={() => setActive((value) => !value)}>
            {active ? "Stop" : "Start"}
          </Button>
        </div>
        <video ref={videoRef} className="aspect-video w-full rounded-lg bg-black object-cover" muted playsInline />
      </div>
      <div className="imp-band p-4">
        <h2 className="font-semibold">Offline queue</h2>
        <div className="mt-4 space-y-3">
          {scans.length === 0 ? (
            <p className="text-sm text-steel">Scans will appear here and sync when the device reconnects.</p>
          ) : (
            scans.map((scan) => (
              <div className="rounded border border-gray-200 p-3" key={`${scan.value}-${scan.scannedAt}`}>
                <p className="font-mono text-sm">{scan.value}</p>
                <p className="text-xs text-steel">{scan.mode} at {new Date(scan.scannedAt).toLocaleTimeString()}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
