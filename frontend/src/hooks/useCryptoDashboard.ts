"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { CryptoDashboardData, CryptoAutoTraderData } from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function useCryptoDashboard(pollIntervalMs = 45_000) {
  const [data, setData] = useState<CryptoDashboardData | null>(null);
  const [autoTrader, setAutoTrader] = useState<CryptoAutoTraderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/crypto/dashboard`);
      if (!res.ok) throw new Error(`Dashboard HTTP ${res.status}`);
      const parsed: CryptoDashboardData = await res.json();
      setData(parsed);
      setLastUpdate(new Date());
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAutoTrader = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/crypto/auto-trader/status`);
      if (!res.ok) return;
      const parsed: CryptoAutoTraderData = await res.json();
      setAutoTrader(parsed);
    } catch {
      /* ignore — keep last value */
    }
  }, []);

  const refresh = useCallback(() => {
    fetchDashboard();
    fetchAutoTrader();
  }, [fetchDashboard, fetchAutoTrader]);

  useEffect(() => {
    refresh();
    timerRef.current = setInterval(refresh, pollIntervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [refresh, pollIntervalMs]);

  return { data, autoTrader, loading, error, lastUpdate, refresh };
}
