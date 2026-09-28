-- Run this in Supabase: Project > SQL Editor > New query
-- Stores generated weekly reports (one per user per week; generating again replaces it).
-- Daily reports live in contribution_reports.final_report. Safe to run more than once.

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

alter table weekly_reports enable row level security;

drop policy if exists "Users can read their own weekly reports" on weekly_reports;
create policy "Users can read their own weekly reports"
on weekly_reports for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can add their own weekly reports" on weekly_reports;
create policy "Users can add their own weekly reports"
on weekly_reports for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can replace their own weekly reports" on weekly_reports;
create policy "Users can replace their own weekly reports"
on weekly_reports for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can delete their own weekly reports" on weekly_reports;
create policy "Users can delete their own weekly reports"
on weekly_reports for delete
to authenticated
using (user_id = auth.uid());
