-- All new submissions require every answer; saved historical results stay unchanged.
begin;
create function private.answer_filled(e jsonb, raw jsonb) returns boolean
language sql immutable set search_path='' as $$
 select case when e->>'type'='multiple' then
   case when jsonb_typeof(raw)='array' then jsonb_array_length(raw)>0 else false end
 else coalesce(jsonb_typeof(raw)='string' and length(btrim(raw #>> '{}', U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))>0,false) end;
$$;
revoke all on function private.answer_filled(jsonb,jsonb) from public,anon,authenticated;
create or replace function public.submit_attempt(p_args jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_user(); p private.attempts; t jsonb; submitted_answers jsonb:=p_args->'answers'; e jsonb; correct_count integer:=0; total_count integer; missing text;
begin
 select * into p from private.attempts where id=(p_args->>'attemptId')::uuid and owner_id=u for update;
 if p.id is null then raise exception 'Попытка недоступна.';end if;
 if p.status='submitted' then return private.result_json(p);end if;
 if jsonb_typeof(submitted_answers) is distinct from 'object' or octet_length(submitted_answers::text)>65536 then raise exception 'Некорректные ответы.';end if;
 select data into t from private.tests where version_id=p.version_id;
 if exists(select 1 from jsonb_object_keys(submitted_answers) k where not exists(select 1 from jsonb_array_elements(t->'exercises') e0 where e0->>'id'=k)) then raise exception 'В ответах есть упражнение из другого теста.';end if;
 select string_agg('Упражнение ' || n || case when e0->>'type'='group' then ', задание № ' || coalesce(item.exercise->>'taskNumber',item.exercise->>'id') else '' end, '; ' order by n, child_n) into missing
 from jsonb_array_elements(t->'exercises') with ordinality as parent(e0,n)
 cross join lateral private.answer_items(e0,submitted_answers->(e0->>'id')) with ordinality as item(exercise,answer,child_n)
 where not private.answer_filled(item.exercise,item.answer);
 if missing is not null then raise exception 'Нельзя сдать работу: ответьте на все задания. Без ответа: %.',missing;end if;
 select count(*),count(*) filter(where private.grade(item.exercise,item.answer)) into total_count,correct_count
 from jsonb_array_elements(t->'exercises') e0 cross join lateral private.answer_items(e0,submitted_answers->(e0->>'id')) item;
 if total_count=0 then raise exception 'В тесте нет упражнений.';end if;
 update private.attempts set answers=submitted_answers,correct=correct_count,total=total_count,status='submitted',submitted_at=now(),teacher_seen=false where id=p.id returning * into p;
 return private.result_json(p);
end $$;

commit;
