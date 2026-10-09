-- Suggestions: an edit waiting for the owner. Someone (usually an agent) proposes replacing an
-- exact piece of a file with new text and says why; the file does not change until the owner
-- accepts it. Rejected ones are kept, because they tell an agent what the owner does not want.
-- Whether one is stale (its old text no longer appears exactly once) is worked out on reading.
create table suggestions_items (
  id integer generated always as identity primary key,
  file_id uuid not null references files (id) on delete cascade,
  old_string text not null check (length(old_string) > 0),
  new_string text not null,
  reason text not null default '',
  author text not null check (length(author) between 1 and 200),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (old_string <> new_string)
);
create index suggestions_items_pending on suggestions_items (file_id) where status = 'pending';
