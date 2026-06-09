"use client";

import { useState } from "react";
import { PlugZap } from "lucide-react";

export function ShopifyInstallForm() {
  const [shop, setShop] = useState("");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = shop.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!normalized) return;
    window.location.href = `/api/auth/shopify?shop=${encodeURIComponent(normalized)}`;
  }

  return (
    <form className="rounded-md border border-emerald-200 bg-emerald-50 p-3" onSubmit={submit}>
      <div className="flex items-center gap-2">
        <PlugZap className="text-emerald-700" size={20} aria-hidden />
        <p className="font-semibold text-emerald-950">Install Shopify app</p>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          className="min-h-12 flex-1 rounded-md border border-emerald-200 bg-white px-3 text-sm outline-none focus:border-emerald-600"
          inputMode="url"
          onChange={(event) => setShop(event.target.value)}
          placeholder="your-store.myshopify.com"
          value={shop}
        />
        <button className="min-h-12 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white" type="submit">
          Connect
        </button>
      </div>
    </form>
  );
}
