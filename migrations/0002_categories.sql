-- Categories, two levels deep: a row without a parent is a category, a row with one is a
-- subcategory of it. A file belongs to at most one of them, through files.category_id; the
-- category of a file in a subcategory is that subcategory's parent, so it is never stored twice.
create table categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references categories (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  constraint categories_name_shape check (name = btrim(name) and length(name) between 1 and 64),
  constraint categories_not_own_parent check (parent_id <> id)
);

-- Names are unique, ignoring case, among the categories and among the subcategories of one parent.
create unique index categories_top_name on categories (lower(name)) where parent_id is null;
create unique index categories_sub_name on categories (parent_id, lower(name)) where parent_id is not null;

alter table files add column category_id uuid references categories (id) on delete set null;
create index files_category on files (category_id);
