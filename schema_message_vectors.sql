-- Run this in Supabase: Project > SQL Editor > New query
-- Makes chat messages searchable by the AI (query_history): one row per
-- message (the user's notes and the AI's replies) with an OpenAI embedding.
-- Requires the `vector` extension and is safe to run more than once.

create extension if not exists vector;

-- 1. One row per message. Messages live in contribution_reports.notes; they're identified
--    here by the user, the time they were added, and who wrote them.
create table if not exists message_chunks (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  report_date date not null,
  added_at timestamptz not null,
  author text not null check (author in ('user', 'assistant')),
  content text not null,
  -- text-embedding-3-small returns 1536 numbers.
  embedding vector(1536) not null,
  fts tsvector generated always as (to_tsvector('english', content)) stored,
  unique (user_id, added_at, author)
);

create index if not exists message_chunks_user_date_idx on message_chunks (user_id, report_date);
create index if not exists message_chunks_embedding_idx
  on message_chunks using hnsw (embedding vector_cosine_ops);
create index if not exists message_chunks_fts_idx on message_chunks using gin (fts);

-- 2. Users can read and delete their own messages' search rows (deleting a note removes
--    it from search). Only the server writes them, after embedding.
alter table message_chunks enable row level security;

drop policy if exists "Users can read their own message chunks" on message_chunks;
create policy "Users can read their own message chunks"
on message_chunks for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can delete their own message chunks" on message_chunks;
create policy "Users can delete their own message chunks"
on message_chunks for delete
to authenticated
using (user_id = auth.uid());

-- 3. Hybrid search over messages: meaning (embedding) + keywords, ranked together.
--    Pass filter_date to search one day, or null for everything (what query_history
--    does). Runs with the caller's permissions, so RLS limits results to the signed-in
--    user's own messages.
create or replace function match_message_chunks(
  query_embedding vector(1536),
  query_text text,
  match_count int default 10,
  filter_date date default null
)
returns table (
  id bigint,
  report_date date,
  added_at timestamptz,
  author text,
  content text,
  score double precision
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
