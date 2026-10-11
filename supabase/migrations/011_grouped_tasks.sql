-- Shared passages keep five screens while every child task earns one point.
begin;
create function private.public_exercise(e jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select (e-'key'-'explanation'-'normalization'-'items') ||
 case when e->>'type'='group' then jsonb_build_object('items',
 (select jsonb_agg(private.public_exercise(item) order by n) from jsonb_array_elements(e->'items') with ordinality as child(item,n))) else '{}'::jsonb end;
$$;
create or replace function private.public_test(t jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select (t-'exercises') || jsonb_build_object('exerciseCount',jsonb_array_length(t->'exercises'),
 'exercises',(select jsonb_agg(private.public_exercise(e) order by n) from jsonb_array_elements(t->'exercises') with ordinality as child(e,n)));
$$;
create function private.answer_items(e jsonb, raw jsonb) returns table(exercise jsonb, answer jsonb)
language plpgsql immutable set search_path='' as $$
begin
 if e->>'type'<>'group' then return query select e,raw; return; end if;
 raw:=coalesce(nullif(raw,'null'::jsonb),'{}'::jsonb);
 if jsonb_typeof(raw)<>'object' then raise exception 'Некорректные ответы на задания текста.';end if;
 if exists(select 1 from jsonb_object_keys(raw) id where not exists(select 1 from jsonb_array_elements(e->'items') item where item->>'id'=id)) then raise exception 'Некорректные ответы на задания текста.';end if;
 return query select item,raw->(item->>'id') from jsonb_array_elements(e->'items') item;
end $$;
create function private.result_exercise(e jsonb, raw jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare items jsonb; score integer;
begin
 if e->>'type'='group' then
  select jsonb_agg(private.result_exercise(exercise,answer) order by n),count(*) filter(where private.grade(exercise,answer)) into items,score from private.answer_items(e,raw) with ordinality as child(exercise,answer,n);
  return e || jsonb_build_object('items',items,'rawAnswer',coalesce(nullif(raw,'null'::jsonb),'{}'::jsonb),'correct',score=jsonb_array_length(items),'score',score,'total',jsonb_array_length(items));
 end if;
 return e || jsonb_build_object('rawAnswer',coalesce(raw,case when e->>'type'='multiple' then '[]'::jsonb else '""'::jsonb end),'correct',private.grade(e,raw),'correctAnswer',e->'key');
end $$;
revoke all on function private.public_exercise(jsonb),private.answer_items(jsonb,jsonb),private.result_exercise(jsonb,jsonb) from public,anon,authenticated;
create or replace function private.result_json(p private.attempts)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object(
  'id',p.id,'testId',t.data->>'id','versionId',p.version_id,'name',p.name,
  'group',p.student_group,'status',p.status,'attemptNumber',p.attempt_number,
  'startedAt',p.started_at,'submittedAt',p.submitted_at,
  'durationSeconds',case when p.started_at is null or p.submitted_at is null then null else greatest(0,floor(extract(epoch from (p.submitted_at-p.started_at))))::bigint end,
  'correct',p.correct,'total',p.total,
  'percentage',case when p.total=0 then 0 else round(p.correct*100.0/p.total)::integer end,
  'testTitle',t.data->>'title','exam',t.data->>'exam','taskNumber',t.data->'taskNumber',
  'exercises',(select jsonb_agg(private.result_exercise(e,p.answers->(e->>'id')) order by n) from jsonb_array_elements(t.data->'exercises') with ordinality as child(e,n))
 ) from private.tests t where t.version_id=p.version_id;
$$;
create or replace function public.submit_attempt(p_args jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_user(); p private.attempts; t jsonb; submitted_answers jsonb:=p_args->'answers'; e jsonb; correct_count integer:=0; total_count integer;
begin
 select * into p from private.attempts where id=(p_args->>'attemptId')::uuid and owner_id=u for update;
 if p.id is null then raise exception 'Попытка недоступна.';end if;
 if p.status='submitted' then return private.result_json(p);end if;
 if jsonb_typeof(submitted_answers) is distinct from 'object' or octet_length(submitted_answers::text)>65536 then raise exception 'Некорректные ответы.';end if;
 select data into t from private.tests where version_id=p.version_id;
 if exists(select 1 from jsonb_object_keys(submitted_answers) k where not exists(select 1 from jsonb_array_elements(t->'exercises') e0 where e0->>'id'=k)) then raise exception 'В ответах есть упражнение из другого теста.';end if;
 select count(*),count(*) filter(where private.grade(item.exercise,item.answer)) into total_count,correct_count
 from jsonb_array_elements(t->'exercises') e0 cross join lateral private.answer_items(e0,submitted_answers->(e0->>'id')) item;
 if total_count=0 then raise exception 'В тесте нет упражнений.';end if;
 update private.attempts set answers=submitted_answers,correct=correct_count,total=total_count,status='submitted',submitted_at=now(),teacher_seen=false where id=p.id returning * into p;
 return private.result_json(p);
end $$;

commit;
