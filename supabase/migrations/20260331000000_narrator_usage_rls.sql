-- Enable RLS on narrator_usage to prevent public REST API access.
-- Edge functions use the service role key, which bypasses RLS.
alter table narrator_usage enable row level security;
