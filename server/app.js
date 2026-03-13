require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");

const config = require("./config");
const healthRouter = require("./routes/health");
const leadsRouter = require("./routes/leads");
const bookingsRouter = require("./routes/bookings");
const waiversRouter = require("./routes/waivers");
const adminRouter = require("./routes/admin");
const { HttpError } = require("./services/operations");
const { ensureStorageReady } = require("./storage");
const { startReminderWorker } = require("./services/reminders");

const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

app.use("/api/health", healthRouter);
app.use("/api/leads", leadsRouter);
app.use("/api/bookings", bookingsRouter);
app.use("/api/waivers", waiversRouter);
app.use("/api/admin", adminRouter);

const webRoot = path.resolve(__dirname, "..", "web");
app.use(express.static(webRoot));

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(webRoot, "admin.html"));
});

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    next();
    return;
  }

  res.sendFile(path.join(webRoot, "index.html"));
});

app.use((error, _req, res, _next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ ok: false, error: error.message });
    return;
  }

  console.error(error);
  res.status(500).json({ ok: false, error: "Internal server error" });
});

async function start() {
  await ensureStorageReady();
  startReminderWorker();

  app.listen(config.port, () => {
    console.log(`CryoChamber API running on http://localhost:${config.port}`);
    console.log(`Data mode: ${config.dataMode} | CRM provider: ${config.crmProvider} | Booking provider: ${config.bookingProvider} | Reminder provider: ${config.reminderProvider}`);
  });
}

start().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
