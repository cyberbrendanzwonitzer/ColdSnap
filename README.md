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

## Booking Reminder Setup

The API includes an automatic reminder worker that sends one reminder per confirmed booking.

1. Choose provider in `.env`:
	- `REMINDER_PROVIDER=mock` for local testing (logs only)
	- `REMINDER_PROVIDER=gmail` to send from a Gmail account
	- `REMINDER_PROVIDER=resend` for live email delivery
2. Set scheduling:
	- `REMINDER_LEAD_MINUTES=0` sends right after booking confirmation
	- Set `1440` for a 24-hour reminder, `120` for 2 hours, etc.
3. For Gmail sending, configure:
	- `ALLOW_OUTBOUND_INTEGRATIONS=true`
	- `GMAIL_USER=liquidbom@gmail.com`
	- `GMAIL_APP_PASSWORD=<16-char app password from Google Account>`
	- Optional: `REMINDER_FROM_NAME` (from email uses `GMAIL_USER`)
4. For Resend sending, configure:
	- `ALLOW_OUTBOUND_INTEGRATIONS=true`
	- `RESEND_API_KEY=<your_resend_api_key>`
	- `REMINDER_FROM_EMAIL=<verified_sender@yourdomain.com>`
	- Optional: `REMINDER_FROM_NAME` and `REMINDER_TIMEZONE`
5. Deploy/restart the API.

Verify with:

```powershell
Invoke-RestMethod -Uri "https://your-main-api-domain/api/health"
```

Look for `"reminderProvider":"resend"` in the response.

## Notes

- The design intentionally uses a cool, energetic visual language that matches cryotherapy branding.
- The technical docs assume integration with providers such as Mindbody or Boulevard and CRM automation platforms like HubSpot or GoHighLevel.
- If collecting health intake data, validate your exact HIPAA obligations with legal/compliance counsel.
- By default, provider integrations run in mock mode until credentials and outbound mode are enabled in `.env`.
- By default, data persistence is PostgreSQL-backed using `DATABASE_URL`; migrations are auto-run at server startup and can also be run manually with `npm run migrate`.
