create index if not exists idx_app_leads_email on app_leads(email);
create index if not exists idx_app_clients_email on app_clients(email);
create index if not exists idx_app_waivers_client_signed on app_waivers(client_id, signed_at desc);
create index if not exists idx_app_bookings_client_status on app_bookings(client_id, status);
create index if not exists idx_app_events_created on app_events(created_at desc);
