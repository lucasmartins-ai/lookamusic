# TDR-06 — No backend/cloud for Phases 1–12

Date: 2026-09-10. Status: accepted.

Context: §42 offline-first; §46 local analysis default; §6 "no unnecessary infrastructure".
Decision: persistence = IndexedDB + JSON export. No Supabase until sharing/sync/collab genuinely required; schema reserved in `docs/database-schema.md` with RLS precondition.
