"use client";

import { useState, useEffect } from "react";
import { AlertCircle, CheckCircle } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface BrokerStatus {
  status: string;
  connected: boolean;
  real_trading_enabled: boolean;
  balance: number;
  mode: string;
}

export default function RealTradingToggle() {
  const [brokerStatus, setBrokerStatus] = useState<BrokerStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);

  // Fetch broker status on mount
  useEffect(() => {
    fetchBrokerStatus();
    const interval = setInterval(fetchBrokerStatus, 5000); // Update every 5 seconds
    return () => clearInterval(interval);
  }, []);

  async function fetchBrokerStatus() {
    try {
      const res = await fetch(`${API}/api/broker/status`);
      const data = await res.json();
      setBrokerStatus(data);
    } catch (err) {
      console.error("Failed to fetch broker status:", err);
    }
  }

  async function testConnection() {
    setTestingConnection(true);
    try {
      const res = await fetch(`${API}/api/broker/test-connection`);
      const data = await res.json();
      if (data.connected) {
        alert("✅ Successfully connected to Zerodha!");
        fetchBrokerStatus();
      } else {
        alert("❌ Failed to connect to Zerodha. Check your credentials in .env");
      }
    } catch (err) {
      alert("❌ Error testing connection: " + String(err));
    }
    setTestingConnection(false);
  }

  async function toggleRealTrading() {
    if (!brokerStatus?.connected) {
      alert("⚠️ Cannot enable real trading - broker not connected");
      return;
    }

    const shouldEnable = !brokerStatus.real_trading_enabled;

    if (shouldEnable) {
      const confirmed = window.confirm(
        "⚠️ ENABLE REAL TRADING?\n\n" +
          "This will place ACTUAL trades with REAL MONEY.\n" +
          "Your Zerodha account will execute all signals.\n\n" +
          "Click OK only if you are absolutely sure."
      );
      if (!confirmed) return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API}/api/broker/toggle-real-trading?enable=${shouldEnable}`, {
        method: "POST",
      });
      const data = await res.json();
      console.log(data);
      fetchBrokerStatus();

      if (shouldEnable) {
        alert("🔴 REAL TRADING ENABLED - All signals will execute live trades");
      } else {
        alert("🟢 TEST MODE ENABLED - Signals will not execute");
      }
    } catch (err) {
      alert("Error toggling real trading: " + String(err));
    }
    setLoading(false);
  }

  if (!brokerStatus) {
    return (
      <div className="p-4 bg-card border border-border rounded-lg">
        <div className="text-sm text-muted">Loading broker status...</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Status Card */}
      <div
        className={`p-4 rounded-lg border transition-all ${
          brokerStatus.connected
            ? brokerStatus.real_trading_enabled
              ? "bg-red-500/10 border-red-500/30"
              : "bg-green-500/10 border-green-500/30"
            : "bg-yellow-500/10 border-yellow-500/30"
        }`}
      >
        <div className="flex items-center gap-2 mb-2">
          {brokerStatus.connected ? (
            <CheckCircle className="w-5 h-5 text-green-400" />
          ) : (
            <AlertCircle className="w-5 h-5 text-yellow-400" />
          )}
          <span className="font-semibold text-sm">
            {brokerStatus.connected ? "Zerodha Connected ✅" : "Zerodha Disconnected ⚠️"}
          </span>
        </div>

        {brokerStatus.connected && (
          <div className="space-y-1 text-xs text-muted mb-3">
            <div>
              Account Balance: <span className="text-foreground font-mono">₹{brokerStatus.balance?.toFixed(2)}</span>
            </div>
            <div>
              Mode:{" "}
              <span
                className={`font-semibold ${
                  brokerStatus.real_trading_enabled ? "text-red-400" : "text-green-400"
                }`}
              >
                {brokerStatus.real_trading_enabled ? "🔴 LIVE TRADING" : "🟢 TEST MODE"}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Buttons */}
      <div className="grid grid-cols-2 gap-2">
        {!brokerStatus.connected && (
          <button
            onClick={testConnection}
            disabled={testingConnection}
            className="px-3 py-2 text-xs font-semibold rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 transition disabled:opacity-50"
          >
            {testingConnection ? "Testing..." : "Connect"}
          </button>
        )}

        {brokerStatus.connected && (
          <button
            onClick={toggleRealTrading}
            disabled={loading}
            className={`px-3 py-2 text-xs font-semibold rounded-lg transition ${
              brokerStatus.real_trading_enabled
                ? "bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30"
                : "bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/30"
            } disabled:opacity-50`}
          >
            {loading ? "Updating..." : brokerStatus.real_trading_enabled ? "Disable Trading" : "Enable Trading"}
          </button>
        )}

        <button
          onClick={fetchBrokerStatus}
          className="px-3 py-2 text-xs font-semibold rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 transition"
        >
          Refresh
        </button>
      </div>

      {brokerStatus.connected && (
        <div className="text-[10px] text-muted bg-black/20 rounded p-2">
          {brokerStatus.real_trading_enabled
            ? "⚠️ Real trading is ENABLED. All signals will execute live trades with real money."
            : "✅ Test mode is active. Signals are generated but no trades are executed."}
        </div>
      )}
    </div>
  );
}
