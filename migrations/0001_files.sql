-- The working tree: one row per file. Folders are not stored; a folder exists while some
-- file path starts with it.
create table files (
  id uuid primary key default gen_random_uuid(),
  path text not null unique,
  content text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint files_path_shape check (path ~ '^/[^/]' and path !~ '/$'),
  constraint files_metadata_object check (jsonb_typeof(metadata) = 'object')
);
