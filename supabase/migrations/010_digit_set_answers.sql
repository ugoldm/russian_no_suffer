-- Explicit normalization for short answers containing an unordered set of digits.
-- Stored answer text, keys, versions, and submitted scores are preserved.
create or replace function private.grade(e jsonb, raw jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare submitted text[]; expected text[]; val text; candidate text;
  digit_set boolean := e->>'type'='text' and coalesce((e#>>'{normalization,digitSet}')::boolean,false);
begin
  if e->>'type'='multiple' then
    raw:=coalesce(raw,'[]'::jsonb);
    if jsonb_typeof(raw)<>'array' then raise exception 'Некорректные варианты ответа.'; end if;
    if exists(select 1 from jsonb_array_elements(raw) r where jsonb_typeof(r)<>'string' or not exists(select 1 from jsonb_array_elements(e->'options') o where o->'id'=r)) then raise exception 'Некорректные варианты ответа.'; end if;
    select coalesce(array_agg(v order by v),'{}'::text[]) into submitted from jsonb_array_elements_text(raw) v;
    if cardinality(submitted)<>(select count(distinct v) from unnest(submitted) v) then raise exception 'Повторяющиеся варианты ответа.'; end if;
    select array_agg(v order by v) into expected from jsonb_array_elements_text(e->'key') v;
    return cardinality(submitted)>0 and submitted=expected;
  end if;
  raw:=coalesce(nullif(raw,'null'::jsonb),'""'::jsonb);
  if jsonb_typeof(raw)<>'string' or length(raw#>>'{}')>2000 then raise exception 'Некорректный текстовый ответ.'; end if;
  val:=raw#>>'{}'; if val='' then return false; end if;
  if e->>'type'='single' and not exists(select 1 from jsonb_array_elements(e->'options') o where o->>'id'=val) then raise exception 'Некорректный вариант ответа.'; end if;
  if coalesce((e#>>'{normalization,trim}')::boolean,false) then val:=btrim(val); end if;
  if coalesce((e#>>'{normalization,ignoreCase}')::boolean,false) then val:=lower(val); end if;
  if digit_set then
    if val !~ '^[0-9]+$' or length(val)<>(select count(distinct digit) from regexp_split_to_table(val,'') digit) then return false; end if;
    select string_agg(digit,'' order by digit) into val from regexp_split_to_table(val,'') digit;
  end if;
  for candidate in select jsonb_array_elements_text(e->'key') loop
    if coalesce((e#>>'{normalization,trim}')::boolean,false) then candidate:=btrim(candidate); end if;
    if coalesce((e#>>'{normalization,ignoreCase}')::boolean,false) then candidate:=lower(candidate); end if;
    if digit_set then
      if candidate !~ '^[0-9]+$' then continue; end if;
      select string_agg(digit,'' order by digit) into candidate from regexp_split_to_table(candidate,'') digit;
    end if;
    if candidate=val then return true; end if;
  end loop;
  return false;
end $$;
