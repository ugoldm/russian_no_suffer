-- Friday is unavailable for new work. Preserve all historical group labels.
begin;
create or replace function private.student_group(exam text, day text, start_time text)
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
  ('ЕГЭ','sunday','ВС',array['11:30'])
 ) as schedule(exam_id,day_id,short,times)
 where exam_id=exam and day_id=day and start_time=any(times);
 if label is null then raise exception 'Выберите день и время занятий из списка.'; end if;
 return label;
end $$;
revoke all on function private.student_group(text,text,text) from public,anon,authenticated;
commit;
