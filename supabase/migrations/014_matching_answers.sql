-- A matching answer keeps one character per column, including empty slots.
-- Require every column before accepting a new submission; saved work is unchanged.
begin;
create or replace function private.answer_filled(e jsonb, raw jsonb) returns boolean
language sql immutable set search_path='' as $$
 select case
 when e->>'type'='multiple' then
   case when jsonb_typeof(raw)='array' then jsonb_array_length(raw)>0 else false end
 when e->>'type'='text' and e ? 'matchingTable' then
   coalesce(jsonb_typeof(raw)='string'
     and length(raw #>> '{}')=jsonb_array_length(e->'matchingTable'->'left')
     and not exists(select 1 from regexp_split_to_table(raw #>> '{}','') c
       where length(btrim(c,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))=0),false)
 else coalesce(jsonb_typeof(raw)='string' and length(btrim(raw #>> '{}',U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))>0,false) end;
$$;
revoke all on function private.answer_filled(jsonb,jsonb) from public,anon,authenticated;
commit;
