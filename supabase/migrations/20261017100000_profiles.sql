-- Profiles: the public username that comes with an optional account (Apple or
-- Google sign-in). Anonymous players have no row; a signed-in solver picks a
-- username once, and other players see it in games and on leaderboards.
-- Rules mirror src/lib/username.ts: 3–20 characters, letters, digits and
-- underscores, unique regardless of case.
CREATE TABLE IF NOT EXISTS profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  username TEXT NOT NULL CHECK (username ~ '^[A-Za-z0-9_]{3,20}$'),
  username_lower TEXT GENERATED ALWAYS AS (lower(username)) STORED,
  display_name TEXT CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 1 AND 40),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_key ON profiles (username_lower);

CREATE OR REPLACE FUNCTION profiles_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION profiles_set_updated_at();

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Usernames are public by design: that is what lets friends find and credit
-- each other. The row holds nothing else about the person.
CREATE POLICY "Profiles are public"
  ON profiles FOR SELECT
  USING (true);

-- Only the account itself writes its row, and only a real (non-anonymous)
-- account may have one: the anonymous JWT carries is_anonymous = true.
CREATE POLICY "Accounts insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

CREATE POLICY "Accounts update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );
