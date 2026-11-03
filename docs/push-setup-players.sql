-- "@alicia joined your room" pushes (docs/push-setup.md §5, docs/friends-spec.md
-- §3.7): a webhook trigger on players INSERT, the same shape as
-- friendships_push. The x-push-secret header is copied from room_invites_push's
-- own definition inside the database, so the secret is never pasted or
-- printed. Idempotent; run in the SQL editor or through
-- `npx supabase db query --linked -f docs/push-setup-players.sql`.
--
-- Fires only for the first join of a player who is not the host, into a room
-- that is still waiting, whose host has a profile. A rejoin updates the row
-- (adoptTypedName) and never inserts, so it never fires. The body is the
-- sender's own `room_joined` shape; send-push re-reads the room and the
-- joiner's username from the database and ignores the typed display name.
do $$
declare secret text;
begin
  select substring(pg_get_functiondef('public.room_invites_push'::regproc) from $re$'x-push-secret', '([0-9a-f]{64})'$re$) into secret;
  if secret is null then
    raise exception 'room_invites_push does not carry the x-push-secret header; install it first (docs/push-setup.md §5)';
  end if;
  execute format($f$
    create or replace function public.players_push() returns trigger
    language plpgsql security definer set search_path to 'public', 'pg_temp' as $fn$
    declare host uuid;
    begin
      select g.host_user_id into host from games g where g.id = new.game_id and g.status = 'waiting';
      -- Not waiting, a TV room with no host account, or the host's own row: nothing to tell.
      if host is null or host = new.user_id then return new; end if;
      -- The host must be an account (a profile row), the rule in docs/friends-spec.md §3.7.
      if not exists (select 1 from profiles p where p.user_id = host) then return new; end if;
      perform net.http_post(
        url := 'https://rdqdhawlxuclfxpsvdgs.supabase.co/functions/v1/send-push',
        headers := jsonb_build_object('content-type', 'application/json', 'x-push-secret', %L),
        body := jsonb_build_object('kind', 'room_joined', 'gameId', new.game_id, 'joinerUserId', new.user_id),
        timeout_milliseconds := 5000
      );
      return new;
    end;
    $fn$
  $f$, secret);
end $$;

drop trigger if exists players_push on public.players;
create trigger players_push after insert on public.players
  for each row execute function public.players_push();
