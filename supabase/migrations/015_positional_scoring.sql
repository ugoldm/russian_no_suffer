-- Explicit five-position matching rule: 0–2 matches = 0, 3–4 = 1, 5 = 2.
-- No existing content or saved totals are modified.
begin;
create or replace function private.maximum_points(e jsonb) returns integer
language sql immutable set search_path='' as $$
 select case when e->'scoring'->>'type'='positional' then 2 else 1 end;
$$;
create or replace function private.score_answer(e jsonb, raw jsonb) returns integer
language plpgsql immutable set search_path='' as $$
declare full_match boolean; matches integer; answer text;
begin
 full_match:=private.grade(e,raw);
 if e->'scoring'->>'type' is distinct from 'positional' then return case when full_match then 1 else 0 end; end if;
 answer:=raw #>> '{}';
 if jsonb_typeof(raw) is distinct from 'string' or answer !~ '^[1-9]{5}$' then return 0;end if;
 select max(n) into matches from (
  select count(*) filter(where substr(k,position,1)=substr(answer,position,1)) n
  from jsonb_array_elements_text(e->'key') k cross join generate_series(1,5) position group by k
 ) counts;
 return case when matches=5 then 2 when matches>=3 then 1 else 0 end;
end $$;
revoke all on function private.maximum_points(jsonb),private.score_answer(jsonb,jsonb) from public,anon,authenticated;
create or replace function private.result_exercise(e jsonb, raw jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare items jsonb; score integer; total integer;
begin
 if e->>'type'='group' then
  select jsonb_agg(private.result_exercise(exercise,answer) order by n),sum(private.score_answer(exercise,answer)),sum(private.maximum_points(exercise)) into items,score,total from private.answer_items(e,raw) with ordinality as child(exercise,answer,n);
  return e || jsonb_build_object('items',items,'rawAnswer',coalesce(nullif(raw,'null'::jsonb),'{}'::jsonb),'correct',score=total,'score',score,'total',total);
 end if;
 return e || jsonb_build_object('rawAnswer',coalesce(raw,case when e->>'type'='multiple' then '[]'::jsonb else '""'::jsonb end),'correct',private.grade(e,raw),'correctAnswer',e->'key') || case when e ? 'scoring' then jsonb_build_object('score',private.score_answer(e,raw),'total',private.maximum_points(e)) else '{}'::jsonb end;
end $$;
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
 select sum(private.maximum_points(item.exercise)),sum(private.score_answer(item.exercise,item.answer)) into total_count,correct_count
 from jsonb_array_elements(t->'exercises') e0 cross join lateral private.answer_items(e0,submitted_answers->(e0->>'id')) item;
 if total_count=0 then raise exception 'В тесте нет упражнений.';end if;
 update private.attempts set answers=submitted_answers,correct=correct_count,total=total_count,status='submitted',submitted_at=now(),teacher_seen=false where id=p.id returning * into p;
 return private.result_json(p);
end $$;


commit;
