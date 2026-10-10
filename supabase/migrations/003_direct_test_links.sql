-- Replace groups and assignments with direct links to immutable test versions.
-- Preserve every existing attempt and active legacy link. Apply after 001 and 002.
begin;
alter table private.tests add column share_token text not null default (replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','')) unique;
alter table private.tests add column legacy_tokens text[] not null default '{}';
update private.tests t set legacy_tokens=coalesce((select array_agg(a.token) from private.assignments a where a.version_id=t.version_id and a.active),'{}'::text[]);
alter table private.attempts add column version_id text references private.tests(version_id);
alter table private.attempts add column teacher_id uuid references auth.users(id);
update private.attempts p set version_id=a.version_id,teacher_id=a.owner_id from private.assignments a where p.assignment_id=a.id;
alter table private.attempts alter column version_id set not null;
alter table private.attempts drop column assignment_id;
with numbered as (select id,row_number() over(partition by version_id,owner_id order by started_at,id) as n from private.attempts)
update private.attempts p set attempt_number=numbered.n from numbered where p.id=numbered.id;
alter table private.attempts add unique(version_id,owner_id,attempt_number);
create index on private.attempts(teacher_id,submitted_at);

create function private.test_by_token(token text) returns private.tests language plpgsql stable set search_path='' as $$
declare t private.tests;
begin
 select * into t from private.tests where (share_token=token or token=any(legacy_tokens)) and data->>'status'<>'draft';
 if t.version_id is null then raise exception 'Тест не найден. Проверьте ссылку.'; end if;
 return t;
end $$;
create or replace function private.result_json(p private.attempts) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',p.id,'testId',t.data->>'id','versionId',p.version_id,'name',p.name,'status',p.status,'attemptNumber',p.attempt_number,'startedAt',p.started_at,'submittedAt',p.submitted_at,'correct',p.correct,'total',p.total,'percentage',case when p.total=0 then 0 else round(p.correct*100.0/p.total)::integer end,'testTitle',t.data->>'title','exam',t.data->>'exam','taskNumber',t.data->'taskNumber','exercises',(select jsonb_agg(e || jsonb_build_object('rawAnswer',coalesce(p.answers->(e->>'id'),case when e->>'type'='multiple' then '[]'::jsonb else '""'::jsonb end),'correct',private.grade(e,p.answers->(e->>'id')),'correctAnswer',e->'key')) from jsonb_array_elements(t.data->'exercises') e))
 from private.tests t where t.version_id=p.version_id;
$$;
create or replace function public.teacher_overview(p_args jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_teacher();
begin return jsonb_build_object(
 'tests',coalesce((select jsonb_agg(private.public_test(data)||jsonb_build_object('shareToken',t.share_token) order by data->>'exam',(data->>'taskNumber')::int) from private.tests t where (t.owner_id=u or t.owner_id is null) and t.data->>'status'='published' and not exists(select 1 from private.tests newer where newer.data->>'id'=t.data->>'id' and newer.data->>'status'='published' and (newer.owner_id=u or newer.owner_id is null) and (newer.data->>'version')::int>(t.data->>'version')::int)),'[]'::jsonb),
 'results',coalesce((select jsonb_agg(private.result_json(p)-'exercises' order by submitted_at desc) from private.attempts p where p.teacher_id=u and p.status='submitted'),'[]'::jsonb));
end $$;
create or replace function public.teacher_result(p_args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_teacher(); p private.attempts;
begin select * into p from private.attempts where id=(p_args->>'attemptId')::uuid and status='submitted' and teacher_id=u; if p.id is null then raise exception 'Результат недоступен.'; end if;return private.result_json(p);end $$;
create or replace function public.teacher_preview(p_args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_teacher(); t jsonb;
begin
 select data into t from private.tests where data->>'id'=p_args->>'testId' and (owner_id=u or owner_id is null) and (p_args->>'versionId' is null or version_id=p_args->>'versionId') order by (data->>'version')::integer desc limit 1;
 if t is null then raise exception 'Тест не найден.';end if;
 return t||jsonb_build_object('exerciseCount',jsonb_array_length(t->'exercises'));
end $$;
create function public.get_test(p_args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_user(); t private.tests:=private.test_by_token(p_args->>'token');
begin return private.public_test(t.data);end $$;
create or replace function public.start_attempt(p_args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_user(); t private.tests; p private.attempts; n integer; teacher uuid;
begin
 t:=private.test_by_token(p_args->>'token');
 -- Serialize creation so retries have distinct sequence numbers for this version.
 perform 1 from private.tests where version_id=t.version_id for update;
 select * into t from private.tests where version_id=t.version_id;
 if t.data->>'status'<>'published' then raise exception 'Тест больше не доступен для новых попыток.';end if;
 teacher:=t.owner_id;
 -- The synthetic shared demo belongs to the sole allowlisted teacher in this MVP.
 if teacher is null then
   if (select count(*) from private.teachers)<>1 then raise exception 'Назначьте владельца демонстрационного теста.';end if;
   select user_id into teacher from private.teachers;
 end if;
 select count(*)+1 into n from private.attempts where owner_id=u and version_id=t.version_id;
 if n>30 then raise exception 'Достигнут лимит попыток для этого теста.';end if;
 insert into private.attempts(version_id,teacher_id,owner_id,name,attempt_number) values(t.version_id,teacher,u,private.clean_name(p_args->>'name'),n) returning * into p;
 return jsonb_build_object('id',p.id,'versionId',p.version_id,'name',p.name,'status',p.status);
end $$;
create or replace function public.get_attempt(p_args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_user(); p private.attempts;
begin select * into p from private.attempts where id=(p_args->>'attemptId')::uuid and owner_id=u;if p.id is null then raise exception 'Попытка недоступна.';end if;
 if p.status='submitted' then return private.result_json(p);end if;
 return jsonb_build_object('id',p.id,'versionId',p.version_id,'name',p.name,'status',p.status);
end $$;
create or replace function public.submit_attempt(p_args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_user(); p private.attempts; t jsonb; submitted_answers jsonb:=p_args->'answers'; e jsonb; correct_count integer:=0; total_count integer;
begin
 select * into p from private.attempts where id=(p_args->>'attemptId')::uuid and owner_id=u for update;
 if p.id is null then raise exception 'Попытка недоступна.';end if;
 if p.status='submitted' then return private.result_json(p);end if;
 if jsonb_typeof(submitted_answers) is distinct from 'object' or octet_length(submitted_answers::text)>65536 then raise exception 'Некорректные ответы.';end if;
 select data into t from private.tests where version_id=p.version_id;
 if exists(select 1 from jsonb_object_keys(submitted_answers) k where not exists(select 1 from jsonb_array_elements(t->'exercises') e0 where e0->>'id'=k)) then raise exception 'В ответах есть упражнение из другого теста.';end if;
 total_count:=jsonb_array_length(t->'exercises');if total_count=0 then raise exception 'В тесте нет упражнений.';end if;
 for e in select jsonb_array_elements(t->'exercises') loop if private.grade(e,submitted_answers->(e->>'id')) then correct_count:=correct_count+1;end if;end loop;
 update private.attempts set answers=submitted_answers,correct=correct_count,total=total_count,status='submitted',submitted_at=now() where id=p.id returning * into p;
 return private.result_json(p);
end $$;

drop function public.teacher_group(jsonb),public.teacher_issue(jsonb),public.teacher_close(jsonb),public.get_assignment(jsonb);
drop function private.group_json(private.groups),private.assignment_json(private.assignments);
drop table private.assignments;
drop table private.groups;
revoke all on all functions in schema private from public,anon,authenticated;
revoke all on function public.get_test(jsonb) from public,anon;
grant execute on function public.get_test(jsonb) to authenticated;
commit;
