'use client';

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface InvestorPerspective {
  investor: string;
  signal: string;
  confidence: number;
  reasoning: string;
  style: string;
}

interface InvestorSwitcherProps {
  perspectives: InvestorPerspective[];
  consensus?: {
    key_insight: string;
    bullish_count: number;
    bearish_count: number;
    neutral_count: number;
  };
}

export default function InvestorSwitcher({ perspectives, consensus }: InvestorSwitcherProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showConsensus, setShowConsensus] = useState(true);

  if (!perspectives || perspectives.length === 0) {
    return null;
  }

  const selected = perspectives[selectedIndex];

  const getSignalColor = (signal: string) => {
    if (signal.includes('BUY')) return 'text-green-400';
    if (signal.includes('SELL')) return 'text-red-400';
    return 'text-yellow-400';
  };

  const getSignalBg = (signal: string) => {
    if (signal.includes('BUY')) return 'bg-green-900/20 border-green-500';
    if (signal.includes('SELL')) return 'bg-red-900/20 border-red-500';
    return 'bg-yellow-900/20 border-yellow-500';
  };

  const getSignalEmoji = (signal: string) => {
    if (signal.includes('BUY')) return '✅';
    if (signal.includes('SELL')) return '🔴';
    return '➡️';
  };

  return (
    <div className="space-y-4 mt-4">
      {/* Investor Selector Dropdown */}
      <div className="flex gap-2 flex-wrap items-center">
        <span className="text-xs text-gray-400 font-semibold">👥 INVESTOR VIEW:</span>
        <div className="relative">
          <select
            value={selectedIndex}
            onChange={(e) => {
              setSelectedIndex(Number(e.target.value));
              setShowConsensus(false);
            }}
            className="appearance-none bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm text-white cursor-pointer hover:border-blue-500 transition"
          >
            <option value="" disabled>
              Select Investor
            </option>
            {perspectives.map((p, i) => (
              <option key={i} value={i}>
                {p.investor}
              </option>
            ))}
            <option value="consensus">📊 Consensus View</option>
          </select>
          <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 pointer-events-none text-gray-400" />
        </div>

        {/* Quick View Buttons */}
        <div className="flex gap-1 ml-auto">
          {perspectives.slice(0, 3).map((p, i) => (
            <button
              key={i}
              onClick={() => {
                setSelectedIndex(i);
                setShowConsensus(false);
              }}
              className={`text-xs px-2 py-1 rounded transition ${
                selectedIndex === i && !showConsensus
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
              }`}
              title={p.investor}
            >
              {p.investor.split(' ')[0]}
            </button>
          ))}
          <button
            onClick={() => setShowConsensus(true)}
            className={`text-xs px-2 py-1 rounded transition ${
              showConsensus
                ? 'bg-purple-600 text-white'
                : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
            }`}
          >
            📊 All
          </button>
        </div>
      </div>

      {/* Selected Investor View */}
      {!showConsensus && (
        <div
          className={`border rounded-lg p-4 space-y-3 ${getSignalBg(selected.signal)}`}
        >
          {/* Header with Signal */}
          <div className="flex items-start justify-between">
            <div>
              <h4 className="font-bold text-white text-lg flex items-center gap-2">
                {getSignalEmoji(selected.signal)} {selected.investor}
              </h4>
              <p className="text-xs text-gray-400 mt-1">{selected.style}</p>
            </div>
            <div className="text-right">
              <div className={`text-lg font-bold ${getSignalColor(selected.signal)}`}>
                {selected.signal}
              </div>
              <div className="text-xs text-gray-300">
                {selected.confidence.toFixed(0)}% confident
              </div>
            </div>
          </div>

          {/* Reasoning */}
          <div className="bg-black/30 rounded p-3 border-l-2 border-blue-500">
            <p className="text-sm text-gray-200 leading-relaxed">
              "{selected.reasoning}"
            </p>
          </div>

          {/* Investor Philosophy */}
          <div className="text-xs text-gray-400 italic pt-2 border-t border-gray-600">
            💡 {selected.investor}'s Philosophy: {selected.style}
          </div>
        </div>
      )}

      {/* Consensus View */}
      {showConsensus && consensus && (
        <div className="border border-purple-500 bg-purple-900/20 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📊</span>
            <h4 className="font-bold text-white">Investor Consensus</h4>
          </div>

          {/* Breakdown */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-green-900/30 rounded p-2 text-center border border-green-600">
              <div className="text-green-400 font-bold text-xl">
                {consensus.bullish_count}
              </div>
              <div className="text-xs text-green-300">Bullish</div>
            </div>
            <div className="bg-red-900/30 rounded p-2 text-center border border-red-600">
              <div className="text-red-400 font-bold text-xl">
                {consensus.bearish_count}
              </div>
              <div className="text-xs text-red-300">Bearish</div>
            </div>
            <div className="bg-yellow-900/30 rounded p-2 text-center border border-yellow-600">
              <div className="text-yellow-400 font-bold text-xl">
                {consensus.neutral_count}
              </div>
              <div className="text-xs text-yellow-300">Neutral</div>
            </div>
          </div>

          {/* Insight */}
          <div className="bg-black/30 rounded p-3 border-l-2 border-purple-500">
            <p className="text-sm text-gray-200">{consensus.key_insight}</p>
          </div>

          {/* All Investors List */}
          <div className="space-y-2 pt-2">
            <p className="text-xs font-semibold text-gray-400">All Perspectives:</p>
            {perspectives.map((p, i) => (
              <div
                key={i}
                onClick={() => {
                  setSelectedIndex(i);
                  setShowConsensus(false);
                }}
                className="bg-slate-800/50 rounded p-2 cursor-pointer hover:bg-slate-700 transition text-sm flex items-center justify-between"
              >
                <span className="text-gray-300">{p.investor}</span>
                <div className="flex items-center gap-2">
                  <span className={`font-bold ${getSignalColor(p.signal)}`}>
                    {p.signal}
                  </span>
                  <span className="text-xs text-gray-400">
                    {p.confidence.toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
