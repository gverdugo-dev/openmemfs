-- A commit: a version someone named on purpose, with a message. Committing is optional;
-- versions keep coming from every save. A committed version is never folded into: the next
-- save starts a new one.
alter table file_versions add column message text;
