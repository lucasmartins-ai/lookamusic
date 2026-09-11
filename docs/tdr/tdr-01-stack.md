# TDR-01 — Next.js App Router + strict TypeScript, vanilla CSS

Date: 2026-09-10. Status: accepted.

Context: need a publishable, portfolio-grade web app with routing for instrument/session/editor/learn surfaces.
Options: (a) Next.js App Router, (b) Vite SPA, (c) vanilla TS.
Decision: (a). App Router gives file-routed surfaces, production build story, and Vercel-compatible deploy for P15 with zero custom SSR needs (all audio client-side, `"use client"` instrument tree).
CSS: vanilla `globals.css` design tokens (no Tailwind) — custom instrument identity per §34, smaller bundle toward the 250 kB budget.
Consequence: team must keep all audio/DSP outside React render; client components marked explicitly.
