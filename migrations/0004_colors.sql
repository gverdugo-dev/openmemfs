-- Every tag, category and subcategory has a colour, one of a fixed palette that the interface
-- knows how to draw. The names are the contract; the shades live in src/styles.css.
alter table tags add column color text not null default 'gray';
alter table tags add constraint tags_color check (color in ('gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'));
alter table categories add column color text not null default 'gray';
alter table categories add constraint categories_color check (color in ('gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'));
