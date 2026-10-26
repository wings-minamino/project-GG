-- Private teacher-photo submissions. All access goes through the authenticated Edge API.
create table if not exists public.gg_photo_submissions (
  id uuid primary key,
  student_id text not null,
  teacher_name text not null check (char_length(teacher_name) between 1 and 80),
  event text not null default 'halloween-2026',
  object_path text not null unique,
  status text not null default 'uploading' check (status in ('uploading','submitted','reviewed','deleting')),
  created_at timestamptz not null default now()
);
alter table public.gg_photo_submissions enable row level security;
revoke all on public.gg_photo_submissions from public, anon, authenticated;
grant select, insert, update, delete on public.gg_photo_submissions to service_role;
create index if not exists gg_photo_student_idx on public.gg_photo_submissions(student_id, event);
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('gg-teacher-photos','gg-teacher-photos',false,2097152,array['image/jpeg'])
on conflict (id) do update set public=false, file_size_limit=2097152, allowed_mime_types=array['image/jpeg'];
-- Intentionally no anon/authenticated Storage policies: service-role server access only.
create or replace function public.gg_reserve_photo(photo_id uuid, owner_id text, teacher text)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id, 79));
  if exists(select 1 from public.gg_photo_submissions where id=photo_id) then
    return exists(select 1 from public.gg_photo_submissions where id=photo_id and student_id=owner_id and status='uploading');
  end if;
  insert into public.gg_photo_submissions(id,student_id,teacher_name,object_path)
  values(photo_id,owner_id,teacher,'halloween-2026/'||photo_id::text||'.jpg');
  return true;
end;
$$;
revoke all on function public.gg_reserve_photo(uuid,text,text) from public,anon,authenticated;
grant execute on function public.gg_reserve_photo(uuid,text,text) to service_role;

alter table public.gg_photo_submissions add column if not exists submitted_at timestamptz;
-- Complete the upload and award at most one stamp per student/JST day atomically.
create or replace function public.gg_complete_photo(photo_id uuid, owner_id text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare p public.gg_photo_submissions; d jsonb; day_key text; reward jsonb;
begin
  select * into p from public.gg_photo_submissions where id=photo_id for update;
  if p.id is null or p.student_id<>owner_id or p.status='deleting' then return false; end if;
  if p.status='uploading' then
    update public.gg_photo_submissions set status='submitted',submitted_at=now() where id=photo_id returning * into p;
  end if;
  day_key:=to_char(coalesce(p.submitted_at,p.created_at) at time zone 'Asia/Tokyo','YYYY-MM-DD');
  if day_key>'2026-10-31' or day_key<'2026-10-01' then return true; end if;
  select data into d from public.gg_state where id=1 for update;
  if not exists(select 1 from jsonb_array_elements(d->'students') s where s->>'id'=owner_id) then raise exception 'student not found'; end if;
  if not exists(select 1 from jsonb_array_elements(d->'draws') x where x->>'studentId'=owner_id and x->>'photoRewardDay'=day_key) then
    reward:=jsonb_build_object('id','photo-'||owner_id||'-'||day_key,'studentId',owner_id,'missionId','halloween-photo-2026','missionText','[特別ミッション] 仮装した先生を撮影しよう！','status','承認済み','color','#E8A93B','drawnAt',day_key,'approvedAt',day_key,'value',1,'hidden',true,'photoReward',true,'photoRewardDay',day_key);
    update public.gg_state set data=jsonb_set(d,'{draws}',coalesce(d->'draws','[]'::jsonb)||jsonb_build_array(reward)),version=version+1 where id=1;
  end if;
  return true;
end;
$$;
revoke all on function public.gg_complete_photo(uuid,text) from public,anon,authenticated;
grant execute on function public.gg_complete_photo(uuid,text) to service_role;
