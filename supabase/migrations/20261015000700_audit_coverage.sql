-- =============================================================================
-- Audit coverage (plan B5, ID-50)
-- Every database function that changes data writes an audit entry. A review on
-- 2026-10-15 found two that did not; test 009_audit_coverage keeps it that way.
--   update_my_profile  -> user.profile_updated (field names only)
--   sync_clerk_user    -> user.signed_up (first time only)
-- mark_notifications_read is the one exception: reading your own notifications
-- is not an important action.
-- =============================================================================

create or replace function public.sync_clerk_user(p_clerk_user_id text, p_email text, p_full_name text, p_avatar_url text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_new boolean;
  v_email text := lower(trim(p_email));
begin
  if p_clerk_user_id is null or v_email is null then
    perform app.fail('CG422', 'Clerk user id and email are required.');
  end if;
  insert into public.users (clerk_user_id, email, full_name, avatar_url)
  values (p_clerk_user_id, v_email, nullif(trim(p_full_name), ''), p_avatar_url)
  on conflict (clerk_user_id) do update
    set email = excluded.email,
        full_name = coalesce(public.users.full_name, excluded.full_name),
        avatar_url = excluded.avatar_url
  returning id, (xmax = 0) into v_id, v_new;
  -- B5: a new account is recorded once; later syncs (every sign-in) are not.
  if v_new then
    perform app.audit('user.signed_up', 'user', v_id, null, format('%s created an account', v_email));
  end if;
  return v_id;
end;
$$;

create or replace function public.update_my_profile(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := app.require_user();
begin
  if app.jtext(p, 'phone_e164') is not null and app.jtext(p, 'phone_e164') !~ '^\+[1-9][0-9]{6,14}$' then
    perform app.fail('CG422', 'Phone must be in international format, for example +919876543210.');
  end if;
  if app.jtext(p, 'country_code') is not null and upper(app.jtext(p, 'country_code')) !~ '^[A-Z]{2}$' then
    perform app.fail('CG422', 'Country must be a two-letter ISO code.');
  end if;
  update public.users u set
    full_name    = case when p ? 'full_name' then app.jtext(p, 'full_name') else u.full_name end,
    phone_e164   = case when p ? 'phone_e164' then app.jtext(p, 'phone_e164') else u.phone_e164 end,
    country_code = case when p ? 'country_code' then upper(app.jtext(p, 'country_code')) else u.country_code end,
    timezone     = case when p ? 'timezone' and app.jtext(p, 'timezone') is not null then app.jtext(p, 'timezone') else u.timezone end
  where u.id = v_user;

  if p ? 'contributor' then
    insert into public.contributor_profiles (user_id) values (v_user) on conflict (user_id) do nothing;
    update public.contributor_profiles c set
      date_of_birth    = case when p -> 'contributor' ? 'date_of_birth' then (app.jtext(p -> 'contributor', 'date_of_birth'))::date else c.date_of_birth end,
      gender           = case when p -> 'contributor' ? 'gender' then app.jtext(p -> 'contributor', 'gender') else c.gender end,
      nationality_code = case when p -> 'contributor' ? 'nationality_code' then upper(app.jtext(p -> 'contributor', 'nationality_code')) else c.nationality_code end,
      native_language  = case when p -> 'contributor' ? 'native_language' then app.jtext(p -> 'contributor', 'native_language') else c.native_language end,
      other_languages  = case when p -> 'contributor' ? 'other_languages' then coalesce(app.jtext_array(p -> 'contributor', 'other_languages'), '{}') else c.other_languages end,
      skills           = case when p -> 'contributor' ? 'skills' then coalesce(app.jtext_array(p -> 'contributor', 'skills'), '{}') else c.skills end,
      linkedin_url     = case when p -> 'contributor' ? 'linkedin_url' then app.jtext(p -> 'contributor', 'linkedin_url') else c.linkedin_url end,
      bio              = case when p -> 'contributor' ? 'bio' then app.jtext(p -> 'contributor', 'bio') else c.bio end
    where c.user_id = v_user;
  end if;
  -- B5: record which fields changed (names only, not the personal values).
  perform app.audit('user.profile_updated', 'user', v_user, null, 'Updated own profile',
    jsonb_build_object('fields', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(p) k)));
end;
$$;
