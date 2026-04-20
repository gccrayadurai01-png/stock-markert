"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function KiteCallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState<"working" | "success" | "error">("working");
  const [message, setMessage] = useState("Exchanging Zerodha request_token…");
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    const rt = params.get("request_token");
    const action = params.get("action");

    if (!rt) {
      setStatus("error");
      setMessage("No request_token in URL. Did you log in through the Kite link?");
      return;
    }
    if (action && action !== "login") {
      setStatus("error");
      setMessage(`Kite returned action=${action}. Try the login flow again.`);
      return;
    }

    (async () => {
      try {
        const res = await fetch(`${API}/api/broker/exchange-token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ request_token: rt }),
        });
        const data = await res.json();
        if (data.status === "success") {
          setStatus("success");
          setBalance(data.balance ?? 0);
          setMessage("✅ Zerodha connected. Redirecting to Real Trading dashboard…");
          setTimeout(() => {
            router.push("/?tab=auto-trader");
          }, 1800);
        } else {
          setStatus("error");
          setMessage(data.message || "Token exchange failed.");
        }
      } catch (err) {
        setStatus("error");
        setMessage("Network error: " + String(err));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-8 text-center space-y-4 shadow-2xl">
        <div className="text-5xl">
          {status === "working" ? "🔄" : status === "success" ? "✅" : "⚠️"}
        </div>
        <h1 className="text-xl font-black">
          {status === "working"
            ? "Connecting to Zerodha"
            : status === "success"
            ? "Connected"
            : "Connection Failed"}
        </h1>
        <p className="text-sm text-muted leading-relaxed">{message}</p>

        {status === "success" && balance !== null && (
          <div className="bg-green/10 border border-green/30 rounded-xl p-3 text-sm">
            <div className="text-[10px] uppercase text-muted font-bold">Account Balance</div>
            <div className="text-lg font-black text-green">₹{balance.toLocaleString("en-IN")}</div>
          </div>
        )}

        {status === "working" && (
          <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
        )}

        {status === "error" && (
          <div className="space-y-2">
            <button
              onClick={() => router.push("/?tab=auto-trader")}
              className="w-full px-4 py-2.5 rounded-lg bg-accent text-white font-black text-xs"
            >
              Back to Real Trading
            </button>
            <p className="text-[10px] text-muted">
              Request tokens are single-use and expire in minutes. Generate a fresh one via the Kite login link and try again.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function KiteCallback() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <KiteCallbackInner />
    </Suspense>
  );
}
