"use client";

import { useEffect, useRef, useState } from "react";
import type { StrategySnapshot } from "@/app/actions/strategies";

export type StrategyStreamStatus = "connecting" | "live" | "offline";

export function useStrategyStream(
  tradingAccountId: number | null,
  onSnapshot: (snapshot: StrategySnapshot) => void,
) {
  const onSnapshotRef = useRef(onSnapshot);
  const [status, setStatus] = useState<StrategyStreamStatus>("offline");

  useEffect(() => {
    onSnapshotRef.current = onSnapshot;
  }, [onSnapshot]);

  useEffect(() => {
    if (!tradingAccountId) {
      return;
    }
    const source = new EventSource(
      `/api/strategy-stream?trading_account_id=${tradingAccountId}`,
    );

    source.onopen = () => {
      setStatus("connecting");
    };

    const handleSnapshot = (event: MessageEvent<string>) => {
      try {
        onSnapshotRef.current(JSON.parse(event.data) as StrategySnapshot);
        setStatus("live");
      } catch {
        setStatus("offline");
      }
    };

    const handleError = () => {
      setStatus("offline");
    };

    source.addEventListener("snapshot", handleSnapshot as EventListener);
    source.onerror = handleError;

    return () => {
      source.removeEventListener("snapshot", handleSnapshot as EventListener);
      source.close();
    };
  }, [tradingAccountId]);

  return tradingAccountId ? status : "offline";
}
