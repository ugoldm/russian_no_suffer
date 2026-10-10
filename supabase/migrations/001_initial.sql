-- Apply once, in order. All learning content, keys and personal records are private.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.teachers(user_id uuid primary key references auth.users(id));
create table private.tests(version_id text primary key, owner_id uuid references auth.users(id), data jsonb not null);
create table private.groups(id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id), name text not null check(length(name) between 1 and 80), archived boolean not null default false);
create table private.assignments(id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id), version_id text not null references private.tests(version_id), group_id uuid references private.groups(id), group_name text not null, title text not null check(length(title) between 1 and 120), token text not null unique, active boolean not null default true, created_at timestamptz not null default now());
create table private.attempts(id uuid primary key default gen_random_uuid(), assignment_id uuid not null references private.assignments(id), owner_id uuid not null references auth.users(id), name text not null check(length(name) between 1 and 80), status text not null default 'started' check(status in ('started','submitted')), attempt_number integer not null, started_at timestamptz not null default now(), submitted_at timestamptz, answers jsonb not null default '{}', correct integer not null default 0, total integer not null default 0, unique(assignment_id,owner_id,attempt_number));
create index on private.attempts(owner_id,assignment_id);
create index on private.assignments(owner_id);
create index on private.groups(owner_id);
alter table private.teachers enable row level security;
alter table private.tests enable row level security;
alter table private.groups enable row level security;
alter table private.assignments enable row level security;
alter table private.attempts enable row level security;
-- No direct table policies: only the restricted functions below can access records.
revoke all on all tables in schema private from public, anon, authenticated;

create function private.require_user() returns uuid language plpgsql stable set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Начните сессию для доступа к работе.' using errcode='42501'; end if;
  return auth.uid();
end $$;
create function private.require_teacher() returns uuid language plpgsql stable set search_path='' as $$
declare u uuid := private.require_user();
begin
  if coalesce((auth.jwt()->>'is_anonymous')::boolean,false) or not exists(select 1 from private.teachers where user_id=u) then raise exception 'Доступ только для преподавателя.' using errcode='42501'; end if;
  return u;
end $$;
create function private.clean_name(v text) returns text language plpgsql immutable set search_path='' as $$
begin if v is null or length(btrim(v)) not between 1 and 80 then raise exception 'Введите имя от 1 до 80 символов.'; end if; return btrim(v); end $$;
create function private.public_test(t jsonb) returns jsonb language sql immutable set search_path='' as $$
  select (t-'exercises') || jsonb_build_object('exerciseCount',jsonb_array_length(t->'exercises'),'exercises',coalesce((select jsonb_agg(e-'key'-'explanation'-'normalization') from jsonb_array_elements(t->'exercises') e),'[]'::jsonb));
