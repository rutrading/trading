"use client";

import { useEffect, useState } from "react";

/**
 * Returns true after the component has mounted on the client. Useful for
 * gating UI that depends on browser APIs or for avoiding SSR/CSR hydration
 * mismatches. Pattern:
 *
 *   const mounted = useIsMounted();
 *   if (!mounted) return null;
 */
export function useIsMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}
