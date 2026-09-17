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

-- Daily contribution reports are linked to Supabase Auth users.
-- Enable email/password sign-ins in the Supabase dashboard before using
-- the reporting page. Configure email confirmation to match your workflow.
create table contribution_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  report_date date not null default current_date,
  north_star text not null,
  next_steps jsonb not null,
  morning_report text,
  midday_report text,
  final_report text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, report_date)
);

alter table contribution_reports enable row level security;

create policy "Users can read their own reports"
on contribution_reports
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can create their own reports"
on contribution_reports
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own reports"
on contribution_reports
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
