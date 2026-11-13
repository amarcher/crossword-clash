-- The daily bonus puzzle (docs/plus-expansion-spec.md §1; Andrew, 2026-11-12:
-- an extra puzzle every day, Plus only, no free play).
--
-- The daily feed is public with its answers, so a bonus served the same way
-- would be free to anyone reading the network tab. Bonuses live here instead:
-- the table has no read policy; everyone may read a released bonus's card
-- (title, theme, author, size, the grid's shape, its identity) through
-- `bonus_cards`; the puzzle itself comes only from `bonus_puzzle(day)`, which
-- answers Plus callers. Release follows the dailies' rule: a day is out once
-- it is today anywhere, i.e. up to the UTC date + 1 (proxy.ts).
-- `pnpm bonus:add` writes rows (service role).

CREATE TABLE IF NOT EXISTS bonus_puzzles (
  day        DATE PRIMARY KEY,
  title      TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  theme      TEXT CHECK (theme IS NULL OR char_length(theme) <= 80),
  author     TEXT NOT NULL DEFAULT 'Crossword Clash' CHECK (char_length(author) BETWEEN 1 AND 120),
  width      SMALLINT NOT NULL CHECK (width BETWEEN 3 AND 25),
  height     SMALLINT NOT NULL CHECK (height BETWEEN 3 AND 25),
  -- The grid's shape for the card: one character per square, row by row, '#' black and '.' white.
  blocks     TEXT NOT NULL CHECK (blocks ~ '^[#.]+$' AND char_length(blocks) = width * height),
  -- soloStats.puzzleIdentity(), what solve history and progress are keyed by.
  identity   TEXT NOT NULL CHECK (char_length(identity) BETWEEN 1 AND 80),
  -- The full transfer puzzle (puzzleNormalizer.ts), answers included.
  puzzle     JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE bonus_puzzles ENABLE ROW LEVEL SECURITY;
-- No policies: nobody reads or writes the table directly but the service role.

CREATE OR REPLACE VIEW bonus_cards AS
  SELECT day, title, theme, author, width, height, blocks, identity
  FROM bonus_puzzles
  WHERE day <= (now() AT TIME ZONE 'utc')::date + 1;

-- A view runs with its owner's rights by default, so it reads past the table's RLS; that is the point.
GRANT SELECT ON bonus_cards TO anon, authenticated, service_role;

-- The puzzle, for Plus. Null for a day that isn't out yet, has no bonus, or for a caller without Plus.
CREATE OR REPLACE FUNCTION public.bonus_puzzle(p_day DATE)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT b.puzzle FROM bonus_puzzles b
  WHERE b.day = p_day
    AND b.day <= (now() AT TIME ZONE 'utc')::date + 1
    AND auth.uid() IS NOT NULL
    AND has_entitlement(auth.uid(), 'plus');
$$;

REVOKE ALL ON FUNCTION public.bonus_puzzle(DATE) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bonus_puzzle(DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.bonus_puzzle(DATE) TO authenticated, service_role;

-- A bonus finish is its own source in solve history (it counts for the streak like any solo finish).
ALTER TABLE solves DROP CONSTRAINT IF EXISTS solves_source_check;
ALTER TABLE solves ADD CONSTRAINT solves_source_check CHECK (source IN ('daily', 'nyt', 'community', 'bonus', 'other'));
