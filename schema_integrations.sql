-- Run this in Supabase: Project > SQL Editor > New query
-- Stores each user's OAuth tokens for connected apps (one row per user per provider;
-- connecting again replaces it). Safe to run more than once.
--
-- Row Level Security is on with no policies, so only the server (service-role key) can read
-- or write this table. The browser lists connections through /api/integrations, which never
-- returns the tokens themselves.

create table if not exists integration_connections (
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  scopes text,
  account_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

-- The apps in src/components/integrations/ (their `provider` ids). Recreated so running this
-- again after adding an app updates the list.
alter table integration_connections
  drop constraint if exists integration_connections_provider_check;
alter table integration_connections
  add constraint integration_connections_provider_check
  check (provider in ('google', 'gmail', 'slack', 'box', 'groupme'));

create or replace function set_integration_connections_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists integration_connections_set_updated_at on integration_connections;
create trigger integration_connections_set_updated_at
before update on integration_connections
for each row
execute function set_integration_connections_updated_at();

alter table integration_connections enable row level security;
