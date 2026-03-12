# Booking and CRM API

This backend provides the booking and CRM workflow used by the CryoChamber homepage.

## Base URL

- Local: `http://localhost:3000`

## Endpoints

### Health

- `GET /api/health`
- Returns service health and timestamp.

### Newsletter lead capture

- `POST /api/leads/newsletter`
- Purpose: create or update a CRM lead from the footer newsletter form.

Request body:

```json
{
  "email": "person@example.com",
  "firstName": "Optional",
  "lastName": "Optional"
}
```

### Booking intent creation

- `POST /api/bookings/intent`
- Purpose: create a booking request and sync lead data to CRM.

Request body:

```json
{
  "firstName": "Ari",
  "lastName": "Cole",
  "email": "ari@example.com",
  "phone": "2145550199",
  "serviceCode": "whole-body-cryo",
  "preferredDateTime": "2026-03-14T10:00",
  "waiverAccepted": true
}
```

Response highlights:

- `status`: `pending_waiver` or `confirmed`
- `needsWaiver`: boolean flag for the frontend flow

### Waiver signing

- `POST /api/waivers/sign`
- Purpose: register a signed waiver and confirm any pending booking for that client.

Request body:

```json
{
  "email": "ari@example.com",
  "signatureName": "Ari Cole",
  "waiverVersion": "v1"
}
```

Response highlights:

- `confirmedBookings`: number of pending bookings auto-confirmed after signing.

### Admin snapshot

- `GET /api/admin/snapshot`
- Purpose: inspect current business state from the configured storage backend.

Returns counts and recent events/bookings.

### Admin bookings list

- `GET /api/admin/bookings`
- Purpose: returns full appointment list enriched with customer name, email, and phone for dashboard table views.

Response highlights:

- `count`: total appointments returned.
- `bookings[]`: includes `status`, `preferredDateTime`, `serviceCode`, `providerReference`, and customer identity fields.

## Data persistence

- Default mode: `DATA_MODE=postgres`
- PostgreSQL connection: `DATABASE_URL=postgres://user:pass@host:5432/dbname`
- Optional TLS: `DB_SSL=true`
- Optional fallback mode: `DATA_MODE=file` with `DATA_FILE=data/runtime.json`

Runtime migrations:

- Auto-run when server starts in postgres mode.
- Manual run: `npm run migrate`.

## Provider configuration

Default mode uses internal mock adapters that still persist leads, bookings, and events.

`.env` options:

- `DATA_MODE=postgres|file`
- `DATABASE_URL=postgres://...`
- `DB_SSL=true|false`
- `CRM_PROVIDER=mock|hubspot|gohighlevel`
- `BOOKING_PROVIDER=mock|mindbody|boulevard`
- `ALLOW_OUTBOUND_INTEGRATIONS=true|false`
- `HUBSPOT_ACCESS_TOKEN=...`
- `GHL_API_KEY=...`
- `GHL_LOCATION_ID=...`
- `BOOKING_API_KEY=...`
- `BOOKING_BASE_URL=https://...`

When outbound integration is disabled or credentials are missing, providers automatically fall back to mock behavior and log that reason in events.

## Windows quick test commands

```powershell
docker compose up -d db
npm run migrate

Invoke-RestMethod -Method Get -Uri "http://localhost:3000/api/health"

Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/leads/newsletter" -ContentType "application/json" -Body '{"email":"demo@example.com"}'

Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/bookings/intent" -ContentType "application/json" -Body '{"firstName":"Demo","lastName":"User","email":"demo@example.com","serviceCode":"whole-body-cryo","preferredDateTime":"2026-03-14T10:00","waiverAccepted":true}'

Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/waivers/sign" -ContentType "application/json" -Body '{"email":"demo@example.com","signatureName":"Demo User","waiverVersion":"v1"}'

Invoke-RestMethod -Method Get -Uri "http://localhost:3000/api/admin/snapshot"
```
