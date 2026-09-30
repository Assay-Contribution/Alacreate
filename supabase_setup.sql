-- ============================================================================================
-- Supabase setup for the whole app: every table, index, function, Row Level Security policy,
-- and the storage bucket. Run it in Supabase: SQL Editor > New query > paste > Run.
--
-- Safe to run more than once, and on an existing project: tables are only created if
-- missing (existing data is kept), and the policies on these tables are dropped and
-- recreated exactly as listed here. When the database needs to change, edit this file
-- and run it again (don't add new .sql files).
--
-- How access works:
--   * The browser uses the public anon key. That key is visible to anyone, so the only
--     thing protecting data is Row Level Security (RLS). Every table below has RLS on.
--   * With RLS on, a table with NO policies is unreadable and unwritable with that key.
--     Policies open specific actions, and here they only ever allow a signed-in user
--     their OWN rows (user_id = auth.uid()).
--   * The server's service-role key (SUPABASE_SERVICE_ROLE_KEY) bypasses RLS. It's used
--     only for server-side work: file processing, message indexing, OAuth tokens.
--
--   Table                    Browser / signed-in user can            Server (service role)
--   signups                  insert (Manifesto join form)            -
--   contribution_reports     read, create, update own days           -
--   weekly_reports           read, create, update own                -
--   files                    read, add, delete own                   updates processing status
--   file_chunks              read own (AI search)                    writes sections
--   message_chunks           read, delete own (AI search)            writes embeddings
--   personality_profiles     read, create, update, delete own        -
--   integration_connections  NOTHING (holds OAuth tokens)            reads and writes
-- ============================================================================================

create extension if not exists vector;

-- Keeps updated_at current on every table that has it.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ---------------------------------------------------------------------------------- tables

-- Join-the-mailing-list form on the Manifesto page (works signed in or out).
create table if not exists signups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  email text not null unique check (btrim(email) <> ''),
  created_at timestamptz not null default now()
);

-- One row per user per day on the timeline: notes (including AI replies), links, files,
-- and the generated daily report. (Older projects also have north_star, next_steps,
-- morning_report, and midday_report columns; they're unused and left in place.)
create table if not exists contribution_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  report_date date not null default current_date,
  notes jsonb not null default '[]'::jsonb,
  links jsonb not null default '[]'::jsonb,
  files jsonb not null default '[]'::jsonb,
  final_report text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, report_date)
);
alter table contribution_reports
  add column if not exists notes jsonb not null default '[]'::jsonb,
  add column if not exists links jsonb not null default '[]'::jsonb,
  add column if not exists files jsonb not null default '[]'::jsonb,
  add column if not exists final_report text;

-- Generated weekly reports (one per user per week; generating again replaces it).
create table if not exists weekly_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week_start date not null,
  week_end date not null,
  report text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

-- One row per uploaded file (the file itself is in the report-attachments bucket).
-- status is set by the server's processing step, never by users.
create table if not exists files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  report_date date not null,
  name text not null,
  path text not null unique,
  size bigint not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'ready', 'unsupported', 'failed')),
  error text,
  page_count int,
  chunk_count int,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists files_user_date_idx on files (user_id, report_date);

