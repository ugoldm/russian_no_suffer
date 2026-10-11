-- Validate new selections against the test's exam. Saved groups and old drafts stay unchanged.
begin;
create function private.student_group(exam text, day text, start_time text)
returns text language plpgsql immutable set search_path='' as $$
declare label text;
begin
 select short || ' ' || start_time into label
 from (values
  ('ОГЭ','monday','ПН',array['18:30']),
  ('ОГЭ','tuesday','ВТ',array['18:00']),
  ('ОГЭ','wednesday','СР',array['18:30']),
  ('ОГЭ','thursday','ЧТ',array['17:00','18:00']),
  ('ЕГЭ','monday','ПН',array['17:30','19:30']),
  ('ЕГЭ','tuesday','ВТ',array['11:00','16:30','19:30']),
  ('ЕГЭ','wednesday','СР',array['17:00','19:30']),
  ('ЕГЭ','thursday','ЧТ',array['19:30']),
  ('ЕГЭ','friday','ПТ',array['17:30']),
  ('ЕГЭ','sunday','ВС',array['11:30'])
 ) as schedule(exam_id,day_id,short,times)
 where exam_id=exam and day_id=day and start_time=any(times);
 if label is null then raise exception 'Выберите день и время занятий из списка.'; end if;
 return label;
end $$;
revoke all on function private.student_group(text,text,text) from public,anon,authenticated;

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
 values(t.version_id,teacher,u,private.clean_name(p_args->>'name'),n,private.student_group(t.data->>'exam',p_args->>'groupDay',p_args->>'groupTime')) returning * into p;
 return jsonb_build_object('id',p.id,'versionId',p.version_id,'name',p.name,'group',p.student_group,'status',p.status);
end $$;

drop function private.student_group(text,text);
commit;
