-- CryoChamber starter schema for leads, clients, waivers, and bookings
-- PostgreSQL-flavored SQL

create table if not exists leads (
    id bigserial primary key,
    first_name varchar(80) not null,
    last_name varchar(80) not null,
    email varchar(255) not null unique,
    phone varchar(30),
    source varchar(100) not null,
    campaign varchar(100),
    status varchar(50) not null default 'new',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists clients (
    id bigserial primary key,
    lead_id bigint references leads(id) on delete set null,
    external_crm_id varchar(100),
    external_booking_id varchar(100),
    date_of_birth date,
    emergency_contact_name varchar(160),
    emergency_contact_phone varchar(30),
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists waiver_documents (
    id bigserial primary key,
    version varchar(50) not null,
    title varchar(200) not null,
    content_hash varchar(128) not null,
    is_active boolean not null default true,
    effective_at timestamptz not null,
    retired_at timestamptz,
    created_at timestamptz not null default now()
);

create table if not exists waivers (
    id bigserial primary key,
    client_id bigint not null references clients(id) on delete cascade,
    waiver_document_id bigint not null references waiver_documents(id),
    signed_at timestamptz not null,
    signer_ip inet,
    signature_provider varchar(100) not null,
    signature_reference varchar(255) not null,
    status varchar(40) not null default 'signed',
    created_at timestamptz not null default now(),
    unique (client_id, waiver_document_id)
);

create table if not exists services (
    id bigserial primary key,
    code varchar(50) not null unique,
    name varchar(120) not null,
    duration_minutes integer not null check (duration_minutes > 0),
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);

create table if not exists bookings (
    id bigserial primary key,
    client_id bigint not null references clients(id) on delete cascade,
    service_id bigint not null references services(id),
    booking_provider varchar(50) not null,
    booking_provider_ref varchar(120) unique,
    starts_at timestamptz not null,
    ends_at timestamptz not null,
    status varchar(40) not null default 'pending_waiver',
    waiver_required boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (ends_at > starts_at)
);

create table if not exists crm_events (
    id bigserial primary key,
    lead_id bigint references leads(id) on delete set null,
    client_id bigint references clients(id) on delete set null,
    event_type varchar(80) not null,
    payload jsonb not null,
    created_at timestamptz not null default now()
);

create index if not exists idx_bookings_client_status on bookings(client_id, status);
create index if not exists idx_bookings_starts_at on bookings(starts_at);
create index if not exists idx_crm_events_type on crm_events(event_type);
