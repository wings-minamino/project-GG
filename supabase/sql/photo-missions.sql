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
  if (select count(*) from public.gg_photo_submissions where student_id=owner_id and event='halloween-2026')>=5 then return false; end if;
  insert into public.gg_photo_submissions(id,student_id,teacher_name,object_path)
  values(photo_id,owner_id,teacher,'halloween-2026/'||photo_id::text||'.jpg');
  return true;
end;
$$;
revoke all on function public.gg_reserve_photo(uuid,text,text) from public,anon,authenticated;
grant execute on function public.gg_reserve_photo(uuid,text,text) to service_role;
