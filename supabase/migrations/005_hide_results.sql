-- Hiding only changes the teacher's list. Answers and student results stay intact.
begin;

alter table private.attempts add column teacher_hidden boolean not null default false;

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
    ||jsonb_build_object('teacherHidden',p.teacher_hidden)
    order by p.submitted_at desc,p.id)
   from private.attempts p where p.teacher_id=u and p.status='submitted'
  ),'[]'::jsonb)
 );
end $$;

create function public.teacher_set_result_hidden(p_args jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_teacher(); p private.attempts;
begin
 if jsonb_typeof(p_args->'hidden') is distinct from 'boolean' then
  raise exception 'Укажите, нужно ли скрыть работу.';
 end if;
 update private.attempts
 set teacher_hidden=(p_args->>'hidden')::boolean
 where id=(p_args->>'attemptId')::uuid and teacher_id=u and status='submitted'
 returning * into p;
 if p.id is null then raise exception 'Результат недоступен.'; end if;
 return jsonb_build_object('id',p.id,'teacherHidden',p.teacher_hidden);
end $$;

revoke all on function public.teacher_set_result_hidden(jsonb) from public,anon;
grant execute on function public.teacher_set_result_hidden(jsonb) to authenticated;
commit;
