-- =============================================================================
-- Phase 2A: collection setup per project (ID-53)
--
-- What a project collects (profile fields, guides, quotas, consent, files,
-- eKYC) is one JSON document per version. Every save adds a version; the
-- project points at the current one, and submissions (Phase 2B) will record
-- the version they used, so old submissions keep their rules.
-- The detailed shape is checked by the app (src/lib/collection.ts); the
-- database checks who may save, the size, and that guide images belong to the
-- project.
-- Example images for guides live in the private "collection-assets" bucket.
-- =============================================================================

alter table public.projects add column collection_version int not null default 0;

create table public.project_collection_versions (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  version     int not null,
  config      jsonb not null,
  created_by  uuid references public.users(id),
  created_at  timestamptz not null default now(),
  unique (project_id, version),
  constraint collection_config_object check (jsonb_typeof(config) = 'object')
);
alter table public.project_collection_versions enable row level security;

create table public.project_assets (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  file_name     text not null,
  storage_bucket text not null,
  storage_path  text not null unique,
  mime_type     text not null,
  size_bytes    bigint not null check (size_bytes > 0),
  uploaded_by   uuid references public.users(id),
  created_at    timestamptz not null default now(),
  removed_at    timestamptz
);
create index project_assets_project_idx on public.project_assets (project_id) where removed_at is null;
alter table public.project_assets enable row level security;
revoke all on public.project_collection_versions, public.project_assets from anon, authenticated;
grant select on public.project_collection_versions, public.project_assets to authenticated;

-- Anyone who can see the project can read its setup and guide images: the
-- instructions are shown to applicants and contributors.
create policy collection_versions_read on public.project_collection_versions for select to authenticated
  using (app.can_view_project(project_id));
create policy project_assets_read on public.project_assets for select to authenticated
  using (removed_at is null and app.can_view_project(project_id));

-- -----------------------------------------------------------------------------
create or replace function public.save_collection_setup(p_project uuid, p_config jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.require_project_permission(p_project, 'project.manage');
  v_project public.projects;
  v_version int;
  v_bad int;
begin
  select * into v_project from public.projects where id = p_project for update;
  if not found then perform app.fail('CG404', 'Project not found.'); end if;
  if v_project.status in ('COMPLETED', 'ARCHIVED') then
    perform app.fail('CG409', 'This project is closed. Its collection setup can no longer change.');
  end if;
  if p_config is null or jsonb_typeof(p_config) <> 'object'
     or jsonb_typeof(p_config -> 'fields') <> 'array' or jsonb_typeof(p_config -> 'files') <> 'array' then
    perform app.fail('CG422', 'The collection setup is incomplete.');
  end if;
  if pg_column_size(p_config) > 512 * 1024 then
    perform app.fail('CG422', 'The collection setup is too large. Shorten the texts or remove some guides.');
  end if;

  -- Guide images must be this project's own, not removed.
  select count(*) into v_bad
  from jsonb_array_elements(coalesce(p_config -> 'guides', '[]'::jsonb)) g,
       jsonb_array_elements_text(coalesce(g -> 'imageIds', '[]'::jsonb)) img
  where not exists (select 1 from public.project_assets a
                    where a.id::text = img and a.project_id = p_project and a.removed_at is null);
  if v_bad > 0 then perform app.fail('CG422', 'A guide uses an image that is not part of this project.'); end if;

  v_version := v_project.collection_version + 1;
  insert into public.project_collection_versions (project_id, version, config, created_by)
  values (p_project, v_version, p_config, v_user);
  update public.projects set collection_version = v_version, updated_at = now(), updated_by = v_user where id = p_project;
  perform app.audit('project.collection_saved', 'project', p_project, null,
    format('Collection setup of %s saved (version %s)', v_project.code, v_version),
    jsonb_build_object('version', v_version,
      'fields', jsonb_array_length(p_config -> 'fields'),
      'guides', jsonb_array_length(coalesce(p_config -> 'guides', '[]'::jsonb)),
      'quotas', jsonb_array_length(coalesce(p_config -> 'quotas', '[]'::jsonb))));
  return v_version;
end;
$$;

create or replace function public.register_project_asset(
  p_project uuid, p_file_name text, p_storage_bucket text, p_storage_path text, p_mime_type text, p_size_bytes bigint)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.require_project_permission(p_project, 'project.manage');
  v_id uuid;
begin
  if p_mime_type not in ('image/png', 'image/jpeg', 'image/webp') then
    perform app.fail('CG422', 'Guide images must be PNG, JPG or WEBP.');
  end if;
  if p_size_bytes > 10 * 1024 * 1024 then perform app.fail('CG422', 'Guide images can be at most 10 MB.'); end if;
  if p_storage_path not like p_project::text || '/%' then perform app.fail('CG422', 'Wrong upload location.'); end if;
  if (select count(*) from public.project_assets where project_id = p_project and removed_at is null) >= 200 then
    perform app.fail('CG409', 'This project already has 200 guide images. Remove some first.');
  end if;
  insert into public.project_assets (project_id, file_name, storage_bucket, storage_path, mime_type, size_bytes, uploaded_by)
  values (p_project, left(p_file_name, 200), p_storage_bucket, p_storage_path, p_mime_type, p_size_bytes, v_user)
  returning id into v_id;
  perform app.audit('project.asset_added', 'project', p_project, null, format('Guide image %s added', left(p_file_name, 200)));
  return v_id;
end;
$$;

create or replace function public.remove_project_asset(p_asset uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset public.project_assets;
begin
  perform app.require_user();
  select * into v_asset from public.project_assets where id = p_asset and removed_at is null;
  if not found then perform app.fail('CG404', 'Image not found.'); end if;
  perform app.require_project_permission(v_asset.project_id, 'project.manage');
  update public.project_assets set removed_at = now() where id = p_asset;
  perform app.audit('project.asset_removed', 'project', v_asset.project_id, null, format('Guide image %s removed', v_asset.file_name));
end;
$$;

revoke execute on function public.save_collection_setup(uuid, jsonb), public.register_project_asset(uuid, text, text, text, text, bigint),
  public.remove_project_asset(uuid) from public, anon;
grant execute on function public.save_collection_setup(uuid, jsonb), public.register_project_asset(uuid, text, text, text, text, bigint),
  public.remove_project_asset(uuid) to authenticated;
