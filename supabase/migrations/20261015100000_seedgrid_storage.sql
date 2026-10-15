-- Public bucket for the studio's construction word list
-- (seedgrid/words-production.dict + NOTICES.txt). Anyone can read it by URL;
-- only the service role (`pnpm seedgrid:upload-dict`, via the Supabase CLI) writes.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('seedgrid', 'seedgrid', true, 52428800, ARRAY['text/plain'])
ON CONFLICT (id) DO NOTHING;
