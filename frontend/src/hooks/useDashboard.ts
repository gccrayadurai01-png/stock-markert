"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { DashboardData } from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws";

export function useDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        setConnected(true);
        setLoading(false);
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          setData(parsed);
          setLastUpdate(new Date());
          setLoading(false);
        } catch {
          /* ignore */
        }
      };

      ws.onclose = () => {
        setConnected(false);
        reconnectTimer.current = setTimeout(connect, 5000);
      };

      ws.onerror = () => { ws.close(); };

      wsRef.current = ws;
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/api/dashboard`)
      .then((r) => r.json())
      .then((d) => {
        if (d.timestamp) { setData(d); setLastUpdate(new Date()); }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    connect();
    return () => { clearTimeout(reconnectTimer.current); wsRef.current?.close(); };
  }, [connect]);

  const refresh = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "refresh" }));
    } else {
      fetch(`${API_BASE}/api/refresh`, { method: "POST" });
    }
  }, []);

  const updateConfig = useCallback((config: Record<string, number | string>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "config", data: config }));
    }
    fetch(`${API_BASE}/api/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
  }, []);

  return { data, loading, connected, lastUpdate, refresh, updateConfig };
}
