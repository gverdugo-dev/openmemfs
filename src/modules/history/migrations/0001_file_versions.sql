-- The version history of every file. A version is the whole file (path, content and
-- metadata) as one author left it; saves by the same author close together fold into one.
create table file_versions (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references files (id) on delete cascade,
  version integer not null,
  path text not null,
  content text not null,
  metadata jsonb not null,
  author text not null check (author in ('user', 'agent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (file_id, version)
);
