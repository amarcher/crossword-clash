-- "Sam raced your mini · Sam won by 0:12 · Watch" pushes (docs/push-setup.md §5,
-- migration 20261113100000_race_replies.sql): a webhook trigger on race_replies
-- INSERT, the same shape as room_nudges_push. The x-push-secret header is
-- copied from room_invites_push's own definition inside the database, so the
-- secret is never pasted or printed. Idempotent; run in the SQL editor or
-- through `npx supabase db query --remote=<ref> -f docs/push-setup-race-replies.sql`.
--
-- reply_to_race() already resolved the link's sender and refused a reply to
-- oneself, so the trigger posts every row as the webhook body shape.
do $$
declare secret text;
begin
  select substring(pg_get_functiondef('public.room_invites_push'::regproc) from $re$'x-push-secret', '([0-9a-f]{64})'$re$) into secret;
  if secret is null then
    raise exception 'room_invites_push does not carry the x-push-secret header; install it first (docs/push-setup.md §5)';
  end if;
  execute format($f$
    create or replace function public.race_replies_push() returns trigger
    language plpgsql security definer set search_path to 'public', 'pg_temp' as $fn$
    begin
      perform net.http_post(
        url := 'https://rdqdhawlxuclfxpsvdgs.supabase.co/functions/v1/send-push',
        headers := jsonb_build_object('content-type', 'application/json', 'x-push-secret', %L),
        body := jsonb_build_object('type', 'INSERT', 'table', 'race_replies', 'schema', 'public', 'record', to_jsonb(new)),
        timeout_milliseconds := 5000
      );
      return new;
    end;
    $fn$
  $f$, secret);
end $$;

drop trigger if exists race_replies_push on public.race_replies;
create trigger race_replies_push after insert on public.race_replies
  for each row execute function public.race_replies_push();
