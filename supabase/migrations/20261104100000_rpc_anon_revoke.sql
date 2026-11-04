-- Every RPC that needs a session loses the anonymous role's EXECUTE (2026-11-04).
--
-- Supabase's default privileges grant EXECUTE on each new public function to
-- anon, authenticated and service_role, and `REVOKE ALL ... FROM PUBLIC` does
-- not touch those explicit grants. So the friends, community, solves and
-- claim RPCs, each written as "revoked from PUBLIC, granted to authenticated",
-- were still executable by the `anon` role: a request with no session at all.
-- Each refuses such a caller on its own (friends_account_id(),
-- community_account_id(), auth.uid() checks), so nothing was readable; this
-- closes the door by name. An anonymous *user* (a session with
-- `is_anonymous`) is the `authenticated` role and is unaffected.
--
-- Left alone: `has_entitlement` (read by RLS policies as the querying role),
-- `community_short_id` (a column default), the trigger functions and the
-- sweeps (service_role only already). New RPCs revoke anon by name.

REVOKE EXECUTE ON FUNCTION public.accept_publishing_terms(TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_cell(UUID, TEXT, TEXT, UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.community_account_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.friends_account_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.friends_blocked(UUID, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.friends_check_invite_limits(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.invite_to_room(UUID, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_invites_seen(UUID[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.nudge_host(UUID, TIMESTAMPTZ) FROM anon;
REVOKE EXECUTE ON FUNCTION public.publish_puzzle(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.recent_opponents() FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_solves(JSONB) FROM anon;
REVOKE EXECUTE ON FUNCTION public.report_puzzle(UUID, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.respond_friend_request(UUID, BOOLEAN) FROM anon;
REVOKE EXECUTE ON FUNCTION public.respond_room_invite(UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.send_beat(UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.send_friend_request(TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.unpublish_puzzle(UUID) FROM anon;
