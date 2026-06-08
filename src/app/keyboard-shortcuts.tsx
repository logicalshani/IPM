"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const shortcuts: Record<string, string> = {
  d: "/dashboard/executive",
  p: "/inventory/analytics",
  o: "/purchase-orders",
  s: "/suppliers",
  r: "/reports",
  f: "/financial",
  c: "/compliance"
};

export function KeyboardShortcuts() {
  const router = useRouter();
  const armed = useRef(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const key = event.key.toLowerCase();
      if (key === "g") {
        armed.current = true;
        window.setTimeout(() => {
          armed.current = false;
        }, 1200);
        return;
      }
      if (!armed.current) return;
      const href = shortcuts[key];
      if (!href) return;
      event.preventDefault();
      armed.current = false;
      router.push(href);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  return null;
}
