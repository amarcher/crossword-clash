-- Friend-request pushes (docs/push-setup.md §5): the same webhook trigger as
-- room_invites_push, on friendships. The x-push-secret header is copied from
-- room_invites_push's own definition inside the database, so the secret is
-- never pasted or printed. Idempotent; run in the SQL editor or through
-- `npx supabase db query --linked -f docs/push-setup-friendships.sql`.
do $$
declare secret text;
begin
  select substring(pg_get_functiondef('public.room_invites_push'::regproc) from $re$'x-push-secret', '([0-9a-f]{64})'$re$) into secret;
  if secret is null then
    raise exception 'room_invites_push does not carry the x-push-secret header; install it first (docs/push-setup.md §5)';
  end if;
  execute format($f$
    create or replace function public.friendships_push() returns trigger
    language plpgsql security definer set search_path to 'public', 'pg_temp' as $fn$
    begin
      -- Only a fresh request: an accept updates the row and never fires an INSERT.
      if new.status <> 'pending' then return new; end if;
      perform net.http_post(
        url := 'https://rdqdhawlxuclfxpsvdgs.supabase.co/functions/v1/send-push',
        headers := jsonb_build_object('content-type', 'application/json', 'x-push-secret', %L),
        body := jsonb_build_object('type', 'INSERT', 'table', 'friendships', 'schema', 'public', 'record', to_jsonb(new)),
        timeout_milliseconds := 5000
      );
      return new;
    end;
    $fn$
  $f$, secret);
end $$;

drop trigger if exists friendships_push on public.friendships;
create trigger friendships_push after insert on public.friendships
  for each row execute function public.friendships_push();
