-- Existing completed work starts as seen. Each new successful submission is unread.
begin;
alter table private.attempts add column teacher_seen boolean not null default true;

create or replace function public.teacher_overview(p_args jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_teacher();
begin
 return jsonb_build_object(
  'tests', coalesce((
   select jsonb_agg(private.public_test(data)||jsonb_build_object('shareToken',t.share_token)
    order by data->>'exam',(data->>'taskNumber')::int)
   from private.tests t
   where (t.owner_id=u or t.owner_id is null) and t.data->>'status'='published'
    and not exists (
     select 1 from private.tests newer
     where newer.data->>'id'=t.data->>'id' and newer.data->>'status'='published'
      and (newer.owner_id=u or newer.owner_id is null)
      and (newer.data->>'version')::int>(t.data->>'version')::int
    )
  ),'[]'::jsonb),
  'results', coalesce((
   select jsonb_agg((private.result_json(p)-'exercises')
    ||jsonb_build_object('teacherHidden',p.teacher_hidden,'teacherUnread',not p.teacher_seen)
    order by p.submitted_at desc,p.id)
   from private.attempts p where p.teacher_id=u and p.status='submitted'
  ),'[]'::jsonb)
 );
end $$;

create function public.teacher_mark_results_seen(p_args jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_teacher(); ids uuid[];
begin
 if jsonb_typeof(p_args->'attemptIds') is distinct from 'array' then
  raise exception 'Укажите список завершённых работ.';
 end if;
 if jsonb_array_length(p_args->'attemptIds')>500 or exists (
  select 1 from jsonb_array_elements(p_args->'attemptIds') item
  where jsonb_typeof(item) is distinct from 'string'
 ) then raise exception 'Укажите список завершённых работ.'; end if;
 select coalesce(array_agg(id order by first_position),'{}'::uuid[]) into ids
 from (
  select value::uuid id,min(position) first_position
  from jsonb_array_elements_text(p_args->'attemptIds') with ordinality as item(value,position)
  group by value::uuid
 ) requested;
 -- Acknowledge only records in the displayed snapshot, never later arrivals.
 if exists (
  select 1 from unnest(ids) requested(id)
  left join private.attempts p on p.id=requested.id and p.teacher_id=u and p.status='submitted'
  where p.id is null
 ) then raise exception 'Результат недоступен.'; end if;
 update private.attempts set teacher_seen=true where id=any(ids) and teacher_id=u and status='submitted';
 return jsonb_build_object('seenIds',to_jsonb(ids));
end $$;

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
 total_count:=jsonb_array_length(t->'exercises');if total_count=0 then raise exception 'В тесте нет упражнений.';end if;
 for e in select jsonb_array_elements(t->'exercises') loop if private.grade(e,submitted_answers->(e->>'id')) then correct_count:=correct_count+1;end if;end loop;
 update private.attempts set answers=submitted_answers,correct=correct_count,total=total_count,status='submitted',submitted_at=now(),teacher_seen=false where id=p.id returning * into p;
 return private.result_json(p);
end $$;

revoke all on function public.teacher_mark_results_seen(jsonb) from public,anon;
grant execute on function public.teacher_mark_results_seen(jsonb) to authenticated;
commit;
