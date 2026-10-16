-- Studio admins: signed-in (Apple/Google) accounts that may use the studio's
-- Claude drafting and daily queue without the shared STUDIO_TOKEN. Rows are
-- added by hand (SQL editor or service role); the studio-claude and
-- studio-schedule edge functions check membership with the service role.
CREATE TABLE IF NOT EXISTS studio_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE studio_admins ENABLE ROW LEVEL SECURITY;

-- Lets the studio tell a signed-in admin they're one. No write policies.
CREATE POLICY "Users read own studio admin row"
  ON studio_admins FOR SELECT
  USING (auth.uid() = user_id);
