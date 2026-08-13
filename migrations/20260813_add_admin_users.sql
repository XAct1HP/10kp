-- Admin users table — lets existing admins grant admin access to new
-- accounts through the UI without editing ADMIN_EMAILS in the deploy
-- environment. The env-var list stays as the "root" bootstrap set; this
-- table extends it.
--
-- Emails are stored lowercased and normalized so lookups match the
-- comparison in lib/adminAuth.js.

create table if not exists public.admin_users (
  email text primary key,
  added_by text,
  created_at timestamptz not null default now()
);

-- Emails must be lowercase — enforced so the API layer doesn't have to
-- worry about duplicate rows for different cases of the same address.
alter table public.admin_users
  drop constraint if exists admin_users_email_lowercase_check;
alter table public.admin_users
  add constraint admin_users_email_lowercase_check
  check (email = lower(email));

-- RLS on: no direct client reads or writes. All admin management flows
-- through the service-role client in the /api/admin/admins routes.
alter table public.admin_users enable row level security;

drop policy if exists "admin_users deny all" on public.admin_users;
create policy "admin_users deny all"
  on public.admin_users
  for all
  using (false)
  with check (false);
