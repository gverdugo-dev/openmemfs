-- Deleting a file moves it to the trash: the row stays, with its history, until the trash is
-- emptied. A trashed file gives up its path, so a new file can take it; only live files must
-- have different paths.
alter table files add column deleted_at timestamptz;
alter table files drop constraint files_path_key;
create unique index files_live_path on files (path) where deleted_at is null;
create index files_trash on files (deleted_at) where deleted_at is not null;
