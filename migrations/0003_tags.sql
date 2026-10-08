-- Tags: a name, unique ignoring case, related many-to-many to files and to folders.
create table tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  constraint tags_name_shape check (name = btrim(name) and length(name) between 1 and 64)
);
create unique index tags_name on tags (lower(name));

create table file_tags (
  file_id uuid not null references files (id) on delete cascade,
  tag_id uuid not null references tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (file_id, tag_id)
);
create index file_tags_tag on file_tags (tag_id);

-- Folders are not stored (a folder exists while some file path starts with it), so a folder
-- is named by its path, with the trailing slash: "/notes/". Every file under it carries the
-- folder's tags when searching and filtering.
create table folder_tags (
  folder text not null,
  tag_id uuid not null references tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (folder, tag_id),
  constraint folder_tags_folder_shape check (folder ~ '^/[^/].*/$')
);
create index folder_tags_tag on folder_tags (tag_id);
