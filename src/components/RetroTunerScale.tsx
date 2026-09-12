"use client";

import React, { useMemo } from "react";
import { freqToNoteName } from "@/features/pitch/conversions";

interface RetroTunerScaleProps {
  frequency?: number;
  confidence?: number;
  voiced?: boolean;
  className?: string;
}

export function RetroTunerScale({
  frequency = 0,
  confidence = 0,
  voiced = false,
  className = "",
}: RetroTunerScaleProps) {
  // Frequency range: C2 (65 Hz) to C6 (1046 Hz) log scale
  const minFreq = 65;
  const maxFreq = 1050;

  const needlePositionPercent = useMemo(() => {
    if (!voiced || frequency < minFreq) return 50; // resting center
    const logMin = Math.log2(minFreq);
    const logMax = Math.log2(maxFreq);
    const logVal = Math.log2(Math.max(minFreq, Math.min(maxFreq, frequency)));
    const pct = ((logVal - logMin) / (logMax - logMin)) * 100;
    return Math.max(2, Math.min(98, pct));
  }, [frequency, voiced]);

  const noteName = voiced && frequency > 0 ? freqToNoteName(frequency) : "—";
  const confPct = Math.round(confidence * 100);

  return (
    <div
      className={`retro-tuner-chassis ${className}`}
      style={{
        background: "linear-gradient(180deg, #1c1815 0%, #12100e 100%)",
        border: "1px solid #2e2925",
        borderRadius: "10px",
        boxShadow: "inset 1px 1px 2px rgba(255,255,255,0.06), 6px 6px 16px rgba(0,0,0,0.55)",
        padding: "14px 16px",
        position: "relative",
        userSelect: "none",
      }}
    >
      {/* Header bar: Tuning Scale & Radio Frequency Readout */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.2em",
              color: "#f59e0b",
            }}
          >
            RADIO PITCH TUNER
          </span>
          <span style={{ fontSize: "10px", color: "#6e655c", letterSpacing: "0.08em" }}>
            KHZ / SCALE C2–C6
          </span>
        </div>

        {/* Nixie / Fluorescent Note Display */}
        <div
          style={{
            background: "#0a0908",
            border: "1px solid #2b2622",
            borderRadius: "6px",
            padding: "4px 12px",
            display: "flex",
            alignItems: "baseline",
            gap: "8px",
            boxShadow: "inset 2px 2px 6px rgba(0,0,0,0.8)",
          }}
        >
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: "22px",
              fontWeight: 800,
              color: voiced ? "#f59e0b" : "#4a423a",
              textShadow: voiced ? "0 0 10px rgba(245,158,11,0.7), 0 0 20px rgba(245,158,11,0.4)" : "none",
              letterSpacing: "0.05em",
            }}
          >
            {noteName}
          </span>
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: "12px",
              color: voiced ? "#34d399" : "#453d36",
              textShadow: voiced ? "0 0 8px rgba(52,211,153,0.5)" : "none",
            }}
          >
            {voiced ? `${frequency.toFixed(1)} Hz` : "IDLE"}
          </span>
          {voiced && (
            <span style={{ fontSize: "10px", color: "#a89f95" }}>
              {confPct}% conf
            </span>
          )}
        </div>
      </div>

      {/* Glass Radio Dial */}
      <div
        style={{
          height: "52px",
          background: "radial-gradient(ellipse at 50% 50%, #1b1815 0%, #0e0c0b 100%)",
          border: "2px solid #25211d",
          borderRadius: "6px",
          boxShadow: "inset 3px 3px 8px rgba(0,0,0,0.85), inset -2px -2px 5px rgba(255,255,255,0.03)",
          position: "relative",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "6px 12px",
        }}
      >
        {/* Amber dial glow */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(90deg, rgba(245,158,11,0.03) 0%, rgba(245,158,11,0.1) 50%, rgba(245,158,11,0.03) 100%)",
            pointerEvents: "none",
          }}
        />

        {/* Octave Labels */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontFamily: "var(--mono)",
            fontSize: "10px",
            fontWeight: 700,
            color: "#a89f95",
            letterSpacing: "0.05em",
            position: "relative",
            zIndex: 2,
          }}
        >
          <span>C2 (65Hz)</span>
          <span>C3 (131Hz)</span>
          <span>A3 (220Hz)</span>
          <span>C4 (262Hz)</span>
          <span>A4 (440Hz)</span>
          <span>C5 (523Hz)</span>
          <span>C6 (1046Hz)</span>
        </div>

        {/* Ticks bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            height: "14px",
            padding: "0 4px",
            position: "relative",
            zIndex: 2,
          }}
        >
          {Array.from({ length: 33 }).map((_, i) => {
            const isMajor = i % 4 === 0;
            return (
              <div
                key={i}
                style={{
                  width: isMajor ? "2px" : "1px",
                  height: isMajor ? "12px" : "6px",
                  background: isMajor ? "#f59e0b" : "#4a423a",
                  opacity: isMajor ? 0.85 : 0.5,
                }}
              />
            );
          })}
        </div>

        {/* Tuning Needle / Cursor */}
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${needlePositionPercent}%`,
            width: "2px",
            background: voiced ? "#ff4444" : "#f59e0b",
            boxShadow: voiced
              ? "0 0 8px #ff4444, 0 0 14px rgba(255,68,68,0.8)"
              : "0 0 5px rgba(245,158,11,0.6)",
            transform: "translateX(-50%)",
            transition: "left 0.08s ease-out",
            zIndex: 3,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: "50%",
              transform: "translateX(-50%)",
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: voiced ? "#ff4444" : "#f59e0b",
            }}
          />
        </div>
      </div>
    </div>
  );
}
