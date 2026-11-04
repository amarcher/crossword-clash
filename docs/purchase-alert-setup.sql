-- Slack purchase alerts (docs/plus-setup.md §4): a pg_net trigger on
-- purchase_events INSERT that posts the row to the purchase-alert edge
-- function, which writes one line per event to #crossword-clash. The same
-- shape as the report-alert webhook and the push triggers; the secret lives
-- in the trigger function's definition inside the database, which is why
-- this is not a migration.
--
-- Run it in the SQL editor (Dashboard → SQL) after replacing the one
-- placeholder below with the value you set as the PURCHASE_ALERT_SECRET
-- function secret. Never commit a filled-in copy. Idempotent: re-run it to
-- rotate the secret.
do $$
declare secret text := '<PURCHASE_ALERT_SECRET>';
begin
  if secret = '<PURCHASE_ALERT_SECRET>' or length(secret) < 16 then
    raise exception 'replace <PURCHASE_ALERT_SECRET> with the function secret (at least 16 characters) before running';
  end if;
  execute format($f$
    create or replace function public.purchase_alert_webhook() returns trigger
    language plpgsql security definer set search_path to 'public', 'pg_temp' as $fn$
    begin
      perform net.http_post(
        url := 'https://rdqdhawlxuclfxpsvdgs.supabase.co/functions/v1/purchase-alert',
        headers := jsonb_build_object('content-type', 'application/json', 'x-purchase-alert-secret', %L),
        body := jsonb_build_object('type', 'INSERT', 'table', 'purchase_events', 'schema', 'public', 'record', to_jsonb(new)),
        timeout_milliseconds := 8000
      );
      return new;
    end;
    $fn$
  $f$, secret);
end $$;

drop trigger if exists purchase_alert on public.purchase_events;
create trigger purchase_alert after insert on public.purchase_events
  for each row execute function public.purchase_alert_webhook();

-- Check (read-only): the trigger and its function exist, and the header is in place.
-- select tgname, tgenabled from pg_trigger where tgname = 'purchase_alert';
-- select pg_get_functiondef('public.purchase_alert_webhook'::regproc) like '%x-purchase-alert-secret%' as has_header;
