-- Remove the synthetic EGE 4 test from the catalog without deleting saved work.
-- Apply after 012. Safe to run again; other tests and their links are unchanged.
begin;

update private.tests
set data = jsonb_set(data, '{status}', '"archived"'::jsonb)
where data->>'id' = 'ege-4-demo'
  and data->>'status' is distinct from 'archived';

commit;
