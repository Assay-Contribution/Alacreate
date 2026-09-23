-- Run this in Supabase: Project > SQL Editor > New query
-- Adds timeline support (links/files/notes) to contribution_reports,
-- and creates the report-attachments storage bucket + access policies.
-- Safe to run once against the schema already created by schema.sql.

-- 1. New columns for the timeline's links, files, and notes.
alter table contribution_reports
  add column if not exists links jsonb not null default '[]'::jsonb,
  add column if not exists files jsonb not null default '[]'::jsonb,
  add column if not exists notes jsonb not null default '[]'::jsonb;

-- 2. Relax north_star / next_steps so a brand-new day can be created empty
--    and filled in gradually, instead of requiring a complete report up
--    front (the old single-submit form required this; the timeline doesn't).
alter table contribution_reports
  alter column north_star drop not null,
  alter column north_star set default '';

alter table contribution_reports
  alter column next_steps set default '[]'::jsonb;

-- Drop whatever the north_star / next_steps CHECK constraints are actually
-- named in this project (they may not match Postgres's default naming, e.g.
-- "next_steps_valid" instead of "contribution_reports_next_steps_check") by
-- finding them from their definition instead of guessing the name.
do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'contribution_reports'::regclass
      and contype = 'c'
      and (
        pg_get_constraintdef(oid) ilike '%north_star%'
        or pg_get_constraintdef(oid) ilike '%next_steps%'
      )
  loop
    execute format('alter table contribution_reports drop constraint %I', r.conname);
  end loop;
end $$;

-- 3. Storage bucket for uploaded files (images, PDFs, etc).
--    Public so the app's getPublicUrl() calls resolve directly — fine for
--    an initial product; paths are namespaced by user id, not truly private.
insert into storage.buckets (id, name, public)
values ('report-attachments', 'report-attachments', true)
on conflict (id) do nothing;

-- 4. Storage policies: a user may only write inside their own folder.
--    Path convention used by the app: "<user_id>/<date>/<timestamp>-<filename>".
--    No SELECT policy is needed — public read comes from the bucket's
--    public flag above, not from RLS.
drop policy if exists "Users can upload to their own folder" on storage.objects;
create policy "Users can upload to their own folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'report-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can update their own files" on storage.objects;
create policy "Users can update their own files"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'report-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete their own files" on storage.objects;
create policy "Users can delete their own files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'report-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);
