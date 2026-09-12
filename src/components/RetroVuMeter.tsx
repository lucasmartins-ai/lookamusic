"use client";

import React, { useEffect, useRef, useState } from "react";

interface RetroVuMeterProps {
  level01?: number; // 0 to 1 normalized RMS / energy
  label?: string;
  className?: string;
  size?: "small" | "medium";
}

export function RetroVuMeter({
  level01 = 0,
  label = "INPUT LEVEL",
  className = "",
  size = "medium",
}: RetroVuMeterProps) {
  const [needleAngle, setNeedleAngle] = useState(-45); // -45 deg (-20 dB) to +42 deg (+3 dB)
  const currentAngleRef = useRef(-45);
  const targetAngleRef = useRef(-45);
  const animFrameRef = useRef<number | null>(null);

  // Map 0..1 RMS to decibels/VU angle
  useEffect(() => {
    // 0 is -20 VU (-45 deg), 0.7 is 0 VU (0 deg), 1.0 is +3 VU (+42 deg)
    const clamped = Math.max(0, Math.min(1, level01));
    let target = -45;
    if (clamped > 0.005) {
      // Logarithmic ballistics
      const db = 20 * Math.log10(Math.max(clamped, 0.005)); // e.g. -46 to 0 dB
      // Normal range: -40dB -> -45deg, -10dB -> -15deg, -3dB -> 0deg, 0dB -> +38deg
      target = Math.max(-45, Math.min(42, (db + 20) * 3.5));
    }
    targetAngleRef.current = target;
  }, [level01]);

  // Spring animation for mechanical meter ballistics
  useEffect(() => {
    let active = true;
    const animate = () => {
      if (!active) return;
      // Damped mechanical spring
      const diff = targetAngleRef.current - currentAngleRef.current;
      currentAngleRef.current += diff * 0.18;
      setNeedleAngle(currentAngleRef.current);
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);
    return () => {
      active = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  const isPeak = needleAngle > 10;
  const isCompact = size === "small";

  return (
    <div
      className={`retro-vu-chassis ${className}`}
      style={{
        background: "linear-gradient(180deg, #1c1815 0%, #141210 100%)",
        border: "1px solid #2e2925",
        boxShadow: "inset 1px 1px 2px rgba(255,255,255,0.06), 4px 4px 12px rgba(0,0,0,0.5)",
        borderRadius: "8px",
        padding: isCompact ? "8px" : "12px",
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        position: "relative",
        userSelect: "none",
        minWidth: isCompact ? "140px" : "190px",
      }}
      aria-label={`${label} VU Meter`}
    >
      {/* Screw accents */}
      <div style={{ position: "absolute", top: 4, left: 4, width: 4, height: 4, borderRadius: "50%", background: "#4a423a" }} />
      <div style={{ position: "absolute", top: 4, right: 4, width: 4, height: 4, borderRadius: "50%", background: "#4a423a" }} />

      {/* Meter Display Window */}
      <div
        style={{
          width: "100%",
          height: isCompact ? "65px" : "85px",
          background: "radial-gradient(ellipse at 50% 90%, #fff8d6 0%, #ecdcb0 55%, #dfce9f 100%)",
          borderRadius: "6px 6px 4px 4px",
          border: "2px solid #100e0c",
          boxShadow: "inset 2px 2px 5px rgba(0,0,0,0.4), inset -2px -2px 4px rgba(255,255,255,0.2)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Warm backlight tint */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(circle at 50% 30%, rgba(255,220,130,0.35) 0%, rgba(200,160,80,0.1) 80%)",
            pointerEvents: "none",
          }}
        />

        {/* Scale Arch */}
        <svg
          viewBox="0 0 200 90"
          style={{ width: "100%", height: "100%", display: "block" }}
          aria-hidden="true"
        >
          {/* Black Arc (-20 to 0) */}
          <path
            d="M 35 70 A 90 90 0 0 1 140 32"
            fill="none"
            stroke="#222"
            strokeWidth="2"
          />
          {/* Red Arc (0 to +3) */}
          <path
            d="M 140 32 A 90 90 0 0 1 172 45"
            fill="none"
            stroke="#d32f2f"
            strokeWidth="3.5"
          />

          {/* Ticks */}
          <text x="35" y="80" fontSize="9" fontWeight="700" fill="#333" textAnchor="middle">-20</text>
          <text x="70" y="58" fontSize="9" fontWeight="700" fill="#333" textAnchor="middle">-10</text>
          <text x="105" y="47" fontSize="9" fontWeight="700" fill="#333" textAnchor="middle">-5</text>
          <text x="138" y="44" fontSize="10" fontWeight="900" fill="#222" textAnchor="middle">0</text>
          <text x="172" y="58" fontSize="10" fontWeight="900" fill="#d32f2f" textAnchor="middle">+3</text>

          <text x="100" y="76" fontSize="11" fontWeight="800" letterSpacing="0.1em" fill="#554" textAnchor="middle">
            VU
          </text>
        </svg>

        {/* Needle */}
        <div
          style={{
            position: "absolute",
            bottom: "-10px",
            left: "50%",
            width: "2px",
            height: isCompact ? "75px" : "95px",
            background: isPeak ? "#c62828" : "#1a1a1a",
            transformOrigin: "bottom center",
            transform: `translateX(-50%) rotate(${needleAngle}deg)`,
            transition: "background 0.1s ease",
            borderRadius: "1px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
          }}
        />

        {/* Pivot Hub */}
        <div
          style={{
            position: "absolute",
            bottom: "-12px",
            left: "50%",
            transform: "translateX(-50%)",
            width: "24px",
            height: "24px",
            borderRadius: "50%",
            background: "radial-gradient(circle at 35% 35%, #555 0%, #111 80%)",
            border: "1px solid #000",
            boxShadow: "0 2px 4px rgba(0,0,0,0.6)",
          }}
        />
      </div>

      {/* Footer Plate & Peak LED */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          width: "100%",
          marginTop: "6px",
          padding: "0 2px",
        }}
      >
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: "9px",
            fontWeight: 700,
            letterSpacing: "0.15em",
            color: "#a89f95",
          }}
        >
          {label}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <span style={{ fontSize: "8px", fontWeight: 700, color: "#6e655c", letterSpacing: "0.1em" }}>PEAK</span>
          <div
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              background: isPeak ? "#ff3333" : "#3b1111",
              boxShadow: isPeak ? "0 0 6px #ff3333, 0 0 10px rgba(255,50,50,0.6)" : "none",
              transition: "all 0.08s ease",
            }}
          />
        </div>
      </div>
    </div>
  );
}
