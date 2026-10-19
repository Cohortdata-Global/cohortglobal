-- =============================================================================
-- CohortGlobal — 0100 Foundation: extensions, schemas, shared helpers
-- Module 1B (database). See docs/phase-1/1B-database.md
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- Private schema for helper functions used by RLS policies and RPCs.
-- It is NOT exposed through the Supabase API (only `public` is).
create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

-- Keep updated_at current on every UPDATE.
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Error helper. CohortGlobal error codes (SQLSTATE):
--   CG401 not signed in / unknown user      CG403 not allowed
--   CG404 not found                         CG409 conflict with current state
--   CG422 invalid input
-- The application maps these codes to friendly messages (src/server/errors.ts).
create or replace function app.fail(code text, message text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = code, message = message;
end;
$$;

-- Random URL-safe token (32 bytes) and its SHA-256 hash.
create or replace function app.new_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_');
$$;

create or replace function app.hash_token(token text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(convert_to(token, 'UTF8'), 'sha256'), 'hex');
$$;

create or replace function app.sha256(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(convert_to(coalesce(value, ''), 'UTF8'), 'sha256'), 'hex');
$$;
