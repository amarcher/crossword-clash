-- Head-to-head records per daily (Andrew, 2026-11-25: the card should follow
-- the stats page's Mini / Midi / Large / Daily Plus tab like every other card).
-- One row per friend and slot; the page picks the tab's rows. my_head_to_head()
-- (every daily together) stays for clients from before this. The same rules as
-- it: accepted friends only, everyone sees the dailies in common, wins / losses
-- / ties only for Plus.

CREATE OR REPLACE FUNCTION public.my_head_to_head_by_slot(p_since DATE)
RETURNS TABLE (friend_id UUID, username TEXT, slot TEXT, played INT, wins INT, losses INT, ties INT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid UUID := auth.uid();
  is_plus BOOLEAN;
BEGIN
  IF uid IS NULL THEN
    RETURN;
  END IF;
  is_plus := has_entitlement(uid, 'plus');
  RETURN QUERY
  WITH friends AS (
    SELECT CASE WHEN f.requester_id = uid THEN f.recipient_id ELSE f.requester_id END AS fid
    FROM friendships f
    WHERE f.status = 'accepted' AND (f.requester_id = uid OR f.recipient_id = uid)
  )
  SELECT fr.fid, p.username, me.slot,
    count(*)::int,
    CASE WHEN is_plus THEN count(*) FILTER (WHERE me.seconds < them.seconds)::int END,
    CASE WHEN is_plus THEN count(*) FILTER (WHERE me.seconds > them.seconds)::int END,
    CASE WHEN is_plus THEN count(*) FILTER (WHERE me.seconds = them.seconds)::int END
  FROM friends fr
  JOIN profiles p ON p.user_id = fr.fid
  JOIN daily_results them ON them.user_id = fr.fid AND them.day >= coalesce(p_since, '-infinity'::date)
  JOIN daily_results me ON me.user_id = uid AND me.day = them.day AND me.slot = them.slot
  GROUP BY fr.fid, p.username, me.slot
  ORDER BY me.slot, count(*) DESC, p.username;
END;
$$;

REVOKE ALL ON FUNCTION public.my_head_to_head_by_slot(DATE) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.my_head_to_head_by_slot(DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.my_head_to_head_by_slot(DATE) TO authenticated, service_role;
