# CryoChamber Website Blueprint

This workspace contains a production-minded starter for a cryotherapy website concept.

## What is included

- `docs/information-architecture.md`: Sitemap and page-level content goals.
- `docs/system-design.md`: High-level technical architecture, integrations, and security controls.
- `docs/client-records-schema.sql`: Starter relational schema for leads, clients, waivers, bookings, and automation events.
- `docs/booking-crm-api.md`: Booking + CRM endpoint contracts and integration configuration.
- `web/index.html`: Responsive homepage wireframe aligned to the blueprint.
- `web/styles.css`: Visual direction, layout, and responsive behavior.
- `web/script.js`: Lightweight interactions for chamber hotspots and newsletter form handling.
- `server/`: Booking and CRM backend API with provider adapters and persistent local storage.
- `server/migrations/`: SQL migrations for runtime booking/CRM tables.
- `docker-compose.yml`: Local PostgreSQL service for development.

## Quick preview

Install Node.js 18+ first, then run:

```powershell
docker compose up -d db
npm install
npm run migrate
npm run dev
```

Open `http://localhost:3000`.

Admin dashboard URL: `http://localhost:3000/admin`

The frontend is served by the API host so newsletter, booking, and waiver flows call live endpoints.

If you prefer local JSON persistence for quick prototypes, set `DATA_MODE=file` in `.env`.

## Notes

- The design intentionally uses a cool, energetic visual language that matches cryotherapy branding.
- The technical docs assume integration with providers such as Mindbody or Boulevard and CRM automation platforms like HubSpot or GoHighLevel.
- If collecting health intake data, validate your exact HIPAA obligations with legal/compliance counsel.
- By default, provider integrations run in mock mode until credentials and outbound mode are enabled in `.env`.
- By default, data persistence is PostgreSQL-backed using `DATABASE_URL`; migrations are auto-run at server startup and can also be run manually with `npm run migrate`.
