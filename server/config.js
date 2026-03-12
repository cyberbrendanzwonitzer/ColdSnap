const path = require("path");

function toBool(value, defaultValue = false) {
  if (typeof value === "undefined") {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
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
  allowOutboundIntegrations: toBool(process.env.ALLOW_OUTBOUND_INTEGRATIONS, false),
  hubspotToken: process.env.HUBSPOT_ACCESS_TOKEN || "",
  goHighLevelApiKey: process.env.GHL_API_KEY || "",
  goHighLevelLocationId: process.env.GHL_LOCATION_ID || "",
  bookingApiKey: process.env.BOOKING_API_KEY || "",
  bookingBaseUrl: process.env.BOOKING_BASE_URL || "",
  dataFilePath: path.resolve(rootDir, process.env.DATA_FILE || "data/runtime.json")
};
