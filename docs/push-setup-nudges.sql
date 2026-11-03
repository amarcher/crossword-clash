-- "@alicia is waiting in your room" pushes (docs/push-setup.md §5,
-- docs/friends-spec.md §3.7): a webhook trigger on room_nudges INSERT, the same
-- shape as friendships_push. The x-push-secret header is copied from
-- room_invites_push's own definition inside the database, so the secret is
-- never pasted or printed. Idempotent; run in the SQL editor or through
-- `npx supabase db query --linked -f docs/push-setup-nudges.sql`.
--
-- nudge_host() (migration 20261103000000_room_rendezvous.sql) already checked
-- the caller is a waiting joiner, resolved the host and applied the 3-minute
-- cooldown, so the trigger posts every row as the webhook body shape.
do $$
declare secret text;
begin
  select substring(pg_get_functiondef('public.room_invites_push'::regproc) from $re$'x-push-secret', '([0-9a-f]{64})'$re$) into secret;
  if secret is null then
    raise exception 'room_invites_push does not carry the x-push-secret header; install it first (docs/push-setup.md §5)';
  end if;
  execute format($f$
    create or replace function public.room_nudges_push() returns trigger
    language plpgsql security definer set search_path to 'public', 'pg_temp' as $fn$
    begin
      perform net.http_post(
        url := 'https://rdqdhawlxuclfxpsvdgs.supabase.co/functions/v1/send-push',
        headers := jsonb_build_object('content-type', 'application/json', 'x-push-secret', %L),
        body := jsonb_build_object('type', 'INSERT', 'table', 'room_nudges', 'schema', 'public', 'record', to_jsonb(new)),
        timeout_milliseconds := 5000
      );
      return new;
    end;
    $fn$
  $f$, secret);
end $$;

drop trigger if exists room_nudges_push on public.room_nudges;
create trigger room_nudges_push after insert on public.room_nudges
  for each row execute function public.room_nudges_push();
