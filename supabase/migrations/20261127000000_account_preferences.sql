-- An account's small preferences, kept with the account (Andrew, 2026-11-16).
--
-- Signing in means the same data on every device. Three choices lived only in
-- the browser that made them: the solo play settings (Autocheck, Haptics), the
-- community authors a player has hidden, and the board's Friends-only switch.
-- One row per (user, preference); the client (src/lib/accountPrefs.ts) writes
-- a key when it changes and reads them all when the account appears. A guest
-- still keeps these in the browser only.
--
-- Owner-only under RLS, real accounts only; rows die with the user by
-- cascade, so delete-account needs nothing new. Nothing sweeps them: a
-- preference is small and stays until the account goes.
--
-- Deploy: `npx supabase db push`. Before the client: without the table the
-- reads fail quietly and the preferences stay per device, as they were.

CREATE TABLE IF NOT EXISTS account_preferences (
  user_id    UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  key        TEXT NOT NULL CHECK (key IN ('solo_settings', 'hidden_authors', 'board_friends_only')),
  value      JSONB NOT NULL CHECK (pg_column_size(value) <= 16384),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

ALTER TABLE account_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Accounts read own preferences" ON account_preferences;
DROP POLICY IF EXISTS "Accounts insert own preferences" ON account_preferences;
DROP POLICY IF EXISTS "Accounts update own preferences" ON account_preferences;

CREATE POLICY "Accounts read own preferences"
  ON account_preferences FOR SELECT
  USING (
    auth.uid() = user_id
    AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

CREATE POLICY "Accounts insert own preferences"
  ON account_preferences FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

CREATE POLICY "Accounts update own preferences"
  ON account_preferences FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );
