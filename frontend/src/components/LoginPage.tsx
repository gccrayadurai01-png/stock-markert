'use client';

import { useState } from 'react';
import { Mail, TrendingUp } from 'lucide-react';

interface LoginPageProps {
  onLoginSuccess: (email: string) => void;
}

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleEmailLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      // Demo: just log in with email
      onLoginSuccess(email);
      localStorage.setItem('user_email', email);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <TrendingUp className="w-8 h-8 text-green-400" />
            <h1 className="text-3xl font-black text-white">TRADING BRAIN</h1>
          </div>
          <p className="text-gray-400 text-sm">AI-Powered Trading Command Center with Legendary Investor Perspectives</p>
        </div>

        {/* Card */}
        <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-8 space-y-6">
          {/* Email Login */}
          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-5 h-5 text-gray-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-500 focus:border-green-500 focus:outline-none transition"
                  required
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={!email || loading}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Logging in...' : 'Continue with Email'}
            </button>
          </form>

          {/* Features */}
          <div className="space-y-3 pt-4 border-t border-slate-700">
            <div className="flex items-start gap-3 text-sm">
              <span className="text-green-400 font-bold">✅</span>
              <span className="text-gray-400">AI signals from Claude + 12 technical indicators</span>
            </div>
            <div className="flex items-start gap-3 text-sm">
              <span className="text-green-400 font-bold">✅</span>
              <span className="text-gray-400">5 legendary investor perspectives on every stock</span>
            </div>
            <div className="flex items-start gap-3 text-sm">
              <span className="text-green-400 font-bold">✅</span>
              <span className="text-gray-400">Real-time P&L tracking & goal calculator</span>
            </div>
            <div className="flex items-start gap-3 text-sm">
              <span className="text-green-400 font-bold">✅</span>
              <span className="text-gray-400">News-driven trade suggestions</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-500 mt-6">
          For educational purposes only. Not financial advice.
        </p>
      </div>
    </div>
  );
}
