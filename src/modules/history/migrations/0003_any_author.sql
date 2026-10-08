-- An author is whoever a module names (an email, say), not only 'user' or 'agent'.
alter table file_versions drop constraint if exists file_versions_author_check;
alter table file_versions add constraint file_versions_author_length check (length(author) between 1 and 200);
