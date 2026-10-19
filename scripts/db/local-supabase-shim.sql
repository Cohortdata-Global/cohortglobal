-- Minimal stand-in for the parts of Supabase the migrations rely on, so the
-- database can be tested on plain PostgreSQL (CI, or machines without Docker).
-- NOT used in real Supabase projects, which already provide all of this.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;

create schema if not exists extensions;
create schema if not exists auth;
grant usage on schema extensions, auth, public to anon, authenticated, service_role;

-- Supabase's auth.jwt(): the verified token claims of the current request.
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
grant execute on function auth.jwt() to anon, authenticated, service_role;

-- Supabase grants table privileges to service_role by default.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
