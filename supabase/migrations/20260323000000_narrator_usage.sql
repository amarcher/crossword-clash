-- Rate limiting for narrator/TTS edge functions.
-- Tracks usage by client IP + endpoint to prevent API cost overruns.

create table narrator_usage (
  id uuid primary key default gen_random_uuid(),
  client_ip text not null,
  endpoint text not null,
  created_at timestamptz not null default now()
);

create index idx_narrator_usage_lookup
  on narrator_usage(client_ip, endpoint, created_at desc);

-- Allow edge functions (using service role) full access.
-- No RLS needed — table is only accessed by edge functions via service role key.
