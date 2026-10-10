-- Duration uses existing server timestamps, from Start to successful submission.
-- Includes previous attempts; no client-supplied timing or data rewrite.
begin;
create or replace function private.result_json(p private.attempts) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',p.id,'testId',t.data->>'id','versionId',p.version_id,'name',p.name,'status',p.status,'attemptNumber',p.attempt_number,'startedAt',p.started_at,'submittedAt',p.submitted_at,'durationSeconds',case when p.started_at is null or p.submitted_at is null then null else greatest(0,floor(extract(epoch from (p.submitted_at-p.started_at))))::bigint end,'correct',p.correct,'total',p.total,'percentage',case when p.total=0 then 0 else round(p.correct*100.0/p.total)::integer end,'testTitle',t.data->>'title','exam',t.data->>'exam','taskNumber',t.data->'taskNumber','exercises',(select jsonb_agg(e || jsonb_build_object('rawAnswer',coalesce(p.answers->(e->>'id'),case when e->>'type'='multiple' then '[]'::jsonb else '""'::jsonb end),'correct',private.grade(e,p.answers->(e->>'id')),'correctAnswer',e->'key')) from jsonb_array_elements(t.data->'exercises') e))
 from private.tests t where t.version_id=p.version_id;
$$;
revoke all on function private.result_json(private.attempts) from public,anon,authenticated;
commit;
