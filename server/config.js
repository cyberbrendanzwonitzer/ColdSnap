const path = require("path");

function toBool(value, defaultValue = false) {
  if (typeof value === "undefined") {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function toNumber(value, defaultValue) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

const rootDir = path.resolve(__dirname, "..");

module.exports = {
  rootDir,
  port: Number(process.env.PORT || 3000),
  corsOrigin: process.env.CORS_ORIGIN || "*",
  dataMode: (process.env.DATA_MODE || "postgres").toLowerCase(),
  databaseUrl: process.env.DATABASE_URL || "",
  dbSsl: toBool(process.env.DB_SSL, false),
  crmProvider: (process.env.CRM_PROVIDER || "mock").toLowerCase(),
  bookingProvider: (process.env.BOOKING_PROVIDER || "mock").toLowerCase(),
  reminderProvider: (process.env.REMINDER_PROVIDER || "mock").toLowerCase(),
  reminderFallbackProvider: (process.env.REMINDER_FALLBACK_PROVIDER || "").toLowerCase(),
  allowOutboundIntegrations: toBool(process.env.ALLOW_OUTBOUND_INTEGRATIONS, false),
  hubspotToken: process.env.HUBSPOT_ACCESS_TOKEN || "",
  goHighLevelApiKey: process.env.GHL_API_KEY || "",
  goHighLevelLocationId: process.env.GHL_LOCATION_ID || "",
  bookingApiKey: process.env.BOOKING_API_KEY || "",
  bookingBaseUrl: process.env.BOOKING_BASE_URL || "",
  reminderLeadMinutes: toNumber(process.env.REMINDER_LEAD_MINUTES || "0", 0),
  reminderPollMs: toNumber(process.env.REMINDER_POLL_MS || "60000", 60000),
  reminderRetryMinutes: toNumber(process.env.REMINDER_RETRY_MINUTES || "15", 15),
  reminderTimezone: process.env.REMINDER_TIMEZONE || "America/New_York",
  reminderFromEmail: process.env.REMINDER_FROM_EMAIL || "",
  reminderFromName: process.env.REMINDER_FROM_NAME || "CryoChamber",
  gmailUser: process.env.GMAIL_USER || "",
  gmailAppPassword: process.env.GMAIL_APP_PASSWORD || "",
  gmailHost: process.env.GMAIL_HOST || "smtp.gmail.com",
  gmailPort: toNumber(process.env.GMAIL_PORT || "465", 465),
  gmailSecure: toBool(process.env.GMAIL_SECURE, true),
  gmailPreferIpv4: toBool(process.env.GMAIL_PREFER_IPV4, true),
  gmailConnectionTimeoutMs: toNumber(process.env.GMAIL_CONNECTION_TIMEOUT_MS || "20000", 20000),
  gmailGreetingTimeoutMs: toNumber(process.env.GMAIL_GREETING_TIMEOUT_MS || "15000", 15000),
  gmailSocketTimeoutMs: toNumber(process.env.GMAIL_SOCKET_TIMEOUT_MS || "30000", 30000),
  resendApiKey: process.env.RESEND_API_KEY || "",
  dataFilePath: path.resolve(rootDir, process.env.DATA_FILE || "data/runtime.json")
};
