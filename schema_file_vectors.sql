-- Run this in Supabase: Project > SQL Editor > New query
-- Adds searchable file contents for the AI: a `files` table (one row per upload) and
-- `file_chunks` (the file's text split into sections, each with an OpenAI embedding).
-- Requires the `vector` extension (Database > Extensions). Safe to run more than once.

create extension if not exists vector;

-- 1. One row per uploaded file. The file itself stays in the report-attachments bucket.
create table if not exists files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  report_date date not null,
  name text not null,
  path text not null unique,
  size bigint not null default 0,
  -- pending -> processing -> ready | unsupported | failed (set by the server, not users)
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'ready', 'unsupported', 'failed')),
  error text,
  page_count int,
  chunk_count int,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists files_user_date_idx on files (user_id, report_date);

alter table files enable row level security;

drop policy if exists "Users can read their own files" on files;
create policy "Users can read their own files"
on files for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can add their own files" on files;
create policy "Users can add their own files"
on files for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can delete their own files" on files;
create policy "Users can delete their own files"
on files for delete
to authenticated
using (user_id = auth.uid());

-- 2. The file's text in sections, each with its embedding. Deleting a file deletes its
--    chunks automatically (on delete cascade). Users can read their own chunks but
--    cannot write them; only the server's processing step does.
create table if not exists file_chunks (
  id bigint generated always as identity primary key,
  file_id uuid not null references files (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  chunk_index int not null,
  page_start int,
  page_end int,
  content text not null,
  -- text-embedding-3-small returns 1536 numbers per chunk.
  embedding vector(1536) not null,
  fts tsvector generated always as (to_tsvector('english', content)) stored,
  unique (file_id, chunk_index)
);

create index if not exists file_chunks_file_idx on file_chunks (file_id);
create index if not exists file_chunks_embedding_idx
  on file_chunks using hnsw (embedding vector_cosine_ops);
create index if not exists file_chunks_fts_idx on file_chunks using gin (fts);

alter table file_chunks enable row level security;

drop policy if exists "Users can read their own chunks" on file_chunks;
create policy "Users can read their own chunks"
on file_chunks for select
to authenticated
using (user_id = auth.uid());

-- 3. Hybrid search: combines meaning-based (embedding) and keyword matches, then ranks
--    them together. Pass filter_file_id to search one file, or null for all files.
--    Runs with the caller's permissions (security invoker), so RLS limits results to
--    the signed-in user's own chunks.
create or replace function match_file_chunks(
  query_embedding vector(1536),
  query_text text,
  match_count int default 5,
  filter_file_id uuid default null
)
returns table (
  id bigint,
  file_id uuid,
  chunk_index int,
  page_start int,
  page_end int,
  content text,
  score double precision
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
