-- Folders someone created on purpose, so a folder can exist before it has a file. A folder
-- still exists, as before, while some file is under it; this table only adds the empty ones.
create table folders (
  path text primary key check (path like '/%/'),
  created_at timestamptz not null default now()
);
