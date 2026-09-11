# Database schema (§41, §61.14) — local-first

No server DB for Phases 1–12. Persistence = IndexedDB (`lookamusic` DB, store `compositions`, keyPath `id`)
+ JSON export. Schema below applies to the stored `Composition` object and any future Supabase mirror.

```sql
-- Future Supabase mirror (only if cloud sync/sharing genuinely required; TDR-06).
create table compositions (
  id uuid primary key,
  owner_id uuid references auth.users,   -- null for local-only rows (never uploaded)
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  tempo_bpm real not null,
  time_signature text not null,           -- '4/4' | '3/4' | '6/8'
  key_root smallint not null,            -- pitch class 0–11
  key_mode text not null,                -- 'major' | 'minor'
  scale_id text not null,
  style_id text not null,
  melody jsonb not null default '[]',    -- NoteEvent[]
  chords jsonb not null default '[]',    -- ChordEvent[]
  arrangement jsonb not null default '{}',
  instruments jsonb not null default '{}',
  metadata jsonb not null default '{}'
);
```

- Structured composition is canonical; audio files are derived artifacts referenced by id, never the row.
- RLS mandatory if Supabase is ever enabled (owner-only read/write).
- No auth required to sing/create locally (§42).
