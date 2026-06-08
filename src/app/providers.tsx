"use client";

import { AppProvider } from "@shopify/polaris";
import en from "@shopify/polaris/locales/en.json";
import { useEffect } from "react";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  return <AppProvider i18n={en}>{children}</AppProvider>;
}
