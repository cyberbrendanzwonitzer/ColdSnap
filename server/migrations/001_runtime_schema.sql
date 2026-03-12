create table if not exists app_leads (
  id text primary key,
  first_name text not null,
  last_name text not null,
  email text not null unique,
  phone text,
  source text not null,
  status text not null,
  crm_external_id text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists app_clients (
  id text primary key,
  lead_id text references app_leads(id) on delete set null,
  first_name text not null,
  last_name text not null,
  email text not null unique,
  phone text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists app_waivers (
  id text primary key,
  client_id text not null references app_clients(id) on delete cascade,
  waiver_version text not null,
  signature_name text not null,
  status text not null,
  signed_at timestamptz not null,
  created_at timestamptz not null
);

create table if not exists app_bookings (
  id text primary key,
  lead_id text references app_leads(id) on delete set null,
  client_id text not null references app_clients(id) on delete cascade,
  service_code text not null,
  preferred_date_time text not null,
  provider text not null,
  provider_reference text not null unique,
  status text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists app_events (
  id text primary key,
  type text not null,
  payload jsonb not null,
  created_at timestamptz not null
);
