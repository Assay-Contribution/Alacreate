-- Run this in Supabase: Project > SQL Editor > New query

create table signups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  created_at timestamptz not null default now()
);

-- Enable Row Level Security
alter table signups enable row level security;

-- Allow anyone (anon key) to INSERT a signup, but not read/update/delete
create policy "Allow public inserts"
on signups
for insert
to anon
with check (true);
