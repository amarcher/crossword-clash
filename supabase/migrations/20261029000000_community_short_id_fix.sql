-- community_short_id(): call pgcrypto by its schema.
--
-- The community migration (20261028000000) defined the short-id generator with
-- `SET search_path = public, pg_temp` and an unqualified gen_random_bytes(8).
-- On Supabase, pgcrypto lives in the `extensions` schema, so the call could not
-- be resolved ("function gen_random_bytes(integer) does not exist") and every
-- publish_puzzle() of a new puzzle failed; the client showed "Publishing
-- failed" (found 2026-10-29 by the owner's first publish from the app). The
-- search path stays pinned (it is a SECURITY DEFINER caller's helper); the
-- extension function is named with its schema instead.

CREATE OR REPLACE FUNCTION public.community_short_id() RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SET search_path = public, pg_temp
AS $$
DECLARE
  -- No 0/o, 1/l/i: a code that survives being read aloud.
  alphabet CONSTANT TEXT := 'abcdefghjkmnpqrstuvwxyz23456789';
  bytes BYTEA := extensions.gen_random_bytes(8);
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 0..7 LOOP
    result := result || substr(alphabet, (get_byte(bytes, i) % 31) + 1, 1);
  END LOOP;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.community_short_id() FROM PUBLIC;
