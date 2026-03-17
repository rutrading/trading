"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { SymbolSearch, type SymbolItem } from "@/components/symbol-search";

export function SearchBar() {
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Ctrl+K focuses the search input
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        const input = wrapperRef.current?.querySelector("input");
        input?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function handleSelect(item: SymbolItem) {
    router.push(`/stocks/${item.ticker}`);
    // blur the input after navigation
    const input = wrapperRef.current?.querySelector("input");
    input?.blur();
  }

  return (
    <div ref={wrapperRef} className="w-full max-w-sm">
      <SymbolSearch
        placeholder="Search symbols... (Ctrl+K)"
        onSelect={handleSelect}
      />
    </div>
  );
}