$$;
create function private.group_json(g private.groups) returns jsonb language sql immutable set search_path='' as $$ select jsonb_build_object('id',g.id,'name',g.name,'archived',g.archived); $$;
create function private.assignment_json(a private.assignments) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',a.id,'token',a.token,'versionId',a.version_id,'groupId',a.group_id,'groupName',a.group_name,'title',a.title,'active',a.active,'createdAt',a.created_at,'test',private.public_test(t.data),'attemptCount',(select count(*) from private.attempts where assignment_id=a.id and status='submitted')) from private.tests t where t.version_id=a.version_id;
$$;
create function private.grade(e jsonb, raw jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare submitted text[]; expected text[]; val text; candidate text;
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
  raw:=coalesce(raw,'""'::jsonb);
  if jsonb_typeof(raw)<>'string' or length(raw#>>'{}')>2000 then raise exception 'Некорректный текстовый ответ.'; end if;
  val:=raw#>>'{}'; if val='' then return false; end if;
  if e->>'type'='single' and not exists(select 1 from jsonb_array_elements(e->'options') o where o->>'id'=val) then raise exception 'Некорректный вариант ответа.'; end if;
  if coalesce((e#>>'{normalization,trim}')::boolean,false) then val:=btrim(val); end if;
  if coalesce((e#>>'{normalization,ignoreCase}')::boolean,false) then val:=lower(val); end if;
  for candidate in select jsonb_array_elements_text(e->'key') loop
    if coalesce((e#>>'{normalization,trim}')::boolean,false) then candidate:=btrim(candidate); end if;
    if coalesce((e#>>'{normalization,ignoreCase}')::boolean,false) then candidate:=lower(candidate); end if;
    if candidate=val then return true; end if;
  end loop;
  return false;
end $$;
create function private.result_json(p private.attempts) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',p.id,'assignmentId',p.assignment_id,'versionId',a.version_id,'name',p.name,'status',p.status,'attemptNumber',p.attempt_number,'startedAt',p.started_at,'submittedAt',p.submitted_at,'correct',p.correct,'total',p.total,'percentage',case when p.total=0 then 0 else round(p.correct*100.0/p.total)::integer end,'testTitle',t.data->>'title','exam',t.data->>'exam','taskNumber',t.data->'taskNumber','groupName',a.group_name,'assignmentTitle',a.title,'exercises',(select jsonb_agg(e || jsonb_build_object('rawAnswer',coalesce(p.answers->(e->>'id'),case when e->>'type'='multiple' then '[]'::jsonb else '""'::jsonb end),'correct',private.grade(e,p.answers->(e->>'id')),'correctAnswer',e->'key')) from jsonb_array_elements(t.data->'exercises') e))
 from private.assignments a join private.tests t on t.version_id=a.version_id where a.id=p.assignment_id;
$$;
create function private.freeze_test() returns trigger language plpgsql set search_path='' as $$
begin
 if old.data->>'status'='published' and (new.data-'status' is distinct from old.data-'status' or new.version_id<>old.version_id or new.owner_id is distinct from old.owner_id) then raise exception 'Опубликованная версия неизменяема. Создайте новую версию.'; end if;
 return new;
end $$;
create trigger freeze_published before update on private.tests for each row execute function private.freeze_test();

create function public.teacher_overview(p_args jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_teacher();
begin return jsonb_build_object(
 'tests',coalesce((select jsonb_agg(private.public_test(data) order by data->>'exam', (data->>'taskNumber')::int) from private.tests t where (t.owner_id=u or t.owner_id is null) and t.data->>'status'='published' and not exists(select 1 from private.tests newer where newer.data->>'id'=t.data->>'id' and newer.data->>'status'='published' and (newer.owner_id=u or newer.owner_id is null) and (newer.data->>'version')::int>(t.data->>'version')::int)),'[]'::jsonb),
 'groups',coalesce((select jsonb_agg(private.group_json(g) order by name) from private.groups g where owner_id=u),'[]'::jsonb),
 'assignments',coalesce((select jsonb_agg(private.assignment_json(a) order by created_at desc) from private.assignments a where owner_id=u),'[]'::jsonb),
 'results',coalesce((select jsonb_agg(private.result_json(p)-'exercises' order by submitted_at desc) from private.attempts p join private.assignments a on a.id=p.assignment_id where a.owner_id=u and p.status='submitted'),'[]'::jsonb));
end $$;
create function public.teacher_preview(p_args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_teacher(); t jsonb;
begin select data into t from private.tests where data->>'id'=p_args->>'testId' and (owner_id=u or owner_id is null) order by (data->>'version')::integer desc limit 1;
 if t is null then raise exception 'Тест не найден.'; end if; return t||jsonb_build_object('exerciseCount',jsonb_array_length(t->'exercises'));
end $$;
create function public.teacher_group(p_args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_teacher(); g private.groups;
begin
 if p_args->>'id' is null then insert into private.groups(owner_id,name) values(u,private.clean_name(p_args->>'name')) returning * into g;
 else update private.groups set name=case when p_args ? 'name' then private.clean_name(p_args->>'name') else name end, archived=case when p_args ? 'archived' then (p_args->>'archived')::boolean else archived end where id=(p_args->>'id')::uuid and owner_id=u returning * into g;
 if g.id is null then raise exception 'Группа недоступна.'; end if;
 end if;return private.group_json(g);
end $$;
create function public.teacher_issue(p_args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_teacher(); t private.tests; g private.groups; a private.assignments; title text;
begin
 select * into t from private.tests where data->>'id'=p_args->>'testId' and data->>'status'='published' and (owner_id=u or owner_id is null) order by (data->>'version')::int desc limit 1;
 if t.version_id is null then raise exception 'Тест недоступен.'; end if;
 if p_args->>'groupId' is not null then select * into g from private.groups where id=(p_args->>'groupId')::uuid and owner_id=u and not archived; if g.id is null then raise exception 'Группа недоступна.'; end if; end if;
 title:=coalesce(nullif(btrim(p_args->>'title'),''),t.data->>'title');
 if length(title)>120 then raise exception 'Название слишком длинное.'; end if;
 insert into private.assignments(owner_id,version_id,group_id,group_name,title,token) values(u,t.version_id,g.id,coalesce(g.name,'Без группы'),title,replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','')) returning * into a;
 return private.assignment_json(a);
end $$;
create function public.teacher_close(p_args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_teacher(); a private.assignments;
begin update private.assignments set active=false where id=(p_args->>'assignmentId')::uuid and owner_id=u returning * into a; if a.id is null then raise exception 'Выдача недоступна.'; end if;return private.assignment_json(a);end $$;
create function public.teacher_result(p_args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_teacher(); p private.attempts;
begin select p0.* into p from private.attempts p0 join private.assignments a on a.id=p0.assignment_id where p0.id=(p_args->>'attemptId')::uuid and p0.status='submitted' and a.owner_id=u; if p.id is null then raise exception 'Результат недоступен.'; end if;return private.result_json(p);end $$;
create function public.get_assignment(p_args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_user(); a private.assignments; v jsonb;
begin select * into a from private.assignments where token=p_args->>'token';if a.id is null then raise exception 'Домашнее задание не найдено. Проверьте ссылку.';end if;v:=private.assignment_json(a);return v-'attemptCount';end $$;
create function public.start_attempt(p_args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_user(); a private.assignments; p private.attempts; n integer;
begin select * into a from private.assignments where token=p_args->>'token' for update;if a.id is null or not a.active then raise exception 'Приём новых работ завершён или ссылка недоступна.';end if;
 select count(*)+1 into n from private.attempts where owner_id=u and assignment_id=a.id;if n>30 then raise exception 'Достигнут лимит попыток для этой работы.';end if;
 insert into private.attempts(assignment_id,owner_id,name,attempt_number) values(a.id,u,private.clean_name(p_args->>'name'),n) returning * into p;
 return jsonb_build_object('id',p.id,'versionId',a.version_id,'name',p.name,'status',p.status);
end $$;
create function public.get_attempt(p_args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_user(); p private.attempts; v text;
begin select * into p from private.attempts where id=(p_args->>'attemptId')::uuid and owner_id=u;if p.id is null then raise exception 'Попытка недоступна.';end if;
 if p.status='submitted' then return private.result_json(p);end if;
 select version_id into v from private.assignments where id=p.assignment_id;return jsonb_build_object('id',p.id,'versionId',v,'name',p.name,'status',p.status);
end $$;
create function public.submit_attempt(p_args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_user(); p private.attempts; t jsonb; submitted_answers jsonb:=p_args->'answers'; e jsonb; correct_count integer:=0; total_count integer;
begin
 select * into p from private.attempts where id=(p_args->>'attemptId')::uuid and owner_id=u for update;
 if p.id is null then raise exception 'Попытка недоступна.';end if;
 if p.status='submitted' then return private.result_json(p);end if;
 if jsonb_typeof(submitted_answers) is distinct from 'object' or octet_length(submitted_answers::text)>65536 then raise exception 'Некорректные ответы.';end if;
 select tests.data into t from private.assignments a join private.tests tests on tests.version_id=a.version_id where a.id=p.assignment_id;
 if exists(select 1 from jsonb_object_keys(submitted_answers) k where not exists(select 1 from jsonb_array_elements(t->'exercises') e0 where e0->>'id'=k)) then raise exception 'В ответах есть упражнение из другого теста.';end if;
 total_count:=jsonb_array_length(t->'exercises');if total_count=0 then raise exception 'В тесте нет упражнений.';end if;
 for e in select jsonb_array_elements(t->'exercises') loop if private.grade(e,submitted_answers->(e->>'id')) then correct_count:=correct_count+1;end if;end loop;
 update private.attempts set answers=submitted_answers,correct=correct_count,total=total_count,status='submitted',submitted_at=now() where id=p.id returning * into p;
 return private.result_json(p);
end $$;

-- Revoke default PUBLIC execution, including internal helpers. Browser can execute only these API functions.
revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.teacher_overview(jsonb),public.teacher_preview(jsonb),public.teacher_group(jsonb),public.teacher_issue(jsonb),public.teacher_close(jsonb),public.teacher_result(jsonb),public.get_assignment(jsonb),public.start_attempt(jsonb),public.get_attempt(jsonb),public.submit_attempt(jsonb) from public, anon;
grant execute on function public.teacher_overview(jsonb),public.teacher_preview(jsonb),public.teacher_group(jsonb),public.teacher_issue(jsonb),public.teacher_close(jsonb),public.teacher_result(jsonb),public.get_assignment(jsonb),public.start_attempt(jsonb),public.get_attempt(jsonb),public.submit_attempt(jsonb) to authenticated;