-- A file's text in sections, each with an OpenAI embedding (text-embedding-3-small = 1536
-- numbers), for the AI's file search. Deleted along with the file.
create table if not exists file_chunks (
  id bigint generated always as identity primary key,
  file_id uuid not null references files (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  chunk_index int not null,
  page_start int,
  page_end int,
  content text not null,
  embedding vector(1536) not null,
  fts tsvector generated always as (to_tsvector('english', content)) stored,
  unique (file_id, chunk_index)
);
create index if not exists file_chunks_file_idx on file_chunks (file_id);
create index if not exists file_chunks_embedding_idx on file_chunks using hnsw (embedding vector_cosine_ops);
create index if not exists file_chunks_fts_idx on file_chunks using gin (fts);

-- Timeline messages (notes and AI replies) with embeddings, for the AI's history search.
create table if not exists message_chunks (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  report_date date not null,
  added_at timestamptz not null,
  author text not null check (author in ('user', 'assistant')),
  content text not null,
  embedding vector(1536) not null,
  fts tsvector generated always as (to_tsvector('english', content)) stored,
  unique (user_id, added_at, author)
);
create index if not exists message_chunks_user_date_idx on message_chunks (user_id, report_date);
create index if not exists message_chunks_embedding_idx on message_chunks using hnsw (embedding vector_cosine_ops);
create index if not exists message_chunks_fts_idx on message_chunks using gin (fts);

-- Big Five personality test results and goals, for the Motivation button.
create table if not exists personality_profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  traits jsonb not null,
  answers jsonb not null default '[]'::jsonb,
  goals jsonb not null default '[]'::jsonb,
  aspiration text not null default '',
  recent_motivations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- OAuth tokens for connected apps (Google Drive, Gmail, Slack, Box, GroupMe). Server only.
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
-- The provider ids from src/helpers/integrations/. Update this list when adding an app.
alter table integration_connections drop constraint if exists integration_connections_provider_check;
alter table integration_connections add constraint integration_connections_provider_check
  check (provider in ('google', 'gmail', 'slack', 'box', 'groupme'));

-- updated_at triggers
drop trigger if exists contribution_reports_set_updated_at on contribution_reports;
create trigger contribution_reports_set_updated_at before update on contribution_reports
  for each row execute function set_updated_at();
drop trigger if exists weekly_reports_set_updated_at on weekly_reports;
create trigger weekly_reports_set_updated_at before update on weekly_reports
  for each row execute function set_updated_at();
drop trigger if exists personality_profiles_set_updated_at on personality_profiles;
create trigger personality_profiles_set_updated_at before update on personality_profiles
  for each row execute function set_updated_at();
drop trigger if exists integration_connections_set_updated_at on integration_connections;
create trigger integration_connections_set_updated_at before update on integration_connections
  for each row execute function set_updated_at();


-- ------------------------------------------------------------------ Row Level Security

alter table signups enable row level security;
alter table contribution_reports enable row level security;
alter table weekly_reports enable row level security;
alter table files enable row level security;
alter table file_chunks enable row level security;
alter table message_chunks enable row level security;
alter table personality_profiles enable row level security;
alter table integration_connections enable row level security;

-- Start clean: remove every existing policy on these tables (including old ones under
-- other names), so the only policies are the ones below.
do $$
declare
  p record;
begin
  for p in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('signups', 'contribution_reports', 'weekly_reports', 'files',
        'file_chunks', 'message_chunks', 'personality_profiles', 'integration_connections')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- signups: anyone may join the list; nobody can read it back with the public key.
create policy "Anyone can sign up" on signups
  for insert to anon, authenticated with check (true);

-- contribution_reports: the timeline reads and saves the user's own days; report
-- generation writes final_report as the user.
create policy "Read own days" on contribution_reports
  for select to authenticated using (user_id = auth.uid());
create policy "Create own days" on contribution_reports
  for insert to authenticated with check (user_id = auth.uid());
create policy "Update own days" on contribution_reports
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- weekly_reports
create policy "Read own weekly reports" on weekly_reports
  for select to authenticated using (user_id = auth.uid());
create policy "Create own weekly reports" on weekly_reports
  for insert to authenticated with check (user_id = auth.uid());
create policy "Replace own weekly reports" on weekly_reports
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- files: users record and remove their uploads; only the server updates status.
create policy "Read own files" on files
  for select to authenticated using (user_id = auth.uid());
create policy "Add own files" on files
  for insert to authenticated with check (user_id = auth.uid());
create policy "Delete own files" on files
  for delete to authenticated using (user_id = auth.uid());

-- file_chunks: read-only for users (the AI searches as the user); the server writes them.
create policy "Read own file sections" on file_chunks
  for select to authenticated using (user_id = auth.uid());

-- message_chunks: users can search and remove their own; the server writes them.
create policy "Read own message index" on message_chunks
  for select to authenticated using (user_id = auth.uid());
create policy "Delete own message index" on message_chunks
  for delete to authenticated using (user_id = auth.uid());

-- personality_profiles
create policy "Read own profile" on personality_profiles
  for select to authenticated using (user_id = auth.uid());
create policy "Create own profile" on personality_profiles
  for insert to authenticated with check (user_id = auth.uid());
create policy "Update own profile" on personality_profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Delete own profile" on personality_profiles
  for delete to authenticated using (user_id = auth.uid());

-- integration_connections: intentionally NO policies (RLS on + no policies = the public key
-- can't touch it). As a second lock, take away the public roles' table permissions too,
-- so the tokens stay protected even if RLS were ever switched off by mistake. The
-- service-role key used by the server isn't affected.
revoke all on integration_connections from anon, authenticated;


-- -------------------------------------------------------------------------------- storage

-- Uploaded files. Public so the app's links (getPublicUrl) open directly; paths start
-- with the user's id: "<user_id>/<date>/<timestamp>-<filename>".
insert into storage.buckets (id, name, public)
values ('report-attachments', 'report-attachments', true)
on conflict (id) do nothing;

-- Users may only upload, change, read through the API, or delete files in their own folder.
drop policy if exists "Users can upload to their own folder" on storage.objects;
create policy "Users can upload to their own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'report-attachments' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users can update their own files" on storage.objects;
create policy "Users can update their own files" on storage.objects
  for update to authenticated
  using (bucket_id = 'report-attachments' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users can read their own files" on storage.objects;
create policy "Users can read their own files" on storage.objects
  for select to authenticated
  using (bucket_id = 'report-attachments' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users can delete their own files" on storage.objects;
create policy "Users can delete their own files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'report-attachments' and (storage.foldername(name))[1] = auth.uid()::text);


-- ------------------------------------------------------------------------- search functions
-- Hybrid search (meaning + keywords, ranked together). "security invoker" runs them with
-- the caller's permissions, so RLS limits results to the signed-in user's own rows.

create or replace function match_file_chunks(
  query_embedding vector(1536),
  query_text text,
  match_count int default 5,
  filter_file_id uuid default null
)
returns table (
  id bigint, file_id uuid, chunk_index int, page_start int, page_end int,
  content text, score double precision
)
language sql
stable
security invoker
as $$
  with semantic as (
    select c.id, row_number() over (order by c.embedding <=> query_embedding) as rank
    from file_chunks c
    where filter_file_id is null or c.file_id = filter_file_id
    order by c.embedding <=> query_embedding
    limit match_count * 4
  ),
  keyword as (
    select c.id,
      row_number() over (
        order by ts_rank_cd(c.fts, websearch_to_tsquery('english', query_text)) desc
      ) as rank
    from file_chunks c
    where (filter_file_id is null or c.file_id = filter_file_id)
      and c.fts @@ websearch_to_tsquery('english', query_text)
    order by rank
    limit match_count * 4
  )
  select c.id, c.file_id, c.chunk_index, c.page_start, c.page_end, c.content,
    coalesce(1.0 / (60 + s.rank), 0.0) + coalesce(1.0 / (60 + k.rank), 0.0) as score
  from semantic s
  full outer join keyword k on s.id = k.id
  join file_chunks c on c.id = coalesce(s.id, k.id)
  order by score desc
  limit match_count;
$$;

create or replace function match_message_chunks(
  query_embedding vector(1536),
  query_text text,
  match_count int default 10,
  filter_date date default null
)
returns table (
  id bigint, report_date date, added_at timestamptz, author text,
  content text, score double precision
)
language sql
stable
security invoker
as $$
  with semantic as (
    select m.id, row_number() over (order by m.embedding <=> query_embedding) as rank
    from message_chunks m
    where filter_date is null or m.report_date = filter_date
    order by m.embedding <=> query_embedding
    limit match_count * 4
  ),
  keyword as (
    select m.id,
      row_number() over (
        order by ts_rank_cd(m.fts, websearch_to_tsquery('english', query_text)) desc
      ) as rank
    from message_chunks m
    where (filter_date is null or m.report_date = filter_date)
      and m.fts @@ websearch_to_tsquery('english', query_text)
    order by rank
    limit match_count * 4
  )
  select m.id, m.report_date, m.added_at, m.author, m.content,
    coalesce(1.0 / (60 + s.rank), 0.0) + coalesce(1.0 / (60 + k.rank), 0.0) as score
  from semantic s
  full outer join keyword k on s.id = k.id
  join message_chunks m on m.id = coalesce(s.id, k.id)
  order by score desc
  limit match_count;
$$;


-- ------------------------------------------------------------------------------- check it
-- Run these afterwards to confirm. Every table should show rls_on = true, and
-- integration_connections should have no policies and no anon/authenticated privileges.
--
-- select relname as table_name, relrowsecurity as rls_on
-- from pg_class
-- where relnamespace = 'public'::regnamespace and relkind = 'r'
-- order by relname;
--
-- select tablename, policyname, cmd, roles from pg_policies
-- where schemaname = 'public' order by tablename, policyname;
--
-- select grantee, privilege_type from information_schema.role_table_grants
-- where table_name = 'integration_connections' and grantee in ('anon', 'authenticated');

