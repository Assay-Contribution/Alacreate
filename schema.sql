-- Run this in Supabase: Project > SQL Editor > New query

create table signups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  created_at timestamptz not null default now()
);

alter table signups
  add constraint signups_name_not_blank check (btrim(name) <> ''),
  add constraint signups_email_not_blank check (btrim(email) <> '');

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
create or replace function is_valid_contribution_tasks(value jsonb)
returns boolean
language sql
immutable
as $$
  select case
    when jsonb_typeof(value) <> 'array' then false
    else jsonb_array_length(value) between 3 and 5
      and not exists (
        select 1
        from jsonb_array_elements(value) as task
        where jsonb_typeof(task) <> 'object'
          or jsonb_typeof(task->'title') <> 'string'
          or btrim(task->>'title') = ''
          or case
            when jsonb_typeof(task->'minutes') <> 'number' then true
            else (task->>'minutes')::numeric < 1
              or (task->>'minutes')::numeric % 1 <> 0
          end
      )
  end;
$$;

create table contribution_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  report_date date not null default current_date,
  north_star text not null check (btrim(north_star) <> ''),
  next_steps jsonb not null check (is_valid_contribution_tasks(next_steps)),
  morning_report text,
  midday_report text,
  final_report text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, report_date)
);

create or replace function set_contribution_report_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger contribution_reports_set_updated_at
before update on contribution_reports
for each row
execute function set_contribution_report_updated_at();

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
