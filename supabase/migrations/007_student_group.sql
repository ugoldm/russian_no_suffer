-- A student selects a schedule label for each new work. Existing work stays unassigned.
begin;
alter table private.attempts add column student_group text check (student_group in (
 'ПН 17:30','ПН 18:30','ПН 19:30',
 'ВТ 11:00','ВТ 16:30','ВТ 18:00','ВТ 19:30',
 'СР 17:00','СР 18:30','СР 19:30',
 'ЧТ 17:00','ЧТ 18:00','ЧТ 19:30',
 'ПТ 17:30','ПТ 18:30','ВС 11:30'
));

create function private.student_group(day text, start_time text)
returns text language plpgsql immutable set search_path='' as $$
declare label text;
begin
 select short || ' ' || start_time into label
 from (values
  ('monday','ПН',array['17:30','18:30','19:30']),
  ('tuesday','ВТ',array['11:00','16:30','18:00','19:30']),
  ('wednesday','СР',array['17:00','18:30','19:30']),
  ('thursday','ЧТ',array['17:00','18:00','19:30']),
  ('friday','ПТ',array['17:30','18:30']),
  ('sunday','ВС',array['11:30'])
 ) as schedule(day_id,short,times)
 where day_id=day and start_time=any(times);
 if label is null then raise exception 'Выберите день и время занятий из списка.'; end if;
 return label;
end $$;
revoke all on function private.student_group(text,text) from public,anon,authenticated;

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
  'exercises',(select jsonb_agg(e || jsonb_build_object(
   'rawAnswer',coalesce(p.answers->(e->>'id'),case when e->>'type'='multiple' then '[]'::jsonb else '""'::jsonb end),
   'correct',private.grade(e,p.answers->(e->>'id')),'correctAnswer',e->'key'
  )) from jsonb_array_elements(t.data->'exercises') e)
 ) from private.tests t where t.version_id=p.version_id;
$$;

create or replace function public.start_attempt(p_args jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_user(); t private.tests; p private.attempts; n integer; teacher uuid;
begin
 t:=private.test_by_token(p_args->>'token');
 perform 1 from private.tests where version_id=t.version_id for update;
 select * into t from private.tests where version_id=t.version_id;
 if t.data->>'status'<>'published' then raise exception 'Тест больше не доступен для новых попыток.';end if;
 teacher:=t.owner_id;
 if teacher is null then
   if (select count(*) from private.teachers)<>1 then raise exception 'Назначьте владельца демонстрационного теста.';end if;
   select user_id into teacher from private.teachers;
 end if;
 select count(*)+1 into n from private.attempts where owner_id=u and version_id=t.version_id;
 if n>30 then raise exception 'Достигнут лимит попыток для этого теста.';end if;
 insert into private.attempts(version_id,teacher_id,owner_id,name,attempt_number,student_group)
 values(t.version_id,teacher,u,private.clean_name(p_args->>'name'),n,private.student_group(p_args->>'groupDay',p_args->>'groupTime')) returning * into p;
 return jsonb_build_object('id',p.id,'versionId',p.version_id,'name',p.name,'group',p.student_group,'status',p.status);
end $$;

create or replace function public.get_attempt(p_args jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_user(); p private.attempts;
begin
 select * into p from private.attempts where id=(p_args->>'attemptId')::uuid and owner_id=u;
 if p.id is null then raise exception 'Попытка недоступна.';end if;
 if p.status='submitted' then return private.result_json(p);end if;
 return jsonb_build_object('id',p.id,'versionId',p.version_id,'name',p.name,'group',p.student_group,'status',p.status);
end $$;
commit;
